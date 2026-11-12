\set ON_ERROR_STOP on
\pset pager off

select id as id_tarjeta from public.cards where visible_id = 'G-00001-001-N' \gset t_

-- Libro mayor aprobado que suma 6000 + 4500 - 500 = 10 000
insert into public.card_movements (card_id, tipo, monto, saldo_despues, detalle, estado)
values
  (:'t_id_tarjeta', 'recarga',  6000,  6000, 'Recarga de prueba',            'aprobado'),
  (:'t_id_tarjeta', 'recarga',  4500, 10500, 'Recarga de prueba',            'aprobado'),
  (:'t_id_tarjeta', 'viaje',     -500, 10000, 'Pasaje en A12BC3D',           'aprobado'),
  (:'t_id_tarjeta', 'recarga',  90000,    0, 'Recarga rechazada, no cuenta', 'rechazado'),
  (:'t_id_tarjeta', 'recarga',  80000,    0, 'Recarga pendiente, no cuenta', 'pendiente');

-- El mismo descuadre que en producción: libro en 10 000, columna en 0
update public.cards set virtual_balance = 0 where id =:'t_id_tarjeta';

select '1. DETECCION' as paso;
select * from public.bt_conciliacion_saldos();

select '2. REPARACION' as paso;
select jsonb_pretty(public.bt_conciliar_tarjeta('G-00001-001-N', 'diego', 'prueba 0027')) as resultado;

select '3. LIBRO vs COLUMNA' as paso;
select visible_id, virtual_balance,
       (select coalesce(sum(monto),0) from public.card_movements
         where card_id = c.id and estado = 'aprobado') as libro
  from public.cards c where visible_id = 'G-00001-001-N';

select '4. IDEMPOTENCIA' as paso;
select jsonb_pretty(public.bt_conciliar_tarjeta('G-00001-001-N', 'diego', 'segunda vez')) as resultado;

select '5. BITACORA CONCILIADA' as paso;
select evento, canal, operador, jsonb_pretty(detalle) as detalle
  from public.card_events
 where card_id =:'t_id_tarjeta' and evento = 'CONCILIADA';

select '6. SIN DESCUADRES' as paso;
select count(*) as descuadres from public.bt_conciliacion_saldos();

select '7. SERIAL INEXISTENTE' as paso;
do $$
begin
  perform public.bt_conciliar_tarjeta('Z-99999-999-Z');
  raise exception 'FALLO: no rechazo el serial inexistente';
exception when others then
  raise notice 'OK, levanto error: %', sqlerrm;
end
$$;
