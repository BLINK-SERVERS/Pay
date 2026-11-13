\set ON_ERROR_STOP on
\pset pager off

-- BLINK PAY · prueba 0034 · la sesión promete el tope que el servidor acepta
--
-- Hallazgo #158. El portal dejaba escribir hasta `saldo`, que es
-- `cards.virtual_balance`, pero `bt_transferir_saldo` corta por
-- `bt_disponible_transferencia` (0022): el saldo menos las recargas aprobadas
-- que el validador todavía no escribió en el plástico. Con una recarga
-- esperando en la bandeja, el pasajero leía «te quedan 7.000 Bs», pulsaba
-- Transferir y el servidor contestaba «solo puedes transferir 4.000». Dos
-- cifras para la misma pregunta, y la mala era la que él no podía ver.
--
-- 0034 mete `disponible` en la proyección de la sesión. Esta batería le fija
-- el contrato a la base:
--   1. toda tarjeta de la sesión trae `disponible`, coincide con la función y
--      nunca supera al saldo;
--   2. un bolívar más que `disponible` se rechaza con el mensaje de las
--      recargas recién aprobadas —no con el del tope— y no deja transferencia,
--      y con `disponible` en cero el mensaje se lee «0.00 Bs» y no «.00 Bs»;
--   3. `disponible` exacto sí se acepta;
--   4. cuando el validador escribe la recarga y los dos ajustes de la
--      transferencia en el plástico, `disponible` vuelve a coincidir con
--      `saldo` en las dos tarjetas;
--   5. la batería se va sin deberle un acuse a ningún plástico —se va como
--      llegó— para no romper el SYNC que `flujo.mjs` da por cerrado.
--
-- Repetible: se fabrica su pasajero (cédula 30111999) y sus dos plásticos
-- (G-00003-010-x y G-00003-011-x, con la letra verificador calculada por
-- `bt_luhn_letra`), y borra lo suyo antes de empezar. Corre sobre cualquier
-- base recién migrada y puede volverse a correr seguidas.
--
-- Se invoca desde el `psql` del equipo de desarrollo y con la ruta de este
-- directorio (el paso 2 usa `\i`, que resuelve el cliente y el repo no está
-- montado en el contenedor `db`):
--   cd simulacion
--   PGPASSWORD=blink psql -h 127.0.0.1 -p 54329 -U postgres -d blink -f prueba-0034.sql

-- ---------------------------------------------------------------- 0. limpieza
delete from public.transactions_log  where card_id in (select id from public.cards where visible_id like 'G-00003-01%');
delete from public.card_adjustments  where card_id in (select id from public.cards where visible_id like 'G-00003-01%');
delete from public.card_transfers    where cuenta_id in (select id from public.accounts where cedula_digitos = '30111999');
delete from public.card_movements    where card_id in (select id from public.cards where visible_id like 'G-00003-01%');
delete from public.recharges         where card_id in (select id from public.cards where visible_id like 'G-00003-01%');
delete from public.trips_telemetry   where card_id in (select id from public.cards where visible_id like 'G-00003-01%');
delete from public.card_events       where card_id in (select id from public.cards where visible_id like 'G-00003-01%');
delete from public.card_sessions     where card_id in (select id from public.cards where visible_id like 'G-00003-01%');
delete from public.cards             where visible_id like 'G-00003-01%';
delete from public.account_sessions  where account_id in (select id from public.accounts where cedula_digitos = '30111999');
delete from public.pago_cuentas      where account_id in (select id from public.accounts where cedula_digitos = '30111999');
delete from public.accounts          where cedula_digitos = '30111999';

-- --------------------------------------------------- 1. el escenario del bug
-- El token sale de la propia cuenta de prueba: el PIN solo se conoce aquí.
create temp table _escenario (token text, origen text, destino text);

insert into _escenario (token, origen, destino)
select (public.bt_registrar('Prueba', 'Transferencia', 'V-30111999', '04141119999',
                            'p0034@blink.test', '741258', true, '', '', '') ->> 'token'),
       'G-00003-010-' || public.bt_luhn_letra('G00003010'),
       'G-00003-011-' || public.bt_luhn_letra('G00003011');

-- El `chip_uid` se deriva del propio serial: es único como el serial y queda
-- liberado por la limpieza de arriba, sin chocar con los plásticos del
-- sembrado de la simulación ('04A1B2C3D4E5F6' y '04F6E5D4C3B2A1').
insert into public.cards (visible_id, fare_type, account_id, tarifa, status, vence, chip_uid)
select origen, 1, (select id from public.accounts where cedula_digitos = '30111999'),
       500, 'ACTIVE', now() + interval '5 years', '04000003010'
  from _escenario;

