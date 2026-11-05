-- BLINK TARJETA · 0023 · endurecimiento de la sincronización del validador
--
-- Corrige los hallazgos de la auditoría del 2026-11-04 (BLINK-DOC-09):
--   B-62  0022 concedía bt_validador_sincronizar a anon/authenticated.
--   B-63  Se aprobaban viajes sin saldo virtual y sin comprobar tarjeta activa.
--   B-64  Toques sin FOR UPDATE: dos sincronizaciones podían perder un débito.
--   B-65  Montos con decimales que el chip no puede representar.
--   B-66  Los toques rechazados no quedaban registrados en ninguna parte.
--
-- Es idempotente y segura tanto si 0022 ya se aplicó como si no.

-- ------------------------------------------------------------
-- 1. Auditoría de toques rechazados
-- ------------------------------------------------------------
create table if not exists public.validator_rejections (
  id          bigint generated always as identity primary key,
  vehicle_id  uuid not null references public.vehicles(id),
  offline_id  text,
  serial      text,
  motivo      text not null,
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists validator_rejections_vehicle_fecha
  on public.validator_rejections (vehicle_id, created_at desc);

alter table public.validator_rejections enable row level security;
-- Sin políticas: el pasajero y el validador no la leen. Solo entra por la
-- función security definer y sale por service_role (back-office/auditoría).

create or replace function public.bt_validador_rechazo(
  p_vehiculo uuid,
  p_tap jsonb,
  p_motivo text
)
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  insert into public.validator_rejections (vehicle_id, offline_id, serial, motivo, payload)
  values (
    p_vehiculo,
    nullif(p_tap ->> 'offline_id', ''),
    nullif(p_tap ->> 'visible_id', ''),
    p_motivo,
    coalesce(p_tap, '{}'::jsonb)
  );

  return jsonb_build_object(
    'offline_id', p_tap ->> 'offline_id',
    'serial', p_tap ->> 'visible_id',
    'motivo', p_motivo
  );
end;
$$;

-- ------------------------------------------------------------
-- 2. El chip trabaja en bolívares enteros
-- ------------------------------------------------------------
-- `not valid` en tablas con historia: la restricción se exige a las filas
-- nuevas sin romper una instalación que ya tenga datos antiguos.
alter table public.card_transfers
  drop constraint if exists card_transfers_monto_entero;
alter table public.card_transfers
  add constraint card_transfers_monto_entero
  check (monto = trunc(monto));

alter table public.card_adjustments
  drop constraint if exists card_adjustments_monto_entero;
alter table public.card_adjustments
  add constraint card_adjustments_monto_entero
  check (monto = trunc(monto)) not valid;

alter table public.trips_telemetry
  drop constraint if exists trips_telemetry_tarifa_entera;
alter table public.trips_telemetry
  add constraint trips_telemetry_tarifa_entera
  check (fare_charged = trunc(fare_charged)) not valid;

-- ------------------------------------------------------------
-- 3. Sincronización endurecida
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
  select * into v_vehiculo
    from public.vehicles
   where validator_mac = v_mac
     and active;

  if not found then
    raise exception 'Validador no registrado o inactivo: %.', v_mac;
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

  -- 2) Toques: el libro mayor manda. La tarjeta se bloquea con FOR UPDATE
  --    para que dos validadores (o una transferencia simultánea) no pisen
  --    el saldo calculado a partir de una lectura vieja.
  for v_tap in select * from jsonb_array_elements(coalesce(p_taps, '[]'::jsonb)) loop
    v_offline := nullif(trim(coalesce(v_tap ->> 'offline_id', '')), '');

    if v_offline is null then
      v_rechazadas := v_rechazadas || public.bt_validador_rechazo(
        v_vehiculo.id, v_tap, 'Falta offline_id');
      continue;
    end if;

    if exists (select 1 from public.trips_telemetry where offline_id = v_offline) then
      continue;
    end if;

    select * into v_tarjeta
      from public.cards
     where visible_id = trim(coalesce(v_tap ->> 'visible_id', ''))
     for update;

    if not found then
      v_rechazadas := v_rechazadas || public.bt_validador_rechazo(
        v_vehiculo.id, v_tap, 'Tarjeta desconocida');
      continue;
    end if;

    if v_tarjeta.status <> 'ACTIVE' then
      v_rechazadas := v_rechazadas || public.bt_validador_rechazo(
        v_vehiculo.id, v_tap, 'Tarjeta no activa');
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

    if v_fare <> trunc(v_fare) then
      v_rechazadas := v_rechazadas || public.bt_validador_rechazo(
        v_vehiculo.id, v_tap, 'Tarifa con decimales');
      continue;
    end if;

    v_creditos := public.bt_creditos_pendientes(v_tarjeta.id);

    v_chip := coalesce(
      nullif(v_tap ->> 'chip_balance_after', '')::numeric,
      greatest(v_tarjeta.last_chip_balance - v_fare, 0)
    );

    if v_chip < 0 or v_chip <> trunc(v_chip) then
      v_rechazadas := v_rechazadas || public.bt_validador_rechazo(
        v_vehiculo.id, v_tap, 'Saldo del chip inválido');
      continue;
    end if;

    -- El chip no puede tener más que lo último confirmado más los
    -- créditos pendientes. Un salto mayor sería un intento de inflar
    -- el saldo desde un validador o un chip manipulado.
    if v_chip > v_tarjeta.last_chip_balance + v_creditos + 0.01 then
      v_rechazadas := v_rechazadas || public.bt_validador_rechazo(
        v_vehiculo.id, v_tap, 'Saldo del chip fuera de rango');
      continue;
    end if;

    -- Sin saldo virtual no hay viaje aprobado: antes el saldo quedaba en
    -- cero pero el viaje y su tarifa entraban igualmente a liquidación.
    if v_tarjeta.virtual_balance < v_fare then
      v_rechazadas := v_rechazadas || public.bt_validador_rechazo(
        v_vehiculo.id, v_tap, 'Saldo virtual insuficiente');
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
             -- Un monto con decimales no se puede escribir en el value
             -- block: queda en la nube para revisión, no se redondea.
             and coalesce(r.monto_base, r.amount) = trunc(coalesce(r.monto_base, r.amount))
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
             and a.monto = trunc(a.monto)
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
-- 4. Permisos: la función interna vuelve a ser solo de servidor
-- ------------------------------------------------------------
revoke all on function public.bt_validador_rechazo(uuid, jsonb, text)
  from public, anon, authenticated;
