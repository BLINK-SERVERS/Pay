-- BLINK PAY · 0025 · escudo del validador y bitácora particionada
--
-- Implementa QODER-BLINK-BANKING-SEC-2026:
--   §1.2  bitácora de transacciones particionada por mes.
--   §2    idempotencia obligatoria en UUID v4 por cada toque del ESP32.
--   §3    firma HMAC-SHA256 por equipo, ventana de 30 s y antirrepetición.
--
-- El saldo sigue viviendo en `cards.virtual_balance` (§1.1) y cada débito
-- se hace con `FOR UPDATE`; esta migración no toca esa parte.
--
-- Es idempotente: puede aplicarse sobre una base que ya la tenga.

-- ------------------------------------------------------------
-- 1. Idempotencia en UUID v4
-- ------------------------------------------------------------
alter table public.trips_telemetry
  add column if not exists idempotency_key uuid;

-- Filas anteriores: si el offline_id ya era un UUID v4 se conserva tal cual;
-- si no, se deriva un UUID v4 estable del texto para no perder el histórico.
update public.trips_telemetry
   set idempotency_key = case
         when offline_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
           then offline_id::uuid
         else overlay(
                overlay(md5(offline_id) placing '4' from 13 for 1)
                placing '8' from 17 for 1)::uuid
       end
 where idempotency_key is null;

create unique index if not exists trips_telemetry_idempotencia_idx
  on public.trips_telemetry (idempotency_key);

comment on column public.trips_telemetry.idempotency_key is
  'Clave de idempotencia UUID v4 del toque físico; única en todo el sistema.';

-- La clave de texto acompaña a la UUID en el histórico. Sin esto, cualquier
-- liquidación que actualice una fila vieja volvería a validar el CHECK y la
-- migración rompería el cierre de viajes ya registrados.
update public.trips_telemetry
   set offline_id = idempotency_key::text
 where offline_id <> idempotency_key::text;

-- Los toques nuevos deben traer un UUID v4. La restricción se valida sobre
-- todo el histórico porque las filas viejas acaban de normalizarse.
alter table public.trips_telemetry
  drop constraint if exists trips_telemetry_idempotencia_v4;