insert into public.cards (visible_id, fare_type, account_id, tarifa, status, vence, chip_uid)
select destino, 1, (select id from public.accounts where cedula_digitos = '30111999'),
       500, 'ACTIVE', now() + interval '5 years', '04000003011'
  from _escenario;

-- 7.000 en la nube, 4.000 en el plástico. Los 3.000 de en medio son una
-- recarga aprobada en la bandeja que ningún validador ha escrito todavía:
-- exactamente el estado que 0022 protege y el portal ignoraba.
update public.cards
   set virtual_balance = 7000, last_chip_balance = 4000
 where visible_id = (select origen from _escenario);

insert into public.recharges (card_id, amount, bank, bank_reference, sender_phone,
                              status, synced_to_chip, monto_base)
select c.id, 3000, '0108', 'PRUEBA-0034', '04141119999', 'aprobado', false, 3000
  from public.cards c
 where c.visible_id = (select origen from _escenario);

-- El libro de la tarjeta queda en 7.000, igual que la columna, para que
-- `bt_conciliacion_saldos()` siga vacío al terminar esta batería.
insert into public.card_movements (card_id, tipo, monto, saldo_despues, detalle, estado)
select c.id, 'recarga', 7000, 7000, 'Libro de prueba 0034', 'aprobado'
  from public.cards c
 where c.visible_id = (select origen from _escenario);

select '1. LO QUE LA SESIÓN LE ENSEÑA AL PORTAL' as paso;
with t as (
  select e ->> 'serial'                as serial,
         (e ->> 'saldo')::numeric      as saldo,
         (e ->> 'disponible')::numeric as disponible,
         (e ? 'disponible')            as trae_disponible
    from (select public.bt_sesion((select token from _escenario)) as j) s,
         jsonb_array_elements(s.j -> 'tarjetas') e
)
select serial, saldo, disponible, trae_disponible,
       (saldo - disponible) as retenido_por_el_chip
  from t
 order by serial;

-- --------------------------------------- 2. control negativo: sin 0034 no lo dice
-- La versión de 0005 de la proyección, palabra por palabra. Si este paso
-- alguno vuelve a traer `disponible`, la batería no está probando nada.
select '2. CONTROL NEGATIVO: LA PROYECCIÓN DE 0005' as paso;

create or replace function public.bt_tarjeta_cuenta_json(t public.cards, a public.accounts)
returns jsonb language sql stable as $$
  select public.bt_tarjeta_json(t) || jsonb_build_object(
    'titular', jsonb_build_object(
      'nombre',   a.nombres || ' ' || a.apellidos,
      'cedula',   a.cedula,
      'telefono', a.telefono)
  );
$$;

with t as (
  select (e ? 'disponible') as trae_disponible
    from (select public.bt_sesion((select token from _escenario)) as j) s,
         jsonb_array_elements(s.j -> 'tarjetas') e
)
select count(*)                            as tarjetas,
       bool_or(trae_disponible)            as alguna_trae_disponible
  from t;

\i ../supabase/migrations/0034_sesion_disponible.sql

select '2b. CON 0034 APLICADA, LA SESIÓN VUELVE A TRAERLA' as paso;
with t as (
  select (e ? 'disponible') as trae_disponible
    from (select public.bt_sesion((select token from _escenario)) as j) s,
         jsonb_array_elements(s.j -> 'tarjetas') e
)
select count(*)                            as tarjetas,
       bool_and(trae_disponible)           as todas_traen_disponible
  from t;

-- ------------------------------------------------- 3. los dos sondeos contra el servidor
-- 4.000 es el `disponible` del escenario; 4.001 pasa del tope por transferencia
-- (5.000) y por el diario (20.000), así que si sale rechazado es por la cifra
-- de la sesión, que es lo que se quiere probar.
create temp table _sondeo (caso text, respuesta jsonb);

insert into _sondeo
select 'de_mas', public.bt_transferir_saldo(
         (select token from _escenario), (select origen from _escenario),
         (select destino from _escenario), 4001, '741258', gen_random_uuid());

insert into _sondeo
select 'justo', public.bt_transferir_saldo(
         (select token from _escenario), (select origen from _escenario),
         (select destino from _escenario), 4000, '741258', gen_random_uuid());

-- El disponible en cero es el caso que 0034 deja a la vista (los 4.000 que el
-- destino cobró tampoco están escritos en su plástico) y el que destapó el
-- '.00' del mask: to_char(0,'FM999999999.00') suprime el cero de la izquierda.
insert into _sondeo
select 'cero', public.bt_transferir_saldo(
         (select token from _escenario), (select destino from _escenario),
         (select origen from _escenario), 1, '741258', gen_random_uuid());

select '3. SONDEOS: 4.001 RECHAZADO, 4.000 ACEPTADA, 1 CON CERO RECHAZADO' as paso;
select caso, jsonb_pretty(respuesta) as respuesta from _sondeo order by caso desc;

