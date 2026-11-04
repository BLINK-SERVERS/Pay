-- ============================================================
-- BLINK · transferencia de saldo entre tarjetas
-- Ejecutar después de 0021_endurece_acceso.sql.
--
-- Dos tarjetas enroladas y activas pueden moverse saldo entre sí,
-- con PIN de la cuenta, tope por operación y tope diario. La
-- transferencia es 1:1 en bolívares: no cobra comisión ni cambia la
-- tarifa de cada plástico (cada tarjeta sigue comprando pasajes a su
-- propia tarifa).
--
-- Contabilidad:
--   * `card_transfers` guarda el comprobante y la clave de
--     idempotencia (un reintento devuelve el mismo resultado).
--   * `card_adjustments` guarda el movimiento firmado que el chip
--     debe aplicar: salida negativa en el origen, entrada positiva en
--     el destino.
--   * `virtual_balance` es el libro mayor del servidor; se ajusta en
--     la misma transacción. `last_chip_balance` es lo último que el
--     validador confirmó en el plástico.
--
-- El firmware v9 solo aplica créditos positivos. Un ajuste negativo
-- queda pendiente y el saldo virtual ya está descontado, así que el
-- plástico del emisor conserva físicamente el importe hasta que un
-- firmware con débitos lo aplique (riesgo residual R-27, acotado por
-- los topes y el PIN). Los ajustes negativos se envían igual para
-- que un validador v10 pueda aplicarlos y acusarlos.
--
-- También reescribe `bt_validador_sincronizar` para que un toque no
-- sobrescriba el saldo virtual con `chip_balance_after`: el libro
-- mayor manda y el chip solo acota transferencias y detecta saltos
-- imposibles. Antes, una recarga aprobada y aún no entregada se
-- perdía en el siguiente toque.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Permisos nuevos del movimiento
-- ------------------------------------------------------------
alter table public.card_movements
  drop constraint if exists card_movements_tipo_check;
alter table public.card_movements
  add constraint card_movements_tipo_check
  check (tipo in ('recarga', 'viaje', 'devolucion', 'ajuste', 'transferencia'));

-- ------------------------------------------------------------
-- 2. Topes publicados
-- ------------------------------------------------------------
update public.settings
   set valor = jsonb_build_object(
         'topeTransferencia', 5000,
         'topeTransferenciaDiario', 20000
       ) || valor,
       actualizada = now()
 where clave = 'publico';

create or replace function public.bt_tope_transferencia()
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(
    (select (valor ->> 'topeTransferencia')::numeric
       from public.settings where clave = 'publico'),
    5000
  );
$$;

create or replace function public.bt_tope_transferencia_diario()
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(
    (select (valor ->> 'topeTransferenciaDiario')::numeric
       from public.settings where clave = 'publico'),
    20000
  );
$$;

-- ------------------------------------------------------------
-- 3. Comprobantes y ajustes de chip
-- ------------------------------------------------------------
create table if not exists public.card_transfers (
  id            uuid primary key default gen_random_uuid(),
  clave         uuid not null unique,
  cuenta_id     uuid not null references public.accounts(id) on delete restrict,
  origen_id     uuid not null references public.cards(id) on delete restrict,
  destino_id    uuid not null references public.cards(id) on delete restrict,
  monto         numeric(12,2) not null check (monto > 0),
  origen_saldo  numeric(12,2) not null check (origen_saldo >= 0),
  destino_saldo numeric(12,2) not null check (destino_saldo >= 0),
  at            timestamptz not null default now(),
  constraint card_transfers_distintas check (origen_id <> destino_id)
);

create index if not exists card_transfers_cuenta_idx
  on public.card_transfers (cuenta_id, at desc);
create index if not exists card_transfers_origen_idx
  on public.card_transfers (origen_id, at desc);
create index if not exists card_transfers_destino_idx
  on public.card_transfers (destino_id, at desc);

create table if not exists public.card_adjustments (
  id             uuid primary key default gen_random_uuid(),
  card_id        uuid not null references public.cards(id) on delete cascade,
  transfer_id    uuid references public.card_transfers(id) on delete cascade,
  monto          numeric(12,2) not null check (monto <> 0),
  motivo         text not null default 'transferencia',
  synced_to_chip boolean not null default false,
  synced_at      timestamptz,
  created_at     timestamptz not null default now()
);