alter table public.trips_telemetry
  add constraint trips_telemetry_idempotencia_v4
  check (offline_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$');

-- El extracto guarda la misma clave para poder cruzar el recibo con el
-- toque del validador sin duplicar la fila de auditoría.
alter table public.card_movements
  add column if not exists idempotency_key uuid;

create unique index if not exists card_movements_idempotencia_idx
  on public.card_movements (idempotency_key)
  where idempotency_key is not null;

-- ------------------------------------------------------------
-- 2. Bitácora particionada por mes
-- ------------------------------------------------------------
create table if not exists public.transactions_log (
  id              uuid not null default gen_random_uuid(),
  at              timestamptz not null,
  movimiento_id   uuid not null,
  card_id         uuid,
  vehicle_id      uuid,
  tipo            text not null,
  monto           numeric not null,
  saldo_despues   numeric not null,
  estado          text not null,
  detalle         text,
  referencia      text,
  idempotency_key uuid,
  registrada_at   timestamptz not null default now(),
  primary key (id, at)
) partition by range (at);

comment on table public.transactions_log is
  'Bitácora inmutable de movimientos de dinero, particionada por mes (QODER-BLINK-BANKING-SEC-2026 §1.2).';

create index if not exists transactions_log_card_idx
  on public.transactions_log (card_id, at desc);
create index if not exists transactions_log_tipo_idx
  on public.transactions_log (tipo, at desc);
create index if not exists transactions_log_movimiento_idx
  on public.transactions_log (movimiento_id);

-- Sin políticas: solo escriben las funciones security definer y lee el
-- back-office con service_role.
alter table public.transactions_log enable row level security;

-- Red de seguridad: lo que caiga fuera de los meses creados se guarda aquí
-- en vez de perderse. Debe quedar vacía antes de crear una partición nueva.
create table if not exists public.transactions_log_default
  partition of public.transactions_log default;

-- Crea la partición del mes de `p_at` si no existe.
create or replace function public.bt_asegurar_particion(p_at timestamptz)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_desde  timestamptz := date_trunc('month', coalesce(p_at, now()));
  v_hasta  timestamptz := v_desde + interval '1 month';
  v_nombre text := 'transactions_log_' || to_char(v_desde, 'YYYY_MM');
begin
  if to_regclass('public.' || v_nombre) is null then
    execute format(
      'create table if not exists public.%I partition of public.transactions_log
         for values from (%L) to (%L)',
      v_nombre, v_desde, v_hasta);
  end if;
end;
$$;

-- Cada movimiento de dinero entra dos veces en la vida del sistema: una en
-- el extracto (`card_movements`, que lee el pasajero) y otra en la bitácora
-- particionada. El disparador mantiene las dos sincronizadas.
create or replace function public.bt_bitacora_movimiento()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_vehicle uuid;
begin
  select coalesce(
           (select t.vehicle_id
              from public.trips_telemetry t
             where t.movement_id = new.id
             limit 1),
           (select v.id
              from public.vehicles v
             where v.plate_number = new.unidad
             limit 1))
    into v_vehicle;

  perform public.bt_asegurar_particion(new.at);

  insert into public.transactions_log
    (at, movimiento_id, card_id, vehicle_id, tipo, monto, saldo_despues,
     estado, detalle, referencia, idempotency_key)
  values
    (new.at, new.id, new.card_id, v_vehicle, new.tipo, new.monto,
     new.saldo_despues, new.estado, new.detalle, new.referencia,
     new.idempotency_key);

  return new;
end;
$$;

drop trigger if exists card_movements_bitacora on public.card_movements;
create trigger card_movements_bitacora
  after insert on public.card_movements
  for each row execute function public.bt_bitacora_movimiento();

-- Aprobar o rechazar una recarga cambia el estado, el saldo resultante y el
-- detalle del movimiento. La bitácora no puede quedarse con la foto del
-- momento en que se creó: un rechazo figuraría como dinero pendiente.
create or replace function public.bt_bitacora_actualiza()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.transactions_log
     set monto         = new.monto,
         saldo_despues = new.saldo_despues,
         estado        = new.estado,
         detalle       = new.detalle,
         referencia    = new.referencia
   where movimiento_id = new.id;

  return new;
end;
$$;

drop trigger if exists card_movements_bitacora_estado on public.card_movements;
create trigger card_movements_bitacora_estado
  after update of estado, monto, saldo_despues, detalle, referencia
  on public.card_movements
  for each row execute function public.bt_bitacora_actualiza();

-- Meses de arranque, desde el movimiento más viejo hasta fin de 2027.
-- Se crean antes de copiar el histórico: un mes con filas en la partición
-- por defecto ya no se puede separar.
do $$
declare
  v_desde timestamptz;
  v_mes   date;
begin
  select date_trunc('month', coalesce(min(at), now()))
    into v_desde
    from public.card_movements;

  v_mes := v_desde::date;

  while v_mes < date '2028-01-01' loop
    perform public.bt_asegurar_particion(v_mes::timestamptz);
    v_mes := (v_mes + interval '1 month')::date;
  end loop;
end;
$$;

-- Histórico: lo que ya estaba en el extracto entra en la bitácora una vez.
insert into public.transactions_log
  (at, movimiento_id, card_id, tipo, monto, saldo_despues, estado,
   detalle, referencia, idempotency_key, registrada_at)
select m.at, m.id, m.card_id, m.tipo, m.monto, m.saldo_despues, m.estado,
       m.detalle, m.referencia, m.idempotency_key, m.at
  from public.card_movements m
 where not exists (
         select 1 from public.transactions_log l
          where l.movimiento_id = m.id);

-- ------------------------------------------------------------
-- 3. Sincronización: exige UUID v4 y enlaza el recibo con el toque
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
  v_clave      uuid;
  v_fare       numeric;
  v_fare_ruta  numeric;
  v_saldo      numeric;
  v_chip       numeric;
  v_creditos   numeric;
  v_tap_id     uuid;
  v_mov_id     uuid;
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

  -- 2) Toques: el libro mayor manda. La tarjeta se bloquea con FOR UPDATE.
  for v_tap in select * from jsonb_array_elements(coalesce(p_taps, '[]'::jsonb)) loop
    v_offline := nullif(trim(coalesce(v_tap ->> 'offline_id', '')), '');

    if v_offline is null then
      v_rechazadas := v_rechazadas || public.bt_validador_rechazo(
        v_vehiculo.id, v_tap, 'Falta offline_id');
      continue;
    end if;

    -- §2: la clave del toque debe ser un UUID v4. Un texto libre no sirve
    -- como idempotencia porque dos equipos podrían repetirlo.
    if v_offline !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      v_rechazadas := v_rechazadas || public.bt_validador_rechazo(
        v_vehiculo.id, v_tap, 'Clave de idempotencia inválida (UUID v4)');
      continue;
    end if;

    v_clave := v_offline::uuid;

    if exists (select 1 from public.trips_telemetry where idempotency_key = v_clave) then
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

    if v_chip > v_tarjeta.last_chip_balance + v_creditos + 0.01 then
      v_rechazadas := v_rechazadas || public.bt_validador_rechazo(
        v_vehiculo.id, v_tap, 'Saldo del chip fuera de rango');
      continue;
    end if;

    if v_tarjeta.virtual_balance < v_fare then
      v_rechazadas := v_rechazadas || public.bt_validador_rechazo(
        v_vehiculo.id, v_tap, 'Saldo virtual insuficiente');
      continue;
    end if;

    v_saldo := greatest(v_tarjeta.virtual_balance - v_fare, 0);

    insert into public.trips_telemetry
      (card_id, vehicle_id, route_id, fare_charged, fare_type, latitude, longitude,
       validator_mac, offline_id, idempotency_key, chip_balance_after, tapped_at)
    values
      (v_tarjeta.id, v_vehiculo.id, v_vehiculo.route_id, v_fare,
       coalesce((v_tap ->> 'fare_type')::smallint, v_tarjeta.fare_type),
       nullif(v_tap ->> 'latitude', '')::double precision,
       nullif(v_tap ->> 'longitude', '')::double precision,
       v_mac, v_offline, v_clave, v_chip,
       coalesce(nullif(v_tap ->> 'tapped_at', '')::timestamptz, now()))
    returning id into v_tap_id;

    insert into public.card_movements
      (card_id, tipo, monto, saldo_despues, detalle, estado, unidad, at, idempotency_key)
    values
      (v_tarjeta.id, 'viaje', -v_fare, v_saldo,
       'Pasaje en ' || v_vehiculo.plate_number, 'aprobado', v_vehiculo.plate_number,
       coalesce(nullif(v_tap ->> 'tapped_at', '')::timestamptz, now()), v_clave)
    returning id into v_mov_id;

    update public.trips_telemetry
       set movement_id = v_mov_id
     where id = v_tap_id;

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
-- 4. Firma HMAC-SHA256 por equipo
-- ------------------------------------------------------------
create table if not exists public.validator_secrets (
  vehicle_id uuid primary key references public.vehicles(id) on delete cascade,
  secret     text not null,
  activo     boolean not null default true,
  creado_at  timestamptz not null default now(),
  rotado_at  timestamptz
);

