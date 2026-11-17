\set ON_ERROR_STOP on
\pset pager off

-- BLINK PAY · escena del desglose (compañera de prueba-0035.sql)
--
-- Deja la base en el estado exacto del reclamo del 2026-11-15 y SE QUEDA ahí:
-- Bs 8.500 en la cuenta, Bs 6.000 escritos en el plástico y Bs 2.500 de recarga
-- aprobada esperando que un validador la grabe. `prueba-0035.sql` no sirve para
-- esto porque su trabajo es liquidar la escena (acuses, tres lotes y sus
-- veredictos) y termina en otro saldo.
--
-- Sirve para mirar el portal a mano o para `npm run verificar:plastico`, que
-- necesita un estado con dinero atrapado en el camino:
--
--   cd simulacion && ./arrancar.sh && node flujo.mjs && ./portal.sh
--   PGPASSWORD=blink psql -h 127.0.0.1 -p 54329 -U postgres -d blink -f escena-desglose.sql
--   cd .. && BLINK_URL=http://127.0.0.1:5175/ node scripts/verificar-plastico.mjs
--
-- Los pasos 0 y 1 son los mismos de la batería, así que el pasajero (cédula
-- 30111997, PIN 852036) y el plástico (G-00003-012-U) son los mismos en las dos.

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
-- Alta por la RPC real para que el PIN quede derivado como queda en el
-- navegador; el serial se calcula con el verificador Luhn, igual que la batería.
select public.bt_registrar('Prueba', 'Vinculo', 'V-30111997', '04141119997',
                           'p0035@blink.test', '852036', true, '', '', '') ->> 'token'
  as token_de_prueba;

insert into public.cards (visible_id, fare_type, account_id, tarifa, status, vence, chip_uid)
select 'G-00003-012-' || public.bt_luhn_letra('G00003012'), 1, id, 500, 'ACTIVE',
       now() + interval '5 years', '04000003012'
  from public.accounts
 where cedula_digitos = '30111997';

-- 8.500 en la nube, 6.000 en el plástico: los 2.500 del medio son una recarga
-- aprobada que ningún validador ha escrito todavía.
update public.cards
   set virtual_balance = 8500, last_chip_balance = 6000
 where visible_id = 'G-00003-012-' || public.bt_luhn_letra('G00003012');

insert into public.recharges (card_id, amount, bank, bank_reference, sender_phone,
                              status, synced_to_chip, monto_base)
select id, 2500, '0108', 'ESCENA-DESGLOSE', '04141119997', 'aprobado', false, 2500
  from public.cards
 where visible_id = 'G-00003-012-' || public.bt_luhn_letra('G00003012');

insert into public.card_movements (card_id, tipo, monto, saldo_despues, detalle, estado)
select id, 'recarga', 8500, 8500, 'Libro de la escena del desglose', 'aprobado'
  from public.cards
 where visible_id = 'G-00003-012-' || public.bt_luhn_letra('G00003012');

-- ------------------------------------------------------------ 2. cómo quedó
select visible_id as serial,
       virtual_balance as saldo,
       last_chip_balance as chip,
       public.bt_creditos_pendientes(id) as por_entregar,
       public.bt_debitos_pendientes(id) as por_descontar,
       virtual_balance - public.bt_creditos_pendientes(id)
         + public.bt_debitos_pendientes(id) as en_el_plastico,
       tarifa
  from public.cards
 where visible_id like 'G-00003-012%';