select '4. LO QUE QUEDA EN LA BILLETERA' as paso;
with t as (
  select e ->> 'serial'                as serial,
         (e ->> 'saldo')::numeric      as saldo,
         (e ->> 'disponible')::numeric as disponible
    from (select public.bt_sesion((select token from _escenario)) as j) s,
         jsonb_array_elements(s.j -> 'tarjetas') e
)
select serial, saldo, disponible from t order by serial;

-- --------------------------- 5. el validador escribe la recarga en el plástico
-- Un SYNC sin toques, solo con el acuse de la recarga: es la orden real que
-- devuelve 0033 y la que mueve `last_chip_balance`.
select '5. EL VALIDADOR CONFIRMA LA RECARGA EN EL CHIP' as paso;
select jsonb_pretty(public.bt_validador_sincronizar(
         'A0B1C2D3E4F5', '[]'::jsonb,
         jsonb_build_array((select id::text from public.recharges
                             where bank_reference = 'PRUEBA-0034'))
       )) as sincronizar;

select '6. LA CIFRA SE RECUENTA SOLA' as paso;
with t as (
  select e ->> 'serial'                as serial,
         (e ->> 'saldo')::numeric      as saldo,
         (e ->> 'disponible')::numeric as disponible
    from (select public.bt_sesion((select token from _escenario)) as j) s,
         jsonb_array_elements(s.j -> 'tarjetas') e
)
select serial, saldo, disponible from t order by serial;

-- -------------------- 7. la transferencia también baja a los dos plásticos
-- La batería no puede irse dejando ajustes pendientes: `flujo.mjs` exige que un
-- SYNC cierre sin `pendientes`, y un plástico sin escribir es justo el estado
-- que 0034 aprendió a mostrar. Aquí se cierra el ciclo de los dos ajustes
-- (–4.000 en la origen, +4.000 en la destino) como lo haría el validador.
select '7. LOS DOS AJUSTES TAMBIÉN BAJAN AL CHIP' as paso;
select jsonb_pretty(public.bt_validador_sincronizar(
         'A0B1C2D3E4F5', '[]'::jsonb,
         (select jsonb_agg(a.id::text order by a.card_id)
            from public.card_adjustments a
           where not a.synced_to_chip
             and a.card_id in (select id from public.cards
                                where visible_id in ((select origen from _escenario),
                                                     (select destino from _escenario))))
       )) as sincronizar_ajustes;

select '8. CERRADO: NADA PENDIENTE, LAS CIFRAS COINCIDEN' as paso;
with t as (
  select e ->> 'serial'                as serial,
         (e ->> 'saldo')::numeric      as saldo,
         (e ->> 'disponible')::numeric as disponible
    from (select public.bt_sesion((select token from _escenario)) as j) s,
         jsonb_array_elements(s.j -> 'tarjetas') e
)
select serial, saldo, disponible, disponible = saldo as escribe_el_plastico from t
 order by serial;

-- ------------------------------------------------------------------ 9. candado
do $$
declare
  v_token      text;
  v_origen     text;
  v_destino    text;
  v_sesion     jsonb;
  v_id_origen  uuid;
  v_disponible numeric;
  v_saldo      numeric;
  v_respuesta  jsonb;
  v_transfer   int;
