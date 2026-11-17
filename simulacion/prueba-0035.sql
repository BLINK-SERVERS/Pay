\set ON_ERROR_STOP on
\pset pager off

-- BLINK PAY · prueba 0035 · el validador, la app y el plástico hablan del mismo dinero
--
-- El reclamo del 2026-11-15: la app marcaba Bs 8.500, el plástico tenía Bs 6.000
-- y el validador cobraba sobre los 6.000. Esta batería le fija el contrato a los
-- dos defectos que 0035 cierra, con esos mismos números:
--
--   1. #181a — el veredicto del lote es exhaustivo. Todo toque enviado cae en un
--      solo contador (`procesadas` + `rechazadas` + `duplicadas` = enviados) y
--      todo acuse en `acuses` + `acuses_malos`. Antes, un lote de cobros ya
--      liquidados respondía `procesadas=0, rechazadas=0`: el validador no podía
--      distinguir "la nube lo cobró" de "la nube lo ignoró" y borraba la cola
--      igual (`red.cpp:949`), así que el cobro dejaba de existir para los dos
--      lados y el saldo de la app quedaba por encima del plástico para siempre.
--   2. #181b — la sesión trae el desglose (`chip`, `por_entregar`,
--      `por_descontar`), no un número suelto. La fórmula que lee la app tiene
--      que dar la cifra del plástico.
--   3. El dinero se conserva: reenviar el mismo lote no cobra dos veces ni deja
--      movimientos duplicados, y el libro sigue cuadrando con la columna
--      (`bt_conciliacion_saldos` vacío).
--
-- Repetible: se fabrica su pasajero (cédula 30111997) y su plástico
-- (G-00003-012-x con la letra verificador calculada por `bt_luhn_letra`) y borra
-- lo suyo antes de empezar. Corre sobre cualquier base recién migrada.
--
--   cd simulacion
--   PGPASSWORD=blink psql -h 127.0.0.1 -p 54329 -U postgres -d blink -f prueba-0035.sql

-- ---------------------------------------------------------------- 0. limpieza
delete from public.transactions_log  where card_id in (select id from public.cards where visible_id like 'G-00003-012%');
delete from public.card_adjustments  where card_id in (select id from public.cards where visible_id like 'G-00003-012%');
delete from public.card_movements    where card_id in (select id from public.cards where visible_id like 'G-00003-012%');
delete from public.recharges         where card_id in (select id from public.cards where visible_id like 'G-00003-012%');
delete from public.trips_telemetry   where card_id in (select id from public.cards where visible_id like 'G-00003-012%');
delete from public.card_events       where card_id in (select id from public.cards where visible_id like 'G-00003-012%');
delete from public.card_sessions     where card_id in (select id from public.cards where visible_id like 'G-00003-012%');
delete from public.cards             where visible_id like 'G-00003-012%';
delete from public.account_sessions  where account_id in (select id from public.accounts where cedula_digitos = '30111997');
delete from public.pago_cuentas      where account_id in (select id from public.accounts where cedula_digitos = '30111997');
delete from public.accounts          where cedula_digitos = '30111997';

-- ------------------------------------------------- 1. el escenario del reclamo
create temp table _escena (token text, serial text);

insert into _escena (token, serial)
select (public.bt_registrar('Prueba', 'Vinculo', 'V-30111997', '04141119997',
                             'p0035@blink.test', '852036', true, '', '', '') ->> 'token'),
       'G-00003-012-' || public.bt_luhn_letra('G00003012');

insert into public.cards (visible_id, fare_type, account_id, tarifa, status, vence, chip_uid)
select serial, 1, (select id from public.accounts where cedula_digitos = '30111997'),
       500, 'ACTIVE', now() + interval '5 years', '04000003012'
  from _escena;

-- 8.500 en la nube, 6.000 en el plástico: los 2.500 del medio son una recarga
-- aprobada que ningún validador ha escrito todavía. Es el número 1 del reclamo,
-- y es un estado legítimo — lo que faltaba era que la app lo dijera.
update public.cards
   set virtual_balance = 8500, last_chip_balance = 6000
 where visible_id = (select serial from _escena);

insert into public.recharges (card_id, amount, bank, bank_reference, sender_phone,
                              status, synced_to_chip, monto_base)
