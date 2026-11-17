-- BLINK PAY · 0035 · el validador, la app y el plástico hablan del mismo dinero
--
-- Pendiente de aplicar en Supabase. Nace del reclamo del 2026-11-15: la app
-- marcaba Bs 8.500, el plástico tenía Bs 6.000 y el validador cobraba sobre los
-- 6.000. Tres números, ninguna relación visible entre ellos.
--
-- Dos defectos concretos, y no son el mismo:
--
-- · #181a. `bt_validador_sincronizar` devolvía `procesadas` y `rechazadas`, pero
--   los toques que se iban por la rama de idempotencia (0033:157-159) no
--   sumaban a ningún contador: un lote de tres cobros ya liquidados respondía
--   `procesadas=0, rechazadas=0`. El validador, con ese 200 y una respuesta de
--   esquema válido, borra su cola entera (`red.cpp:949`). Si el servidor no
--   contó un toque, ese cobro **deja de existir para los dos lados**: el chip
--   ya lo pagó y el libro mayor nunca lo vio. El saldo de la app queda por
--   encima del plástico para siempre, que es exactamente el desfase que se
--   reportó. Ahora cada elemento del lote termina en uno de tres contadores, y
--   `procesadas + rechazadas + duplicadas` tiene que dar lo que se envió.
--   Los acuses (`p_recargas`) tenían el mismo agujero: un `id` que no se puede
--   fundir a uuid se saltaba en silencio. Se cuentan aparte.
--
-- · #181b. La sesión solo decía `saldo` = `virtual_balance` en crudo. El modelo
--   del proyecto es otro (0022 y 0027): lo que se puede gastar en el bus hoy es
--   `least(saldo - créditos_por_escribir, espejo_del_chip - débitos_por_descontar)`,
--   y entre el número de la app y el del plástico siempre puede haber dinero
--   aprobado que el validador todavía no escribió. Eso es legítimo, pero la app
--   no lo mostraba, así que el pasajero lo leía como una mentira. `bt_sesion`
--   pasa a traer el desglose completo; el cliente ya no tiene que adivinar nada.
--   Va en `bt_tarjeta_cuenta_json` —que desde 0034 es `security definer`— y no
--   en `bt_tarjeta_json`, porque las funciones de pendientes están revocadas a
--   `anon` y la proyección vieja corre como el rol que consulta.
--
-- Lo que a propósito NO hace esta migración: mover dinero sola cuando el chip
-- lee menos de lo esperado. La cota inferior ya se detecta (`CHIP_BAJO`, 0033)
-- pero no se repara, y no se repara porque con validadores offline no se puede
-- saber si la diferencia es un cobro perdido o un cobro de otro autobús que aún
-- no sincroniza. Ajustar el libro contra el plástico en ese caso cobraría dos
-- veces el mismo pasaje. El desfase se registra y lo cierra una persona con
-- `bt_conciliar_tarjeta` (0027).
--
-- Prueba: `simulacion/prueba-0035.sql`.
-- Orden de despliegue obligatorio: primero esta migración, después el firmware
-- 23. Al revés, un validador 23 contra una base sin 0035 no ve los contadores
-- nuevos y conserva la conducta vieja a propósito (veáse `red.cpp`), pero un
-- validador 23 contra una base con 0035 ya no pierde ningún cobro.

-- ------------------------------------------------------------
-- 1. Sincronización: el servidor rinde cuentas de cada elemento
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
  v_duplicadas int := 0;
  v_acuses     int := 0;
  v_acuses_malos int := 0;
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
      -- Un acuse que no es un uuid no se puede liquidar nunca: reenviarlo no
      -- sirve de nada, así que se cuenta aparte para que el validador lo
      -- descarte en vez de conservar la cola atrancada.
      v_acuses_malos := v_acuses_malos + 1;
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

    if v_card_id is null then
      v_card_id := null;
      v_monto := 0;

      update public.card_adjustments
         set synced_to_chip = true, synced_at = now()
       where id = v_ack_id
         and not synced_to_chip
      returning card_id, monto into v_card_id, v_monto;
    end if;

    if v_card_id is not null then
      update public.cards
         set last_chip_balance = greatest(last_chip_balance + v_monto, 0)
       where id = v_card_id;
    end if;

    -- Un acuse que no movió ninguna fila también está liquidado: significa que
    -- ya había llegado en una sincronización anterior. Contarlo es lo que
    -- permite al validador vaciar su lista de acuses sin borrar acuses vivos.
    v_acuses := v_acuses + 1;
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
      -- Ya estaba cobrado. No es un rechazo, pero el validador tiene que
      -- saberlo: sin este contador el lote liquidado se veía igual que uno
      -- ignorado y el equipo borraba cobros que nadie registró.
      v_duplicadas := v_duplicadas + 1;
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
    -- Los tres contadores son el veredicto del lote: todo toque enviado cae en
    -- uno solo de ellos. `duplicadas` es lo que ya estaba liquidado antes de
    -- esta llamada, no un error.
    'procesadas', v_procesadas,
    'rechazadas', v_rechazadas,
    'duplicadas', v_duplicadas,
    'acuses', v_acuses,
    'acuses_malos', v_acuses_malos,
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

comment on function public.bt_validador_sincronizar(text, jsonb, jsonb) is
  'Sincroniza un validador: acuses de chip, toques offline y la lista de lo que '
  'falta escribir. Desde 0035 el veredicto es exhaustivo — procesadas + '
  'rechazadas + duplicadas cubren cada toque enviado y acuses + acuses_malos '
  'cada acuse — para que el equipo solo borre lo que la nube realmente liquidó.';

-- ------------------------------------------------------------
-- 2. La sesión trae el desglose, no un número suelto
-- ------------------------------------------------------------
-- Copia de 0034 con tres claves más. `disponible` ya venía de ahí: es la cifra
-- con la que corta bt_transferir_saldo, o sea lo que de verdad se puede mover
-- hoy. `chip` es el espejo de lo que el validador escribió en el plástico y
-- `por_entregar` / `por_descontar` son los ajustes aprobados que el plástico
-- todavía no refleja. La suma de las piezas cuadra con `saldo`: así la pantalla
-- puede decir «tienes 8.500, de los cuales 6.000 están en la tarjeta».
create or replace function public.bt_tarjeta_cuenta_json(t public.cards, a public.accounts)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select public.bt_tarjeta_json(t) || jsonb_build_object(
    'titular', jsonb_build_object(
      'nombre',   a.nombres || ' ' || a.apellidos,
      'cedula',   a.cedula,
      'telefono', a.telefono),
    'disponible', public.bt_disponible_transferencia(t),
    'chip',            t.last_chip_balance,
    'por_entregar',    public.bt_creditos_pendientes(t.id),
    'por_descontar',   public.bt_debitos_pendientes(t.id)
  );
$$;

comment on function public.bt_tarjeta_cuenta_json(public.cards, public.accounts) is
  'Tarjeta vista desde la cuenta: la proyección bt_tarjeta_json más el titular, '
  'el `disponible` de 0034 y desde 0035 el desglose del saldo (chip, '
  'por_entregar, por_descontar) para que la app enseñe cuánto hay en el plástico '
  'y cuánto falta por escribir. Security definer porque las funciones de '
  'pendientes están revocadas a anon/authenticated.';

revoke all on function public.bt_tarjeta_cuenta_json(public.cards, public.accounts)
  from public, anon, authenticated;
