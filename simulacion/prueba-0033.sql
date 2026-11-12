\set ON_ERROR_STOP on
\pset pager off

-- BLINK PAY · prueba 0033 · un toque podrido no arrastra el lote del validador
--
-- Hallazgos #162 y #165 sobre 0025. La batería se fabrica su propio pasajero y
-- su plástico (cedula 30111997) con un serial cuya letra verificador se calcula
-- con bt_luhn_letra, así que corre sobre cualquier base recién migrada sin
-- depender del lote de la simulación. Es repetible: borra lo de la pasada
-- anterior antes de empezar.
delete from public.trips_telemetry where card_id in (select id from public.cards where visible_id like 'G-00003-001-%');
delete from public.validator_rejections where serial in (select visible_id from public.cards where visible_id like 'G-00003-001-%');
delete from public.card_events    where card_id in (select id from public.cards where visible_id like 'G-00003-001-%');
delete from public.card_movements where card_id in (select id from public.cards where visible_id like 'G-00003-001-%');
delete from public.card_sessions  where card_id in (select id from public.cards where visible_id like 'G-00003-001-%');
delete from public.cards          where visible_id like 'G-00003-001-%';
delete from public.pago_cuentas where account_id in (select id from public.accounts where cedula_digitos = '30111997');
delete from public.accounts where cedula_digitos = '30111997';

select '0. PASAJERO Y TARJETA DE PRUEBA' as paso;
select public.bt_registrar('Prueba','Toques','V-30111997','04141119977',
                           'p0033@blink.test','741258', true, '', '', '')::jsonb
       ->>'token' as token \gset p_

select 'G-00003-001-' || public.bt_luhn_letra('G00003001') as serial \gset s_

insert into public.cards (visible_id, fare_type, account_id, tarifa, status, vence)
values (:'s_serial', 1,
        (select id from public.accounts where cedula_digitos = '30111997'),
        500, 'ACTIVE', now() + interval '5 years');

update public.cards
   set virtual_balance = 5000, last_chip_balance = 5000
 where visible_id = :'s_serial';

select id as id_tarjeta from public.cards where visible_id = :'s_serial' \gset t_

-- Cinco claves de idempotencia nuevas: las que se rechazan nunca llegan a
-- trips_telemetry, así que la batería puede correrse otra vez seguidas.
select gen_random_uuid()::text as k1, gen_random_uuid()::text as k2,
       gen_random_uuid()::text as k3, gen_random_uuid()::text as k4,
       gen_random_uuid()::text as k5, gen_random_uuid()::text as k6 \gset kk_

-- 5 000 Bs en el chip, tarifa de ruta 500. Un solo SYNC con seis elementos:
-- dos buenos (k1 normal, k6 con el chip muy por debajo del piso) y cuatro
-- podridos (k1..k6). Antes, cualquiera de los cuatro abortaba los seis.
select '1. UN SYNC MIXTO: 2 BUENOS + 4 PODRIDOS' as paso;
select jsonb_pretty(public.bt_validador_sincronizar('A0B1C2D3E4F5', jsonb_build_array(
  jsonb_build_object('visible_id', :'s_serial', 'offline_id', :'kk_k1',
                     'fare_charged', 500, 'chip_balance_after', 4500),
  jsonb_build_object('visible_id', :'s_serial', 'offline_id', :'kk_k2',
                     'fare_charged', 'no-es-numero'),
  jsonb_build_object('visible_id', :'s_serial', 'offline_id', :'kk_k3',
                     'fare_charged', 0),
  jsonb_build_object('visible_id', :'s_serial', 'offline_id', :'kk_k4',
                     'fare_charged', 500, 'chip_balance_after', '4o00'),
  jsonb_build_object('visible_id', :'s_serial', 'offline_id', :'kk_k5',
                     'fare_charged', 500, 'latitude', 'nublado'),
  jsonb_build_object('visible_id', :'s_serial', 'offline_id', :'kk_k6',
                     'fare_charged', 500, 'chip_balance_after', 100)
))) as resultado;

-- El número mágico de la prueba: 2 procesadas y 4 rechazadas. Si el lote
-- abortara, este archivo terminaría en error y nunca llegaría aquí.
select '2. CUADRE DEL LOTE' as paso;
select (select count(*) from public.trips_telemetry
         where idempotency_key in (:'kk_k1',:'kk_k2',:'kk_k3',:'kk_k4',:'kk_k5',:'kk_k6')) as viajes_guardados,
       (select count(*) from public.validator_rejections
         where offline_id in (:'kk_k2',:'kk_k3',:'kk_k4',:'kk_k5')) as rechazos,
       (select count(*) from public.validator_rejections
         where offline_id = :'kk_k6') as k6_debio_estar_aceptado;

select '3. MOTIVOS DE CADA RECHAZO' as paso;
select motivo, count(*) as veces
  from public.validator_rejections
 where offline_id in (:'kk_k2',:'kk_k3',:'kk_k4',:'kk_k5')
 group by motivo
 order by motivo;

-- #165: k6 reporta un chip de 100 cuando el piso honesto era 3 500
-- (4 500 - 500). Se acepta —otro validador pudo cobrar sin sincronizar— pero
-- no puede quedarse sin rastro.
select '4. EL CHIP POR DEBAJO DEL PISO DEJA CHIP_BAJO' as paso;
select jsonb_pretty(detalle) as rastro
  from public.card_events
 where card_id =:'t_id_tarjeta' and evento = 'CHIP_BAJO';

select '5. LOS DOS VIAJES BUENOS EN EL LIBRO' as paso;
select count(*) as viajes, coalesce(sum(fare_charged), 0) as cobrado,
       min(chip_balance_after) as chip_min
  from public.trips_telemetry
 where card_id =:'t_id_tarjeta';

select '6. LA TARJETA TERMINA COHERENTE' as paso;
select visible_id, virtual_balance, last_chip_balance,
       public.bt_creditos_pendientes(id) as pendientes
  from public.cards where id =:'t_id_tarjeta';

-- Regresión del hueco de cobertura: prueba-0027-multitap mandaba claves tipo
-- «N-1», que 0025 rechaza por no ser UUID v4. Con ese material la batería
-- nunca llegaba a tocar la lógica de toques. Aquí se verifica que una clave
-- vieja sigue rechazándose, pero sin llevarse el resto del lote.
select '7. UNA CLAVE QUE NO ES UUID v4 SE RECHAZA SIN ABORTAR' as paso;
select jsonb_pretty(public.bt_validador_sincronizar('A0B1C2D3E4F5', jsonb_build_array(
  jsonb_build_object('visible_id', :'s_serial', 'offline_id', 'N-9',
                     'fare_charged', 500, 'chip_balance_after', 500),
  jsonb_build_object('visible_id', :'s_serial', 'offline_id', :'kk_k1',
                     'fare_charged', 500, 'chip_balance_after', 500)
))) as repetido_y_viejo;

select '8. NADA DUPLICADO' as paso;
select count(*) as viajes_totales
  from public.trips_telemetry where card_id =:'t_id_tarjeta';