select c.id, 2500, '0108', 'PRUEBA-0035', '04141119997', 'aprobado', false, 2500
  from public.cards c
 where c.visible_id = (select serial from _escena);

insert into public.card_movements (card_id, tipo, monto, saldo_despues, detalle, estado)
select c.id, 'recarga', 8500, 8500, 'Libro de prueba 0035', 'aprobado'
  from public.cards c
 where c.visible_id = (select serial from _escena);

-- Dos claves de toque se fabrican aquí y viajan en tres lotes distintos: así se
-- prueba el reenvío sin insertar telemetría a mano.
create temp table _lote (n int primary key, clave text);
insert into _lote (n, clave)
select n, gen_random_uuid()::text from generate_series(1, 2) n;

-- El veredicto de cada sincronización se guarda para poder exigirle cuentas al
-- final, no solo leerlo en pantalla.
create temp table _veredicto (lote text, enviados int, respuesta jsonb);

select '1. LO QUE LA SESIÓN LE ENSEÑA AL PORTAL' as paso;
with t as (
  select e ->> 'serial'                   as serial,
         (e ->> 'saldo')::numeric         as saldo,
         (e ->> 'chip')::numeric          as chip,
         (e ->> 'por_entregar')::numeric  as por_entregar,
         (e ->> 'por_descontar')::numeric as por_descontar,
         (e ->> 'disponible')::numeric    as disponible
    from (select public.bt_sesion((select token from _escena)) as j) s,
         jsonb_array_elements(s.j -> 'tarjetas') e
)
select serial, saldo, chip, por_entregar, por_descontar, disponible,
       saldo - por_entregar + por_descontar as lo_que_muestra_la_app
  from t;

-- ------------------------------- 2. control negativo: sin 0035 la app no lo sabe
-- La proyección de 0034, palabra por palabra. Si este paso ya trajera `chip`,
-- la batería no estaría probando nada.
select '2. CONTROL NEGATIVO: LA PROYECCIÓN DE 0034' as paso;

create or replace function public.bt_tarjeta_cuenta_json(t public.cards, a public.accounts)
returns jsonb language sql stable security definer set search_path = public as $$
  select public.bt_tarjeta_json(t) || jsonb_build_object(
    'titular', jsonb_build_object(
      'nombre',   a.nombres || ' ' || a.apellidos,
      'cedula',   a.cedula,
      'telefono', a.telefono),
    'disponible', public.bt_disponible_transferencia(t)
  );
$$;

with t as (
  select (e ? 'chip') as trae_chip, (e ? 'por_entregar') as trae_entregar
    from (select public.bt_sesion((select token from _escena)) as j) s,
         jsonb_array_elements(s.j -> 'tarjetas') e
)
select count(*)                 as tarjetas,
       bool_or(trae_chip)       as alguna_trae_chip,
       bool_or(trae_entregar)   as alguna_trae_por_entregar
  from t;

\i ../supabase/migrations/0035_vincula_saldos.sql

select '2b. CON 0035 APLICADA, LA SESIÓN TRAE EL DESGLOSE' as paso;
with t as (
  select (e ? 'chip')          as trae_chip,
         (e ? 'por_entregar')  as trae_entregar,
         (e ? 'por_descontar') as trae_descontar,
         (e ? 'disponible')    as trae_disponible
    from (select public.bt_sesion((select token from _escena)) as j) s,
         jsonb_array_elements(s.j -> 'tarjetas') e
)
select count(*)                   as tarjetas,
       bool_and(trae_chip)        as todas_traen_chip,
       bool_and(trae_entregar)    as todas_traen_por_entregar,
       bool_and(trae_descontar)   as todas_traen_por_descontar,
       bool_and(trae_disponible)  as todas_traen_disponible
  from t;

-- --------------------------------------------- 3. el validador escribe la recarga
-- Tres acuses enviados: la recarga de 2.500, un texto que nunca será uuid, y la
-- misma recarga otra vez dentro del mismo lote. Antes de 0035 los dos últimos
-- se saltaban en silencio.
select '3. ACUSES: UNO BUENO, UNO BASURA, UNO REPETIDO' as paso;
insert into _veredicto (lote, enviados, respuesta)
select 'acuses', 3, public.bt_validador_sincronizar(
         'A0B1C2D3E4F5', '[]'::jsonb,
         jsonb_build_array(
           (select id::text from public.recharges where bank_reference = 'PRUEBA-0035'),
           'esto-no-es-un-uuid',
           (select id::text from public.recharges where bank_reference = 'PRUEBA-0035')
         )
       );
