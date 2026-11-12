\set ON_ERROR_STOP on
\pset pager off

-- Orden REAL del firmware 15 en un toque:
--   lee chip -> aplicarRecargaPendiente() escribe los créditos -> cobrarViaje()
--   descuenta -> emitirTap() reporta el chip YA con créditos y cobro aplicados.
-- Además 0023 procesa los acuses ANTES que los toques dentro del mismo SYNC.
--
-- 0025 exige que offline_id sea un UUID v4, así que las claves se fabrican en
-- cada corrida (trips_telemetry.offline_id es único en toda la tabla). Antes
-- esta prueba usaba "N-1", "N-2" y "N-3": los tres toques salían rechazados de
-- "Clave de idempotencia inválida", no se cobraba ningún viaje y la batería
-- seguía en verde sin probar nada. El paso 7 es el candado que lo impide.
select id as id_tarjeta from public.cards where visible_id = 'G-00001-001-N' \gset t_

select gen_random_uuid()::text as k1,
       gen_random_uuid()::text as k2,
       gen_random_uuid()::text as k3 \gset kk_

delete from public.trips_telemetry where card_id =:'t_id_tarjeta';
delete from public.card_movements where card_id =:'t_id_tarjeta';
delete from public.recharges       where card_id =:'t_id_tarjeta';
delete from public.card_events     where card_id =:'t_id_tarjeta';

insert into public.card_movements (card_id, tipo, monto, saldo_despues, detalle, estado)
values (:'t_id_tarjeta', 'recarga', 10500, 10500, 'Libro de prueba', 'aprobado');

insert into public.recharges (card_id, amount, bank, bank_reference, status, synced_to_chip, monto_base)
values
  (:'t_id_tarjeta', 3000, '0108', 'PRUEBA-A', 'aprobado', false, 3000),
  (:'t_id_tarjeta', 2500, '0102', 'PRUEBA-B', 'aprobado', false, 2500);

update public.cards
   set status = 'ACTIVE', virtual_balance = 10500, last_chip_balance = 5000
 where id =:'t_id_tarjeta';

-- El chip físico arranca 1 000 por debajo del espejo (la escritura incierta real)
select '0. INICIAL: libro 10500, espejo 5000, pendientes 5500, chip 4000' as paso;

-- TOQUE 1: el validador escribe los 5500 pendientes y cobra 500 -> chip 9000.
-- Manda los dos acuses en el mismo SYNC (0023 los procesa primero).
select '1. TOQUE 1 (acuses + chip 9000)' as paso;
select jsonb_pretty(public.bt_validador_sincronizar('A0B1C2D3E4F5',
  jsonb_build_array(jsonb_build_object(
    'visible_id', 'G-00001-001-N', 'offline_id', :'kk_k1',
    'chip_balance_after', 9000, 'fare_charged', 500)),
  (select jsonb_agg(to_jsonb(r.id)) from public.recharges r
    where r.card_id =:'t_id_tarjeta' and r.status='aprobado' and not r.synced_to_chip)
)) as resultado;

select '1b. TRAS TOQUE 1' as paso;
select virtual_balance, last_chip_balance,
       public.bt_creditos_pendientes(id) as pendientes
  from public.cards where id =:'t_id_tarjeta';

-- TOQUE 2: sin créditos pendientes, chip 9000 - 500 = 8500
select '2. TOQUE 2 (chip 8500)' as paso;
select jsonb_pretty(public.bt_validador_sincronizar('A0B1C2D3E4F5',
  jsonb_build_array(jsonb_build_object(
    'visible_id', 'G-00001-001-N', 'offline_id', :'kk_k2',
    'chip_balance_after', 8500, 'fare_charged', 500))
)) as resultado;

-- TOQUE 3: chip 8000
select '3. TOQUE 3 (chip 8000)' as paso;
select jsonb_pretty(public.bt_validador_sincronizar('A0B1C2D3E4F5',
  jsonb_build_array(jsonb_build_object(
    'visible_id', 'G-00001-001-N', 'offline_id', :'kk_k3',
    'chip_balance_after', 8000, 'fare_charged', 500))
)) as resultado;

select '4. ESTADO FINAL' as paso;
select visible_id, virtual_balance, last_chip_balance,
       public.bt_creditos_pendientes(id) as pendientes
  from public.cards where id =:'t_id_tarjeta';

select '5. LIBRO vs COLUMNA (vacio = cuadra)' as paso;
select * from public.bt_conciliacion_saldos();

select '6. TOTALES' as paso;
select count(*) as viajes from public.trips_telemetry
 where card_id =:'t_id_tarjeta';

-- El descuadre de 1 000 del toque 1 no se rechaza (pueden ser cobros de otros
-- validadores aún no sincronizados), pero desde 0033 tiene que quedar trazado.
select '7. CANDADO' as paso;
do $$
declare
  v_id     uuid;
  v_viajes int;
  v_acuses int;
  v_bajos  int;
begin
  select id into v_id from public.cards where visible_id = 'G-00001-001-N';

  select count(*) into v_viajes from public.trips_telemetry where card_id = v_id;
  if v_viajes <> 3 then
    raise exception 'FALLO: se esperaban 3 toques cobrados y hay %', v_viajes;
  end if;

  select count(*) into v_acuses from public.recharges
   where card_id = v_id and synced_to_chip;
  if v_acuses <> 2 then
    raise exception 'FALLO: los dos acuses no quedaron entregados al chip (% )', v_acuses;
  end if;

  if public.bt_creditos_pendientes(v_id) <> 0 then
    raise exception 'FALLO: todavía hay créditos pendientes de escribir';
  end if;

  if exists (select 1 from public.bt_conciliacion_saldos() where serial = 'G-00001-001-N') then
    raise exception 'FALLO: libro y columna no cuadran tras los tres toques';
  end if;

  select count(*) into v_bajos from public.card_events
   where card_id = v_id and evento = 'CHIP_BAJO';
  if v_bajos <> 1 then
    raise exception 'FALLO: chip 1.000 por debajo del espejo sin rastro (% eventos CHIP_BAJO)', v_bajos;
  end if;

  if (select virtual_balance from public.cards where id = v_id) <> 9000 then
    raise exception 'FALLO: saldo virtual esperado 9000';
  end if;

  raise notice 'ok: 3 toques cobrados, 2 acuses entregados, descuadre trazado, libro y columna en 9000';
end
$$;