comment on table public.validator_secrets is
  'Clave HMAC de cada ESP32. Solo la usa la función firmadora y service_role.';

create table if not exists public.validator_nonces (
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  nonce      text not null,
  usado_at   timestamptz not null default now(),
  primary key (vehicle_id, nonce)
);

comment on table public.validator_nonces is
  'Antirrepetición: un nonce firmado se acepta una sola vez en 30 s.';

alter table public.validator_secrets enable row level security;
alter table public.validator_nonces enable row level security;

-- Emite (o rota) la clave de un equipo. Devuelve el secreto una sola vez.
create or replace function public.bt_validador_emitir_secreto(p_mac text)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_mac     text := public.bt_normalizar_mac(p_mac);
  v_vehiculo public.vehicles;
  v_secreto text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  select * into v_vehiculo
    from public.vehicles
   where validator_mac = v_mac;

  if not found then
    raise exception 'Validador no registrado: %.', v_mac;
  end if;

  insert into public.validator_secrets (vehicle_id, secret)
  values (v_vehiculo.id, v_secreto)
  on conflict (vehicle_id) do update
     set secret = excluded.secret,
         activo = true,
         rotado_at = now();

  return jsonb_build_object(
    'mac', v_mac,
    'secreto', v_secreto,
    'algoritmo', 'HMAC-SHA256',
    'ventana_segundos', 30
  );
end;
$$;

-- HMAC-SHA256 en hexadecimal del cuerpo firmado.
create or replace function public.bt_firma_validador(p_cuerpo text, p_secreto text)
returns text
language sql immutable set search_path = public, extensions as $$
  select encode(
    extensions.hmac(
      convert_to(coalesce(p_cuerpo, ''), 'UTF8'),
      convert_to(coalesce(p_secreto, ''), 'UTF8'),
      'sha256'),
    'hex');
$$;