create index if not exists card_adjustments_pendientes_idx
  on public.card_adjustments (card_id, synced_to_chip, created_at);

alter table public.card_transfers enable row level security;
alter table public.card_adjustments enable row level security;

revoke all on table public.card_transfers from anon, authenticated;
revoke all on table public.card_adjustments from anon, authenticated;

-- Las tarjetas anteriores a 0020 pueden tener `last_chip_balance` en 0
-- aunque su saldo ya estaba en el plástico. Se inicializa con el libro
-- mayor menos lo que aún no se entregó, para no bloquear transferencias
-- legítimas hasta el primer toque.
update public.cards c
   set last_chip_balance = greatest(
         c.virtual_balance - coalesce((
           select sum(coalesce(r.monto_base, r.amount))
             from public.recharges r
            where r.card_id = c.id
              and r.status = 'aprobado'
              and not r.synced_to_chip
         ), 0),
         0
       )
 where c.last_chip_balance = 0
   and c.virtual_balance > 0;

-- ------------------------------------------------------------
-- 4. Utilidades internas
-- ------------------------------------------------------------
create or replace function public.bt_creditos_pendientes(p_card uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select
    coalesce((
      select sum(coalesce(r.monto_base, r.amount))
        from public.recharges r
       where r.card_id = p_card
         and r.status = 'aprobado'
         and not r.synced_to_chip
    ), 0)
    + coalesce((
      select sum(a.monto)
        from public.card_adjustments a
       where a.card_id = p_card
         and not a.synced_to_chip
         and a.monto > 0
    ), 0);
$$;

create or replace function public.bt_debitos_pendientes(p_card uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce((
    select -sum(a.monto)
      from public.card_adjustments a
     where a.card_id = p_card
       and not a.synced_to_chip
       and a.monto < 0
  ), 0);
$$;

-- Bs que la tarjeta puede transferir ahora: ni créditos que aún no
-- están en el chip, ni deudas que ya prometió a otra tarjeta.
create or replace function public.bt_disponible_transferencia(p_card public.cards)
returns numeric language sql stable security definer set search_path = public as $$
  select greatest(
    least(
      p_card.virtual_balance - public.bt_creditos_pendientes(p_card.id),
      p_card.last_chip_balance - public.bt_debitos_pendientes(p_card.id)
    ),
    0
  );
$$;

create or replace function public.bt_titular_mascarado(p_nombre text)
returns text language sql immutable as $$
  select case
    when coalesce(trim(p_nombre), '') = '' then 'Titular de la tarjeta'
    else split_part(trim(p_nombre), ' ', 1) || ' ' ||
         left(regexp_replace(trim(p_nombre), '^.*\s+', ''), 1) || '.'
  end;
$$;

create or replace function public.bt_transferencia_json(t public.card_transfers)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', t.id,
    'clave', t.clave,
    'monto', t.monto,
    'at', t.at,
    'origen', jsonb_build_object(
      'serial', o.visible_id,
      'saldo', t.origen_saldo),
    'destino', jsonb_build_object(
      'serial', d.visible_id,
      'titular', public.bt_titular_mascarado(d.nombre),
      'saldo', t.destino_saldo)
  )
  from public.cards o, public.cards d
  where o.id = t.origen_id
    and d.id = t.destino_id;
$$;

-- ------------------------------------------------------------
-- 5. Transferir saldo
-- ------------------------------------------------------------
create or replace function public.bt_transferir_saldo(
  p_token text,
  p_origen text,
  p_destino text,
  p_monto numeric,
  p_pin text,
  p_clave uuid
)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_cuenta     public.accounts := public.bt_sesion_cuenta(p_token);
  v_origen     public.cards := public.bt_tarjeta_de_cuenta(v_cuenta, p_origen);
  v_destino    public.cards;
  v_monto      numeric := round(coalesce(p_monto, 0), 2);
  v_tope       numeric := public.bt_tope_transferencia();
  v_tope_dia   numeric := public.bt_tope_transferencia_diario();
  v_usado_dia  numeric;
  v_disponible numeric;
  v_clave      uuid := p_clave;
  v_previa     public.card_transfers;
  v_fallos     int;
  v_saldo_o    numeric;
  v_saldo_d    numeric;
  v_transfer   public.card_transfers;
  v_mov_o      public.card_movements;
  v_mov_d      public.card_movements;
  v_mascara_o  text;
  v_mascara_d  text;
begin
  if v_clave is null then
    return jsonb_build_object(
      'error', 'datos',
      'mensaje', 'No pudimos identificar esta operación. Vuelve a intentarlo.');
  end if;

  -- Bloquea la cuenta para que el PIN y sus intentos no se mezclen con
  -- otro cambio de PIN o acceso simultáneo.
  select * into v_cuenta
    from public.accounts
   where id = v_cuenta.id
     for update;

  if v_cuenta.bloqueado_hasta is not null and v_cuenta.bloqueado_hasta > now() then
    return jsonb_build_object(
      'error', 'credenciales',
      'mensaje', format(
        'Demasiados intentos fallidos. Espera %s min o recupera tu PIN en atención al cliente.',
        greatest(1, ceil(extract(epoch from (v_cuenta.bloqueado_hasta - now())) / 60)::int)
      )
    );
  end if;

  if extensions.crypt(coalesce(p_pin, ''), v_cuenta.pin_hash) <> v_cuenta.pin_hash then
    v_fallos := case
      when v_cuenta.bloqueado_hasta is not null and v_cuenta.bloqueado_hasta <= now() then 1
      else v_cuenta.intentos + 1
    end;

    update public.accounts
       set intentos = v_fallos,
           bloqueado_hasta = case when v_fallos >= 5 then now() + interval '5 minutes' end
     where id = v_cuenta.id;

    if v_fallos >= 5 then
      return jsonb_build_object(
        'error', 'credenciales',
        'mensaje', 'Demasiados intentos fallidos. Espera 5 min o recupera tu PIN en atención al cliente.'
      );
    end if;

    return jsonb_build_object(
      'error', 'credenciales',
      'mensaje', 'El PIN no coincide. Inténtalo de nuevo.'
    );
  end if;

  update public.accounts
     set intentos = 0, bloqueado_hasta = null
   where id = v_cuenta.id;

  -- Idempotencia: el mismo comprobante no se aplica dos veces.
  select * into v_previa from public.card_transfers where clave = v_clave;

  if found then
    if v_previa.cuenta_id <> v_cuenta.id then
      return jsonb_build_object(
        'error', 'duplicada',
        'mensaje', 'Esa operación ya fue registrada. Revisa Movimientos.');
    end if;

    return jsonb_build_object(
      'transferencia', public.bt_transferencia_json(v_previa),
      'repetida', true
    );
  end if;

  if v_monto <= 0 then
    return jsonb_build_object(
      'error', 'datos',
      'mensaje', 'Escribe un monto mayor que cero.');
  end if;

  if v_monto <> coalesce(p_monto, 0) then
    return jsonb_build_object(
      'error', 'datos',
      'mensaje', 'Usa como máximo dos decimales.');
  end if;

  if v_monto > v_tope then
    return jsonb_build_object(
      'error', 'datos',
      'mensaje', format(
        'El tope por transferencia es %s Bs. Divide el monto en varias operaciones.',
        trim(to_char(round(v_tope), 'FM999999999')))
    );
  end if;

  if v_origen.visible_id = upper(trim(coalesce(p_destino, ''))) then
    return jsonb_build_object(
      'error', 'datos',
      'mensaje', 'Elige una tarjeta distinta a la de origen.');
  end if;

  select * into v_destino
    from public.cards
   where visible_id = upper(trim(coalesce(p_destino, '')));

  if not found then
    return jsonb_build_object(
      'error', 'sin-tarjeta',
      'mensaje', 'No encontramos la tarjeta de destino. Revisa el serial.');
  end if;

  -- Bloquea ambas tarjetas siempre en el mismo orden para que dos
  -- transferencias cruzadas no se queden esperando una a la otra.
  perform 1
    from public.cards
   where id in (v_origen.id, v_destino.id)
   order by id
     for update;

  select * into v_origen from public.cards where id = v_origen.id;
  select * into v_destino from public.cards where id = v_destino.id;

  if v_origen.status <> 'ACTIVE' or not public.bt_tarjeta_vigente(v_origen) then
    return jsonb_build_object(
      'error', 'bloqueada',
      'mensaje', 'Tu tarjeta de origen no está activa. No se puede transferir.');
  end if;

  if v_destino.chip_uid is null then
    return jsonb_build_object(
      'error', 'sin-enrolar',
      'mensaje', 'La tarjeta de destino todavía no está enrolada.');
  end if;

  if v_destino.status <> 'ACTIVE' or not public.bt_tarjeta_vigente(v_destino) then
    return jsonb_build_object(
      'error', 'bloqueada',
      'mensaje', 'La tarjeta de destino no está activa. No se puede transferir.');
  end if;

  if v_destino.account_id is null then
    return jsonb_build_object(
      'error', 'sin-tarjeta',
      'mensaje', 'La tarjeta de destino no está vinculada a una cuenta. Pídele al titular que la vincule.');
  end if;

  select coalesce(sum(t.monto), 0)
    into v_usado_dia
    from public.card_transfers t
   where t.cuenta_id = v_cuenta.id
     and t.at > now() - interval '24 hours';

  if v_usado_dia + v_monto > v_tope_dia then
    return jsonb_build_object(
      'error', 'datos',
      'mensaje', format(
        'El tope diario para transferir es %s Bs. Ya usaste %s Bs en las últimas 24 horas.',
        trim(to_char(round(v_tope_dia), 'FM999999999')),
        trim(to_char(round(v_usado_dia, 2), 'FM999999999.00')))
    );
  end if;

  v_disponible := public.bt_disponible_transferencia(v_origen);

  if v_monto > v_disponible then
    return jsonb_build_object(
      'error', 'datos',
      'mensaje', format(
        'Solo puedes transferir %s Bs de esta tarjeta. Las recargas recién aprobadas se habilitan cuando el validador las escribe en el plástico.',
        trim(to_char(round(v_disponible, 2), 'FM999999999.00')))
    );
  end if;

  insert into public.card_transfers
    (clave, cuenta_id, origen_id, destino_id, monto, origen_saldo, destino_saldo)
  values
    (v_clave, v_cuenta.id, v_origen.id, v_destino.id, v_monto,
     v_origen.virtual_balance, v_destino.virtual_balance)
  returning * into v_transfer;

  insert into public.card_adjustments (card_id, transfer_id, monto, motivo)
  values
    (v_origen.id, v_transfer.id, -v_monto, 'transferencia-enviada'),
    (v_destino.id, v_transfer.id, v_monto, 'transferencia-recibida');

  update public.cards
     set virtual_balance = virtual_balance - v_monto
   where id = v_origen.id
  returning virtual_balance into v_saldo_o;

  update public.cards
     set virtual_balance = virtual_balance + v_monto
   where id = v_destino.id
  returning virtual_balance into v_saldo_d;

  v_mascara_o := right(regexp_replace(v_origen.visible_id, '\D', '', 'g'), 4);
  v_mascara_d := right(regexp_replace(v_destino.visible_id, '\D', '', 'g'), 4);

  insert into public.card_movements
    (card_id, tipo, monto, saldo_despues, detalle, estado)
  values
    (v_origen.id, 'transferencia', -v_monto, v_saldo_o,
     format('Transferencia a la tarjeta terminada en %s', v_mascara_d), 'aprobado')
  returning * into v_mov_o;

  insert into public.card_movements
    (card_id, tipo, monto, saldo_despues, detalle, estado)
  values
    (v_destino.id, 'transferencia', v_monto, v_saldo_d,
     format('Transferencia recibida de la tarjeta terminada en %s', v_mascara_o), 'aprobado')
  returning * into v_mov_d;

  update public.card_transfers
     set origen_saldo = v_saldo_o,
         destino_saldo = v_saldo_d
   where id = v_transfer.id
  returning * into v_transfer;

  return jsonb_build_object(
    'transferencia', public.bt_transferencia_json(v_transfer),
    'movimiento', public.bt_movimiento_json(v_mov_o, v_origen.visible_id),
    'repetida', false
  );
end;
$$;

-- ------------------------------------------------------------
-- 6. Sincronización del validador con ajustes firmados
-- ------------------------------------------------------------
create or replace function public.bt_validador_sincronizar(
  p_validator_mac text,
  p_taps jsonb default '[]'::jsonb,
  p_recargas jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_mac        text := public.bt_normalizar_mac(p_validator_mac);
  v_vehiculo   public.vehicles;
  v_tap        jsonb;
  v_ack        jsonb;
  v_tarjeta    public.cards;
  v_offline    text;
  v_fare       numeric;
  v_fare_ruta  numeric;
  v_saldo      numeric;
  v_chip       numeric;
  v_creditos   numeric;
  v_tap_id     uuid;
  v_ack_id     uuid;
  v_card_id    uuid;
  v_monto      numeric;
  v_rechazadas jsonb := '[]'::jsonb;
  v_procesadas int := 0;
begin
  select * into v_vehiculo from public.vehicles where validator_mac = v_mac;

  if not found then
    raise exception 'Validador no registrado: %.', v_mac;
  end if;

  -- 1) Acuses primero: lo que el validador ya escribió en el chip.
  --    Así `last_chip_balance` queda al día antes de interpretar toques.
  for v_ack in select * from jsonb_array_elements(coalesce(p_recargas, '[]'::jsonb)) loop
    v_ack_id := null;
    begin
      v_ack_id := coalesce(
        nullif(v_ack ->> 'id', ''),
        v_ack #>> '{}'
      )::uuid;
    exception when others then
      v_ack_id := null;
    end;

    if v_ack_id is null then
      continue;
    end if;

    v_card_id := null;
    v_monto := 0;

    update public.recharges
       set synced_to_chip = true, synced_at = now()
     where id = v_ack_id
       and status = 'aprobado'
       and not synced_to_chip
    returning card_id, coalesce(monto_base, amount) into v_card_id, v_monto;

    if v_card_id is not null then
      update public.cards
         set last_chip_balance = greatest(last_chip_balance + v_monto, 0)
       where id = v_card_id;
      continue;
    end if;

    v_card_id := null;
    v_monto := 0;

    update public.card_adjustments
       set synced_to_chip = true, synced_at = now()
     where id = v_ack_id
       and not synced_to_chip
    returning card_id, monto into v_card_id, v_monto;

    if v_card_id is not null then
      update public.cards
         set last_chip_balance = greatest(last_chip_balance + v_monto, 0)
       where id = v_card_id;
    end if;
  end loop;

  -- 2) Toques: el libro mayor manda. El chip solo se usa para acotar
  --    saltos imposibles y para actualizar lo que el plástico muestra.
  for v_tap in select * from jsonb_array_elements(coalesce(p_taps, '[]'::jsonb)) loop
    v_offline := nullif(trim(coalesce(v_tap ->> 'offline_id', '')), '');

    if v_offline is null then
      v_rechazadas := v_rechazadas || jsonb_build_object(
        'serial', v_tap ->> 'visible_id', 'motivo', 'Falta offline_id'
      );
      continue;
    end if;

    if exists (select 1 from public.trips_telemetry where offline_id = v_offline) then
      continue;
    end if;

    select * into v_tarjeta
      from public.cards
     where visible_id = trim(coalesce(v_tap ->> 'visible_id', ''));

    if not found then
      v_rechazadas := v_rechazadas || jsonb_build_object(
        'serial', v_tap ->> 'visible_id', 'motivo', 'Tarjeta desconocida'
      );
      continue;
    end if;

    select case when v_tarjeta.fare_type = 2 then r.student_fare else r.general_fare end
      into v_fare_ruta
      from public.transit_routes r
     where r.id = v_vehiculo.route_id;

    v_fare_ruta := coalesce(v_fare_ruta, v_tarjeta.tarifa);
    v_fare := coalesce(nullif(v_tap ->> 'fare_charged', '')::numeric, v_fare_ruta);
    -- Un validador comprometido no puede cobrar más que la tarifa de
    -- la ruta configurada; tampoco puede inventar un cobro negativo.
    v_fare := least(greatest(v_fare, 0), v_fare_ruta);

    v_creditos := public.bt_creditos_pendientes(v_tarjeta.id);

    v_chip := coalesce(
      nullif(v_tap ->> 'chip_balance_after', '')::numeric,
      greatest(v_tarjeta.last_chip_balance - v_fare, 0)
    );

    if v_chip < 0 then
      v_rechazadas := v_rechazadas || jsonb_build_object(
        'serial', v_tarjeta.visible_id, 'motivo', 'Saldo del chip inválido'
      );
      continue;
    end if;

    -- El chip no puede tener más que lo último confirmado más los
    -- créditos pendientes. Un salto mayor sería un intento de inflar
    -- el saldo desde un validador o un chip manipulado.
    if v_chip > v_tarjeta.last_chip_balance + v_creditos + 0.01 then
      v_rechazadas := v_rechazadas || jsonb_build_object(
        'serial', v_tarjeta.visible_id, 'motivo', 'Saldo del chip fuera de rango'
      );
      continue;
    end if;

    v_saldo := greatest(v_tarjeta.virtual_balance - v_fare, 0);

    insert into public.trips_telemetry
      (card_id, vehicle_id, route_id, fare_charged, fare_type, latitude, longitude,
       validator_mac, offline_id, chip_balance_after, tapped_at)
    values
      (v_tarjeta.id, v_vehiculo.id, v_vehiculo.route_id, v_fare,
       coalesce((v_tap ->> 'fare_type')::smallint, v_tarjeta.fare_type),
       nullif(v_tap ->> 'latitude', '')::double precision,
       nullif(v_tap ->> 'longitude', '')::double precision,
       v_mac, v_offline, v_chip,
       coalesce(nullif(v_tap ->> 'tapped_at', '')::timestamptz, now()))
    returning id into v_tap_id;

    insert into public.card_movements
      (card_id, tipo, monto, saldo_despues, detalle, estado, unidad, at)
    values
      (v_tarjeta.id, 'viaje', -v_fare, v_saldo,
       'Pasaje en ' || v_vehiculo.plate_number, 'aprobado', v_vehiculo.plate_number,
       coalesce(nullif(v_tap ->> 'tapped_at', '')::timestamptz, now()));

    update public.cards
       set virtual_balance = v_saldo,
           last_chip_balance = greatest(v_chip - v_creditos, 0)
     where id = v_tarjeta.id;

    v_tarjeta.virtual_balance := v_saldo;
    v_tarjeta.last_chip_balance := greatest(v_chip - v_creditos, 0);
    v_procesadas := v_procesadas + 1;
  end loop;

  return jsonb_build_object(
    'validador', jsonb_build_object(
      'mac', v_mac,
      'placa', v_vehiculo.plate_number,
      'ruta', v_vehiculo.route_id
    ),
    'procesadas', v_procesadas,
    'rechazadas', v_rechazadas,
    'pendientes', coalesce((
      select jsonb_agg(p order by p ->> 'acreditada')
        from (
          select jsonb_build_object(
                   'id', r.id,
                   'serial', c.visible_id,
                   'uid', c.chip_uid,
                   'monto', coalesce(r.monto_base, r.amount),
                   'acreditada', r.created_at
                 ) as p
            from public.recharges r
            join public.cards c on c.id = r.card_id
           where r.status = 'aprobado'
             and not r.synced_to_chip
             and c.chip_uid is not null
             and c.status = 'ACTIVE'
          union all
          select jsonb_build_object(
                   'id', a.id,
                   'serial', c.visible_id,
                   'uid', c.chip_uid,
                   'monto', a.monto,
                   'acreditada', a.created_at
                 ) as p
            from public.card_adjustments a
            join public.cards c on c.id = a.card_id
           where not a.synced_to_chip
             and c.chip_uid is not null
             and c.status = 'ACTIVE'
        ) pendientes
    ), '[]'::jsonb),
    'bloqueadas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'serial', c.visible_id,
               'uid', c.chip_uid,
               'estado', c.status
             ))
        from public.cards c
       where c.status <> 'ACTIVE'
    ), '[]'::jsonb)
  );
end;
$$;

-- ------------------------------------------------------------
-- 7. Permisos
-- ------------------------------------------------------------
revoke all on function public.bt_tope_transferencia() from public, anon, authenticated;
revoke all on function public.bt_tope_transferencia_diario() from public, anon, authenticated;
revoke all on function public.bt_creditos_pendientes(uuid) from public, anon, authenticated;
revoke all on function public.bt_debitos_pendientes(uuid) from public, anon, authenticated;
revoke all on function public.bt_disponible_transferencia(public.cards) from public, anon, authenticated;
revoke all on function public.bt_titular_mascarado(text) from public, anon, authenticated;
revoke all on function public.bt_transferencia_json(public.card_transfers) from public, anon, authenticated;
revoke all on function public.bt_transferir_saldo(text, text, text, numeric, text, uuid)
  from public, anon, authenticated;
revoke all on function public.bt_validador_sincronizar(text, jsonb, jsonb)
  from public, anon, authenticated;

grant execute on function public.bt_transferir_saldo(text, text, text, numeric, text, uuid)
  to anon, authenticated;
grant execute on function public.bt_validador_sincronizar(text, jsonb, jsonb)
  to anon, authenticated;