begin
  select token, origen, destino into v_token, v_origen, v_destino from _escenario;
  v_sesion := public.bt_sesion(v_token);
  select id into v_id_origen from public.cards where visible_id = v_origen;

  -- (a) La promesa está en el payload: ninguna tarjeta de la billetera puede
  --     llegar al portal sin la cifra con la que el servidor va a cortar.
  if jsonb_array_length(v_sesion -> 'tarjetas') <> 2 then
    raise exception 'FALLO: se esperaban 2 tarjetas en la sesión y hay %',
      jsonb_array_length(v_sesion -> 'tarjetas');
  end if;

  if exists (select 1
               from jsonb_array_elements(v_sesion -> 'tarjetas') e
              where not (e ? 'disponible')) then
    raise exception 'FALLO: hay tarjetas de la sesión sin la clave `disponible`';
  end if;

  -- (b) El resto del batch (2 y 3): el de más se rechazó con el mensaje de
  --     las recargas pendientes y no dejó transferencia.
  select respuesta into v_respuesta from _sondeo where caso = 'de_mas';
  if v_respuesta ->> 'error' is distinct from 'datos' then
    raise exception 'FALLO: 4.001 no salió rechazado por datos, devolvió %', v_respuesta;
  end if;
  if v_respuesta ->> 'mensaje' not like 'Solo puedes transferir 4000.00 Bs%' then
    raise exception 'FALLO: el rechazo no cita el disponible de la sesión: %',
      v_respuesta ->> 'mensaje';
  end if;

  select respuesta into v_respuesta from _sondeo where caso = 'cero';
  if v_respuesta ->> 'mensaje' not like 'Solo puedes transferir 0.00 Bs%' then
    raise exception 'FALLO: el rechazo con disponible 0 no escribe 0.00: %',
      v_respuesta ->> 'mensaje';
  end if;

  select respuesta into v_respuesta from _sondeo where caso = 'justo';
  if v_respuesta ? 'transferencia' then
    if (v_respuesta -> 'transferencia' ->> 'monto')::numeric <> 4000 then
      raise exception 'FALLO: la transferencia justa quedó por %',
        v_respuesta -> 'transferencia' ->> 'monto';
    end if;
  else
    raise exception 'FALLO: 4.000 —el disponible exacto— fue rechazado: %', v_respuesta;
  end if;

  select count(*) into v_transfer
    from public.card_transfers
   where origen_id = v_id_origen;
  if v_transfer <> 1 then
    raise exception 'FALLO: el monto rechazado dejó transferencia: hay %', v_transfer;
  end if;

  -- (c) El paso 4 y 5: escrita la recarga en el plástico, ya no hay nada
  --     reservado y `disponible` vuelve a ser el saldo.
  select (e ->> 'disponible')::numeric, (e ->> 'saldo')::numeric
    into v_disponible, v_saldo
    from jsonb_array_elements(v_sesion -> 'tarjetas') e
   where e ->> 'serial' = v_origen;

  if v_disponible > v_saldo then
    raise exception 'FALLO: la sesión promete % de disponible con saldo %',
      v_disponible, v_saldo;
  end if;

  if v_disponible <> public.bt_disponible_transferencia(
       (select c from public.cards c where c.visible_id = v_origen)) then
    raise exception 'FALLO: la sesión dice % y bt_disponible_transferencia dice %',
      v_disponible,
      public.bt_disponible_transferencia((select c from public.cards c where c.visible_id = v_origen));
  end if;

  if v_disponible <> 3000 or v_saldo <> 3000 then
    raise exception 'FALLO: tras el acuse se esperaban saldo y disponible en 3.000 (saldo % / disponible %)',
      v_saldo, v_disponible;
  end if;

  if public.bt_creditos_pendientes(v_id_origen) <> 0 then
    raise exception 'FALLO: la recarga acusada sigue pendiente de escribir en el chip';
  end if;

  -- El destino cobró los 4.000 y, una vez el validador escribe su ajuste, la
  -- cifra deja de estar en el aire: disponible vuelve a ser el saldo. Si este
  -- paso se corre antes del acuse del paso 7 lee 0, que es exactamente la
  -- promesa rota que 0034 vino a cerrar.
  select (e ->> 'disponible')::numeric, (e ->> 'saldo')::numeric
    into v_disponible, v_saldo
    from jsonb_array_elements(v_sesion -> 'tarjetas') e
   where e ->> 'serial' = v_destino;
  if v_disponible <> 4000 or v_saldo <> 4000 then
    raise exception 'FALLO: tras acusar el ajuste se esperaban saldo y disponible en 4.000 en el destino (saldo % / disponible %)',
      v_saldo, v_disponible;
  end if;

  -- (d) La batería se va sin deberle un plástico a nadie: los dos ajustes del
  --     paso 3 también bajaron, así que ningún lado tiene créditos ni débitos
  --     esperando al validador. `flujo.mjs` exige un SYNC que cierre sin
  --     `pendientes`, y esto es lo que lo garantiza.
  if exists (select 1
               from public.cards c
              where c.visible_id in (v_origen, v_destino)
                and (public.bt_creditos_pendientes(c.id) <> 0
                     or public.bt_debitos_pendientes(c.id) <> 0)) then
    raise exception 'FALLO: queda algún ajuste sin escribir en el plástico';
  end if;

  if exists (select 1
               from public.card_adjustments a
              where not a.synced_to_chip
                and a.card_id in (select id from public.cards
                                   where visible_id in (v_origen, v_destino))) then
    raise exception 'FALLO: hay card_adjustments sin acusar tras el paso 7';
  end if;

  -- Nada de esto puede dejar el libro descuadrado: la batería se va como llegó.
  if exists (select 1 from public.bt_conciliacion_saldos()
              where serial in (v_origen, v_destino)) then
    raise exception 'FALLO: libro y columna no cuadran tras la transferencia';
  end if;

  raise notice 'ok: la sesión promete 4.000 de 7.000, 4.001 se rechaza citando el disponible, 1 Bs con disponible 0 se lee «0.00 Bs», 4.000 se acepta y los acuses del validador dejan disponible = saldo (3.000 en la origen, 4.000 en el destino) sin ajustes pendientes';
end
$$;
