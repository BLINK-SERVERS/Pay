\set ON_ERROR_STOP on
\pset pager off

-- BLINK PAY · prueba 0030 · la recarga deja de tener tope de importe
-- Se fabrica su propio pasajero y su plástico para no depender del lote de la
-- simulación. Es repetible: borra lo de la pasada anterior antes de empezar.
delete from public.recharges  where card_id in (select id from public.cards where visible_id = 'G-00002-001-P');
delete from public.card_movements where card_id in (select id from public.cards where visible_id = 'G-00002-001-P');
delete from public.card_sessions  where card_id in (select id from public.cards where visible_id = 'G-00002-001-P');
delete from public.cards        where visible_id = 'G-00002-001-P';
delete from public.accounts where cedula_digitos in ('30111998');

select '0. PASAJERO Y TARJETA DE PRUEBA' as paso;
select public.bt_registrar('Prueba','Tope','V-30111998','04141119988',
                           'p0030@blink.test','813579', true, '', '', '')::jsonb
       ->>'token' as token \gset p_

-- batch_number y serial_number se generan del serial, así que no se escriben.
insert into public.cards (visible_id, fare_type, account_id, tarifa, status, vence)
values ('G-00002-001-P', 1,
        (select id from public.accounts where cedula_digitos = '30111998'),
        500, 'ACTIVE', now() + interval '5 years');

select '1. EL TOPE QUE HABÍA (settings.publico.topeRecarga = 20.000)' as paso;
select (valor->>'topeRecarga') as tope_configurado from public.settings where clave = 'publico';
select public.bt_tope_recarga() as tope_que_devuelve_la_funcion;

-- 50 pasajes a Bs 500 = Bs 25.000 acreditados, Bs 26.480 a transferir: antes
-- 0028 esto moría en «El tope por recarga es 20.000 Bs».
select '2. 50 PASAJES (26.480 Bs) SE ACEPTAN' as paso;
select jsonb_pretty(public.bt_recargar_pasajes(:'p_token', 'G-00002-001-P', 50,
       '04141119988', 'Banesco Banco Universal', '1234')::jsonb -> 'cotizacion') as cotizacion;

select '3. 400 PASAJES (211.840 Bs) TAMBIÉN' as paso;
select (public.bt_recargar_pasajes(:'p_token', 'G-00002-001-P', 400,
        '04141119988', 'Banesco Banco Universal', '1235')::jsonb -> 'cotizacion'
        ->> 'total') as total_reportado;

-- Los frenos que sí se quedan: cantidad, teléfono, banco y referencia siguen
-- validándose, y la avalancha y el duplicado siguen bloqueados.
\set ON_ERROR_STOP off
select '4. 0 Y -1 PASAJES SE SIGUEN RECHAZANDO' as paso;
select public.bt_recargar_pasajes(:'p_token', 'G-00002-001-P', 0,
       '04141119988', 'Banesco Banco Universal', '1236');
select public.bt_recargar_pasajes(:'p_token', 'G-00002-001-P', -1,
       '04141119988', 'Banesco Banco Universal', '1236');

select '5. TELÉFONO, BANCO Y REFERENCIA SIGUEN VALIDÁNDOSE' as paso;
select public.bt_recargar_pasajes(:'p_token', 'G-00002-001-P', 100,
       '414111998', 'Banesco Banco Universal', '1237');
select public.bt_recargar_pasajes(:'p_token', 'G-00002-001-P', 100,
       '04141119988', '', '1237');
select public.bt_recargar_pasajes(:'p_token', 'G-00002-001-P', 100,
       '04141119988', 'Banesco Banco Universal', '12');

select '6. LA MISMA REFERENCIA NO CUENTA DOS VECES' as paso;
select public.bt_recargar_pasajes(:'p_token', 'G-00002-001-P', 100,
       '04141119988', 'Banesco Banco Universal', '1234');
\set ON_ERROR_STOP on

select '7. AVALANCHA: EL SEXTO PASO Y EL SÉPTIMO FUERA' as paso;
select public.bt_recargar_pasajes(:'p_token', 'G-00002-001-P', 1, '04141119988', 'Banesco Banco Universal', '3001') is not null as ok_1,
       public.bt_recargar_pasajes(:'p_token', 'G-00002-001-P', 1, '04141119988', 'Banesco Banco Universal', '3002') is not null as ok_2,
       public.bt_recargar_pasajes(:'p_token', 'G-00002-001-P', 1, '04141119988', 'Banesco Banco Universal', '3003') is not null as ok_3;
select count(*) as reportes_en_10_minutos
  from public.recharges
 where card_id = (select id from public.cards where visible_id = 'G-00002-001-P')
   and created_at > now() - interval '10 minutes';

-- Con dos reportes grandes (pasos 2 y 3) más estos tres, el 3004 es el sexto y
-- todavía entra; el 3005 es el séptimo y lo frena el candado de avalancha, que
-- 0028 NO tocó.
\set ON_ERROR_STOP off
select public.bt_recargar_pasajes(:'p_token', 'G-00002-001-P', 1, '04141119988', 'Banesco Banco Universal', '3004') is not null as ok_4;
select public.bt_recargar_pasajes(:'p_token', 'G-00002-001-P', 1, '04141119988', 'Banesco Banco Universal', '3005');
\set ON_ERROR_STOP on

select '8. LO QUE QUEDÓ ESCRITO EN EL LIBRO' as paso;
select r.pasajes, r.tarifa_base, r.amount as total, r.bank_reference, r.status
  from public.recharges r
 where r.card_id = (select id from public.cards where visible_id = 'G-00002-001-P')
 order by r.created_at;
