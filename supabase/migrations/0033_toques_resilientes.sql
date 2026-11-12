-- BLINK PAY · 0033 · un toque malformado ya no tira el lote del validador
--
-- Pendiente de aplicar en Supabase. Nace de la revisión de bugs del
-- 2026-11-12 sobre 0025_escudo_validador (aplicada el 2026-11-11), que no se
-- toca: aquí se re-crea la función con `create or replace`, misma firma, así
-- que los permisos y las llamadas existentes siguen valiendo.
--
-- Dos hallazgos:
--
-- · #162. El bucle de acuses (p_recargas) sí envolvía su cast en
--   `begin … exception`, pero el bucle de toques no. `fare_charged`,
--   `chip_balance_after`, `latitude`, `longitude`, `fare_type` y `tapped_at`
--   se fundían con un cast directo dentro de la misma transacción: un solo
--   elemento podrido devolvía 22P02 y abortaba `bt_validador_sincronizar`
--   entero. El ESP32 pierde el lote completo por red+reenvío, y al reenviar
--   lo mismo vuelve a abortar en el mismo punto: la cola offline del autobús
--   se atasca de forma permanente y deja de cobrar a los pasajeros siguientes.
--   Con `fare_charged = 0` pasaba igual por otra vía (trips_telemetry exige
--   fare_charged > 0 desde 0001 → 23514). Ahora cada toque viaja en su propio
--   bloque con punto de control: lo que sirve se guarda, lo que no se rechaza
--   con motivo legible en `validator_rejections`.
--
-- · #165. La cota superior del chip (372) existía; la inferior no. Un chip
--   leído muy por debajo de lo esperable se aceptaba en silencio y
--   `greatest(v_chip - v_creditos, 0)` se comía la diferencia: el espejo
--   bajaba sin que nada lo registrara. No se puede rechazar —otros
--   validadores pudieron cobrar sin sincronizar todavía, y un rechazo dejaría
--   el pasaje cobrado en el chip y no anotado en la base—, así que se acepta
--   y se deja `CHIP_BAJO` en la bitácora con el leído, el piso esperado y la
--   diferencia.
--
-- Prueba: `simulacion/prueba-0033.sql`.

-- ------------------------------------------------------------
-- 1. La bitácora admite el evento del chip bajo
-- ------------------------------------------------------------
alter table public.card_events drop constraint if exists card_events_evento_check;
alter table public.card_events
  add constraint card_events_evento_check
  check (evento = any (array[
    'ENROLADA', 'ASIGNADA', 'PERDIDA', 'RFPGC', 'CHIP_ERR', 'SCRAP',
    'CONCILIADA', 'CHIP_BAJO'
  ]));

-- ------------------------------------------------------------
-- 2. Sincronización: un toque roto no arrastra a los demás
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
  v_texto      text;
  v_piso       numeric;
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
    begin
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

    -- El cast directo de un texto basura abortaba la transacción entera.
    v_texto := nullif(trim(coalesce(v_tap ->> 'fare_charged', '')), '');
    if v_texto is not null and v_texto !~ '^-?[0-9]+([.][0-9]+)?$' then
      v_rechazadas := v_rechazadas || public.bt_validador_rechazo(
        v_vehiculo.id, v_tap, 'La tarifa del toque no es un número');
      continue;
    end if;

    v_fare := coalesce(v_texto::numeric, v_fare_ruta);
    v_fare := least(greatest(v_fare, 0), v_fare_ruta);

    -- trips_telemetry exige fare_charged > 0 (0001). Con la ruta en cero o un
    -- toque malicioso en cero, el insert reventaba con 23514 y se llevaba el
    -- lote; mejor rechazar el toque con nombre y apellido.
    if v_fare <= 0 then
      v_rechazadas := v_rechazadas || public.bt_validador_rechazo(
        v_vehiculo.id, v_tap, 'Tarifa en cero o negativa');
      continue;
    end if;

    if v_fare <> trunc(v_fare) then
      v_rechazadas := v_rechazadas || public.bt_validador_rechazo(
        v_vehiculo.id, v_tap, 'Tarifa con decimales');
      continue;
    end if;

    v_creditos := public.bt_creditos_pendientes(v_tarjeta.id);

    v_texto := nullif(trim(coalesce(v_tap ->> 'chip_balance_after', '')), '');
    if v_texto is not null and v_texto !~ '^-?[0-9]+([.][0-9]+)?$' then
      v_rechazadas := v_rechazadas || public.bt_validador_rechazo(
        v_vehiculo.id, v_tap, 'El saldo del toque no es un número');
      continue;
    end if;

    v_chip := coalesce(
      v_texto::numeric,
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

    -- Piso honesto del chip después del cobro: lo que la base cree que había
    -- en el chip (espejo + créditos sin acuse) menos la tarifa. Por debajo
    -- puede haber cobros de otros validadores aún no sincronizados, así que
    -- el toque se acepta; lo que no puede es quedarse sin rastro, porque
    -- greatest(v_chip - v_creditos, 0) se come la diferencia en silencio.
    v_piso := greatest(v_tarjeta.last_chip_balance + v_creditos - v_fare, 0);
    if v_chip < v_piso - 0.01 then
      insert into public.card_events (card_id, evento, canal, operador, detalle)
      values (
        v_tarjeta.id, 'CHIP_BAJO', 'sistema', v_mac,
        jsonb_build_object(
          'leido',        v_chip,
          'pisoEsperado', v_piso,
          'diferencia',   v_chip - v_piso,
          'espejoAntes',  v_tarjeta.last_chip_balance,
          'creditos',     v_creditos,
          'tarifa',       v_fare,
          'offlineId',    v_offline
        )
      );
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

    exception when others then
      -- Un solo toque malformado no puede llevarse el lote por delante: el
      -- validador pierde la red al enviar y, si reenvía lo mismo, vuelve a
      -- abortar en el mismo sitio. El bloque guarda un punto de control para
      -- esta fila; lo que ya iba cobrado queda firme.
      v_rechazadas := v_rechazadas || public.bt_validador_rechazo(
        v_vehiculo.id, v_tap,
        (case sqlstate
           when '22P02' then 'Un campo del toque no es del tipo esperado'
           when '23514' then 'El toque viola una restricción de la base'
           when '23505' then 'El toque choca con uno ya registrado'
           else 'El toque no se pudo registrar'
         end) || ' (' || sqlstate || ')');
    end;
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