select jsonb_pretty(respuesta) as sincronizar_acuses from _veredicto where lote = 'acuses';

select '4. LA RECARGA YA ESTÁ EN EL PLÁSTICO' as paso;
with t as (
  select e ->> 'serial'                   as serial,
         (e ->> 'saldo')::numeric         as saldo,
         (e ->> 'chip')::numeric          as chip,
         (e ->> 'por_entregar')::numeric  as por_entregar,
         (e ->> 'por_descontar')::numeric as por_descontar
    from (select public.bt_sesion((select token from _escena)) as j) s,
         jsonb_array_elements(s.j -> 'tarjetas') e
)
select serial, saldo, chip, por_entregar, por_descontar,
       saldo - por_entregar + por_descontar = chip as cuadra
  from t;

-- ------------------------------------------------------ 5. lote de toques nuevo
select '5. LOTE A: DOS COBROS NUEVOS' as paso;
insert into _veredicto (lote, enviados, respuesta)
select 'lote-a', 2, public.bt_validador_sincronizar(
         'A0B1C2D3E4F5',
         (select jsonb_agg(jsonb_build_object(
                   'offline_id', l.clave,
                   'visible_id', e.serial,
                   'fare_charged', 500,
                   'chip_balance_after', 8500 - 500 * l.n,
                   'tapped_at', now() - make_interval(mins => l.n)
                 ) order by l.n)
            from _lote l cross join _escena e),
         '[]'::jsonb
       );
select jsonb_pretty(respuesta) as sincronizar_lote_a from _veredicto where lote = 'lote-a';

-- ------------------------------------- 6. la regresión: el mismo lote, reenviado
-- Es lo que pasa cuando el validador no recibió el 200 y reenvía la cola. Antes
-- de 0035 la respuesta a estos 4 toques era `procesadas=1, rechazadas=1`: los
-- dos cobros ya liquidados no sumaban a ningún contador, así que 4 enviados se
-- veían como 2 atendidos. El equipo borraba la cola creyendo que había quedado
-- cuadrada, y el cobro duplicado desaparecía para los dos lados.
select '6. LOTE B: LOS MISMOS DOS + UNO NUEVO + UNA TARJETA DESCONOCIDA' as paso;
insert into _veredicto (lote, enviados, respuesta)
select 'lote-b', 4, public.bt_validador_sincronizar(
         'A0B1C2D3E4F5',
         (select jsonb_build_array(
                   jsonb_build_object('offline_id', (select clave from _lote where n = 1),
                                      'visible_id', (select serial from _escena),
                                      'fare_charged', 500, 'chip_balance_after', 8000),
                   jsonb_build_object('offline_id', (select clave from _lote where n = 2),
                                      'visible_id', (select serial from _escena),
                                      'fare_charged', 500, 'chip_balance_after', 7500),
                   jsonb_build_object('offline_id', gen_random_uuid()::text,
                                      'visible_id', (select serial from _escena),
                                      'fare_charged', 500, 'chip_balance_after', 7000),
                   jsonb_build_object('offline_id', gen_random_uuid()::text,
                                      'visible_id', 'Z-99999-999-Z',
                                      'fare_charged', 500, 'chip_balance_after', 0))
         ),
         '[]'::jsonb
       );
select jsonb_pretty(respuesta) as sincronizar_lote_b from _veredicto where lote = 'lote-b';

-- 7. el lote B, ya sin la clave nueva: los tres cobros están liquidados y solo
--    queda el desconocido. Es el caso que respondía `procesadas=0,
--    rechazadas=1` y se veía igual que un lote ignorado.
select '7. LOTE C: LOS TRES LIQUIDADOS + EL DESCONOCIDO' as paso;
insert into _veredicto (lote, enviados, respuesta)
select 'lote-c', 4, public.bt_validador_sincronizar(
         'A0B1C2D3E4F5',
         (select jsonb_build_array(
                   jsonb_build_object('offline_id', (select clave from _lote where n = 1),
                                      'visible_id', (select serial from _escena),
                                      'fare_charged', 500, 'chip_balance_after', 8000),
                   jsonb_build_object('offline_id', (select clave from _lote where n = 2),
                                      'visible_id', (select serial from _escena),
                                      'fare_charged', 500, 'chip_balance_after', 7500),
                   jsonb_build_object('offline_id',
                        (select t.idempotency_key::text
                           from public.trips_telemetry t
                           join public.cards c on c.id = t.card_id
                          where c.visible_id = (select serial from _escena)
                          order by t.tapped_at desc limit 1),
                                      'visible_id', (select serial from _escena),
                                      'fare_charged', 500, 'chip_balance_after', 7000),
                   jsonb_build_object('offline_id', gen_random_uuid()::text,
                                      'visible_id', 'Z-99999-999-Z',
                                      'fare_charged', 500, 'chip_balance_after', 0))
         ),
         '[]'::jsonb
       );