revoke all on function public.bt_validador_sincronizar(text, jsonb, jsonb)
  from public, anon, authenticated;

grant execute on function public.bt_validador_sincronizar(text, jsonb, jsonb)
  to service_role;

-- El validador real entra por el token de 0004, nunca por la MAC sola.
grant execute on function public.bt_validador_sincronizar_token(text, jsonb, jsonb)
  to anon, authenticated;

-- ------------------------------------------------------------
-- 5. Transferencias solo en bolívares enteros (B-65)
-- ------------------------------------------------------------
-- Se reproduce íntegra la función de 0022 con el control de decimales
-- cambiado: antes aceptaba dos decimales (12,50 Bs) y el adjustment con
-- céntimos nunca llegaba al chip, así que el saldo virtual y el plástico
-- quedaban separados para siempre. El límite de la tabla
-- `card_transfers_monto_entero` respalda el mismo criterio.
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

  -- El value block de MIFARE guarda enteros: un saldo con decimales no se
  -- puede escribir en el chip y la nube y el plástico dejarían de coincidir.
  if v_monto <> trunc(v_monto) then
    return jsonb_build_object(
      'error', 'datos',
      'mensaje', 'Transfiere solo bolívares enteros, sin céntimos.');
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

grant execute on function public.bt_transferir_saldo(text, text, text, numeric, text, uuid)
  to anon, authenticated;