-- Sincronización firmada. El equipo firma `cuerpo`, que viaja tal cual y
-- contiene {"taps":[...],"recargas":[...]}. La firma cubre el cuerpo y el
-- sello de tiempo; el nonce impide reutilizar una trama dentro de la ventana.
create or replace function public.bt_validador_sincronizar_firma(
  p_mac text,
  p_cuerpo text,
  p_timestamp bigint,
  p_nonce text,
  p_firma text
)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_mac      text := public.bt_normalizar_mac(p_mac);
  v_vehiculo public.vehicles;
  v_secreto  text;
  v_esperada text;
  v_nonce    text := trim(coalesce(p_nonce, ''));
  v_datos    jsonb;
  v_desfase  numeric;
begin
  if p_timestamp is null then
    raise exception 'Firma sin sello de tiempo' using errcode = '28000';
  end if;

  -- Ventana de 30 s (§3.1): un sello viejo o futuro no se acepta.
  v_desfase := abs(extract(epoch from now()) - p_timestamp::numeric);
  if v_desfase > 30 then
    raise exception 'Sello de tiempo vencido (% s)', round(v_desfase) using errcode = '28000';
  end if;

  if length(v_nonce) < 8 or length(v_nonce) > 64 then
    raise exception 'Nonce inválido' using errcode = '28000';
  end if;

  if length(trim(coalesce(p_firma, ''))) <> 64 then
    raise exception 'Firma inválida' using errcode = '28000';
  end if;

  select v.* into v_vehiculo
    from public.vehicles v
   where v.validator_mac = v_mac
     and v.active;

  if not found then
    raise exception 'Validador no registrado o inactivo: %.', v_mac using errcode = '28000';
  end if;

  select s.secret into v_secreto
    from public.validator_secrets s
   where s.vehicle_id = v_vehiculo.id
     and s.activo;

  if v_secreto is null then
    raise exception 'El validador no tiene clave HMAC' using errcode = '28000';
  end if;

  v_esperada := public.bt_firma_validador(p_cuerpo || p_timestamp::text, v_secreto);

  -- Se comparan los digests para no filtrar por longitud ni por prefijo.
  if encode(extensions.digest(v_esperada, 'sha256'), 'hex')
     <> encode(extensions.digest(lower(trim(p_firma)), 'sha256'), 'hex') then
    raise exception 'Firma inválida' using errcode = '28000';
  end if;

  begin
    v_datos := coalesce(p_cuerpo, '{}')::jsonb;
  exception when others then
    raise exception 'Cuerpo de la firma ilegible' using errcode = '22000';
  end;

  -- Antirrepetición: el nonce entra una sola vez por equipo.
  delete from public.validator_nonces
   where usado_at < now() - interval '10 minutes';

  insert into public.validator_nonces (vehicle_id, nonce)
  values (v_vehiculo.id, v_nonce)
  on conflict (vehicle_id, nonce) do nothing;

  if not found then
    raise exception 'Trama repetida' using errcode = '28000';
  end if;

  return public.bt_validador_sincronizar(
    v_mac,
    coalesce(v_datos -> 'taps', '[]'::jsonb),
    coalesce(v_datos -> 'recargas', '[]'::jsonb));
end;
$$;

-- ------------------------------------------------------------
-- 5. Permisos
-- ------------------------------------------------------------
revoke all on function public.bt_validador_sincronizar(text, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.bt_validador_sincronizar(text, jsonb, jsonb)
  to service_role;

revoke all on function public.bt_validador_emitir_secreto(text)
  from public, anon, authenticated;
grant execute on function public.bt_validador_emitir_secreto(text)
  to service_role;

revoke all on function public.bt_validador_sincronizar_firma(text, text, bigint, text, text)
  from public;
grant execute on function public.bt_validador_sincronizar_firma(text, text, bigint, text, text)
  to anon, authenticated;

revoke all on function public.bt_firma_validador(text, text)
  from public, anon, authenticated;
grant execute on function public.bt_firma_validador(text, text)
  to service_role;

revoke all on function public.bt_asegurar_particion(timestamptz)
  from public, anon, authenticated;
revoke all on function public.bt_bitacora_movimiento()
  from public, anon, authenticated;
revoke all on function public.bt_bitacora_actualiza()
  from public, anon, authenticated;

-- La bitácora es de solo lectura para el back-office y para nadie más.
revoke all on public.transactions_log
  from public, anon, authenticated;
grant select on public.transactions_log to service_role;