select jsonb_pretty(respuesta) as sincronizar_lote_c from _veredicto where lote = 'lote-c';

select '8. EL VEREDICTO, A LA VISTA' as paso;
select lote, enviados,
       (respuesta ->> 'procesadas')::int                       as procesadas,
       jsonb_array_length(respuesta -> 'rechazadas')           as rechazadas,
       (respuesta ->> 'duplicadas')::int                       as duplicadas,
       (respuesta ->> 'procesadas')::int
         + jsonb_array_length(respuesta -> 'rechazadas')
         + (respuesta ->> 'duplicadas')::int                   as toques_liquidos,
       (respuesta ->> 'acuses')::int                           as acuses,
       (respuesta ->> 'acuses_malos')::int                     as acuses_malos
  from _veredicto
 order by lote;

select '9. LO QUE QUEDA EN LA BILLETERA' as paso;
with t as (
  select e ->> 'serial'                   as serial,
         (e ->> 'saldo')::numeric         as saldo,
         (e ->> 'chip')::numeric          as chip,
         (e ->> 'por_entregar')::numeric  as por_entregar,
         (e ->> 'por_descontar')::numeric as por_descontar
    from (select public.bt_sesion((select token from _escena)) as j) s,
         jsonb_array_elements(s.j -> 'tarjetas') e
)
select serial, saldo, chip, por_entregar, por_descontar from t;

-- ------------------------------------------------------------------ 10. candado
do $$
declare
  v_serial     text;
  v_id         uuid;
  v_tarjeta    jsonb;
  v_respuesta  jsonb;
  v_saldo      numeric;
  v_chip       numeric;
  v_trip       int;
  v_mov        int;
  v_rompe      text;
begin
  select serial into v_serial from _escena;
  select id into v_id from public.cards where visible_id = v_serial;

  -- (a) El desglose está en el payload. 8.500 de saldo menos 2.500 por escribir
  --     son los 6.000 que el validador leía en el plástico: la app ya no puede
  --     volver a mostrar un número suelto.
  select e into v_tarjeta from jsonb_array_elements(public.bt_sesion(
                       (select token from _escena)) -> 'tarjetas') e
   where e ->> 'serial' = v_serial;

  if v_tarjeta is null
     or not (v_tarjeta ? 'chip')
     or not (v_tarjeta ? 'por_entregar')
     or not (v_tarjeta ? 'por_descontar') then
    raise exception 'FALLO: la sesión no trae el desglose del saldo: %', v_tarjeta;
  end if;

  -- (b) El contrato del veredicto: cada lote responde por TODOS los elementos
  --     que se le enviaron. Es lo que firmware 23 usa para decidir si borra o
  --     reenvía la cola; sin `duplicadas` el equipo no puede saberlo.
  -- Antes de sumar hay que exigir que las claves existan: contra una base sin
  -- 0035 la resta daría NULL y la fila pasaría como buena.
  select v.lote into v_rompe
    from _veredicto v
   where not (v.respuesta ? 'duplicadas')
      or not (v.respuesta ? 'acuses')
      or not (v.respuesta ? 'acuses_malos');
  if found then
    raise exception 'FALLO: el lote % responde sin los contadores de 0035: %',
      v_rompe, (select respuesta from _veredicto where lote = v_rompe);
  end if;

  select v.lote into v_rompe
    from _veredicto v
   where (v.respuesta ->> 'procesadas')::int
         + jsonb_array_length(v.respuesta -> 'rechazadas')
         + (v.respuesta ->> 'duplicadas')::int
         + (v.respuesta ->> 'acuses')::int
         + (v.respuesta ->> 'acuses_malos')::int <>
         case v.lote
           when 'acuses' then 3
           when 'lote-a' then 2
           when 'lote-b' then 4
           when 'lote-c' then 4
         end;
  if found then
    raise exception 'FALLO: el lote % no rinde cuentas de todos sus elementos: %',
      v_rompe, (select respuesta from _veredicto where lote = v_rompe);
  end if;

  if (select (respuesta ->> 'duplicadas')::int from _veredicto where lote = 'lote-b') <> 2 then
    raise exception 'FALLO: lote B reenviado no contó sus 2 duplicados: %',
      (select respuesta from _veredicto where lote = 'lote-b');
  end if;

  if (select (respuesta ->> 'acuses_malos')::int from _veredicto where lote = 'acuses') <> 1
     or (select (respuesta ->> 'acuses')::int from _veredicto where lote = 'acuses') <> 2 then
    raise exception 'FALLO: los acuses no se contaron por separado: %',
      (select respuesta from _veredicto where lote = 'acuses');
  end if;

  -- (c) Lote C: los tres cobros ya liquidados siguen duplicados y el
  --     desconocido rechazado, sin haber movido un céntimo.
  if (select (respuesta ->> 'procesadas')::int from _veredicto where lote = 'lote-c') <> 0
     or (select (respuesta ->> 'duplicadas')::int from _veredicto where lote = 'lote-c') <> 3
     or jsonb_array_length((select respuesta -> 'rechazadas' from _veredicto where lote = 'lote-c')) <> 1 then
    raise exception 'FALLO: el lote reenviado cambió de veredicto: %',
      (select respuesta from _veredicto where lote = 'lote-c');
  end if;

  -- (d) El dinero: tres pasajes de 500 sobre 8.500, cobrados una sola vez cada
  --     uno aunque la cola viajó tres veces.
  select virtual_balance, last_chip_balance into v_saldo, v_chip
    from public.cards where id = v_id;
  if v_saldo <> 7000 then
    raise exception 'FALLO: se esperaban 7.000 en la cuenta tras 3 pasajes y hay %', v_saldo;
  end if;

  select count(*) into v_trip from public.trips_telemetry where card_id = v_id;
  if v_trip <> 3 then
    raise exception 'FALLO: hay % viajes en la telemetría, se esperaban 3 (la idempotencia falló)', v_trip;
  end if;

  select count(*) into v_mov
    from public.card_movements
   where card_id = v_id and tipo = 'viaje' and estado = 'aprobado';
  if v_mov <> 3 then
    raise exception 'FALLO: hay % movimientos de viaje, se esperaban 3', v_mov;
  end if;

  -- (e) La fórmula que usa el cliente coincide con el espejo del chip.
  if v_saldo - public.bt_creditos_pendientes(v_id)
         + public.bt_debitos_pendientes(v_id) <> v_chip then
    raise exception 'FALLO: la fórmula del plástico no cuadra (saldo % / chip % / por_entregar % / por_descontar %)',
      v_saldo, v_chip,
      public.bt_creditos_pendientes(v_id), public.bt_debitos_pendientes(v_id);
  end if;

  -- Ningún toque declaró un chip por debajo de lo esperable: si lo hubiera
  -- hecho, 0033 deja CHIP_BAJO y la diferencia NO se puede borrar con la
  -- fórmula de la app. Que la bitácora esté limpia es lo que autoriza a la
  -- pantalla a hablar del plástico como de una cifra exacta.
  if exists (select 1 from public.card_events
              where card_id = v_id and evento = 'CHIP_BAJO') then
    raise exception 'FALLO: algún toque leyó el chip por debajo del piso esperado';
  end if;

  -- (f) El libro sigue cuadrando con la columna: no se perdió ningún cobro y
  --     ninguno se contó dos veces.
  if exists (select 1 from public.bt_conciliacion_saldos() where serial = v_serial) then
    raise exception 'FALLO: libro y columna no cuadran tras los reenvíos';
  end if;

  raise notice 'ok: la sesión dice 8.500 con 6.000 en el plástico y 2.500 por cargar; el acuse sube el espejo y el desglose vuelve a cuadra; 3 lotes reenviados rinden cuentas de todos sus elementos (2 duplicados en el B, 3 en el C, 1 acuse basura) y dejan 3 viajes, 7.000 exactos y el libro cuadrado';
end
$$;
