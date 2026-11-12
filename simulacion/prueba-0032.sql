\set ON_ERROR_STOP on
\pset pager off

-- BLINK PAY · prueba 0032 · los ajustes públicos que ve el pasajero
-- No crea pasajeros ni plásticos: trabaja sobre la única fila `settings.publico`
-- y la devuelve a su estado exacto al final, así que se puede correr varias
-- veces seguidas sin dejar la simulación tocada.
-- El punto es que 0032 arregla lo que el portal muestra, no lo que el código
-- trae por defecto: src/lib/nube.ts mezcla bt_ajustes() SOBRE
-- AJUSTES_POR_DEFECTO, así que manda lo que haya en la base.

create temp table _fila_original as select valor from public.settings where clave = 'publico';

select '0. LO QUE LE LLEGA AL PORTAL (bt_ajustes)' as paso;
select jsonb_pretty(public.bt_ajustes()) as ajustes;

-- El sembrado de 0001 era dato de prueba. Si alguno de estos valores volviera,
-- el paso de pago de Recargar estaría mandando transferencias a otro banco.
select '1. NINGÚN DATO DE PRUEBA SOBREVIVE' as paso;
select (public.bt_ajustes()::text not like '%Banesco%')
   and (public.bt_ajustes()::text not like '%J-00000000-0%')
   and (public.bt_ajustes()::text not like '%0414-0000000%')
   and (public.bt_ajustes()::text not like '%0800-BLINK-00%')
   and (public.bt_ajustes()::text not like '%titular%') as limpio;

select '2. VALOR POR VALOR' as paso;
select public.bt_ajustes() -> 'pagoMovil' ->> 'banco'    as banco,
       public.bt_ajustes() -> 'pagoMovil' ->> 'rif'      as rif,
       public.bt_ajustes() -> 'pagoMovil' ->> 'telefono' as telefono,
       public.bt_ajustes() ->> 'atencion'                as atencion,
       not (public.bt_ajustes() -> 'pagoMovil' ? 'titular') as titular_fuera;

-- Las claves que 0032 no debe tocar: el tarifario de 0019 (de donde sale la
-- tarifa del pasaje, que nunca se fija en el código), los topes de
-- transferencia y la clave muerta topeRecarga, que 0030 decidió dejar en su
-- sitio.
select '3. LO DEMÁS SE CONSERVA' as paso;
select public.bt_ajustes() -> 'tarifario'                     as tarifario,
       (public.bt_ajustes() ->> 'topeTransferencia')::int      as tope_transferencia,
       (public.bt_ajustes() ->> 'topeTransferenciaDiario')::int as tope_diario,
       (public.bt_ajustes() ->> 'topeRecarga')::int            as tope_recarga_viva;

select '4. LO QUE COTIZA EL PORTAL' as paso;
select public.bt_tarifario() ->> 'base' as tarifa_base,
       (public.bt_tope_recarga() is null) as sin_tope_de_importe;

-- El caso real de producción: la fila sigue con el sembrado viejo. Se rompe a
-- propósito, se aplica la migración y se comprueba que se cura sola.
select '5. UNA FILA TODAVÍA CON LOS DATOS DE PRUEBA DE 0001' as paso;
update public.settings
   set valor = jsonb_build_object(
         'pagoMovil', jsonb_build_object(
           'banco', 'Banesco', 'rif', 'J-00000000-0',
           'telefono', '0414-0000000', 'titular', 'BLINK PASAJES, C.A.'),
         'topeRecarga', 20000,
         'atencion', '0800-BLINK-00',
         'tarifario', public.bt_tarifario())
 where clave = 'publico';
select public.bt_ajustes() -> 'pagoMovil' ->> 'banco' as banco_roto,
       public.bt_ajustes() ->> 'atencion'             as atencion_rota;

\i ../supabase/migrations/0032_ajustes_blink.sql

select '6. TRAS APLICAR 0032 QUEDA ARREGLADA' as paso;
select public.bt_ajustes() -> 'pagoMovil' ->> 'banco'    as banco,
       public.bt_ajustes() -> 'pagoMovil' ->> 'rif'      as rif,
       public.bt_ajustes() -> 'pagoMovil' ->> 'telefono' as telefono,
       public.bt_ajustes() ->> 'atencion'                as atencion,
       (public.bt_ajustes() -> 'pagoMovil' ->> 'titular') as titular_es_null,
       public.bt_ajustes() -> 'tarifario' ->> 'base'      as tarifa_base_sigue;

-- Idempotencia: volver a aplicarla no cambia nada. Se compara contra la fila
-- tal como quedó tras la primera aplicación, no contra un objeto escrito a mano
-- (la fila puede traer claves que otras migraciones hayan puesto).
select '7. VOLVER A APLICARLA NO CAMBIA NADA' as paso;
create temp table _tras_la_primera as select valor from public.settings where clave = 'publico';
\i ../supabase/migrations/0032_ajustes_blink.sql
select (select valor from public.settings where clave = 'publico')
     = (select valor from _tras_la_primera) as segunda_aplicacion_no_muevo;

-- El respaldo de la función: sin fila `publico`, bt_ajustes() tampoco puede
-- devolver Banesco.
select '8. SIN LA FILA, EL RESPALDO TAMBIÉN DICE BLINK' as paso;
delete from public.settings where clave = 'publico';
select public.bt_ajustes() -> 'pagoMovil' ->> 'banco' as banco,
       public.bt_ajustes() ->> 'atencion'             as atencion;

-- Se restaura la fila exacta con la que entró la prueba, tarifario incluido.
insert into public.settings (clave, valor)
select 'publico', valor from _fila_original
on conflict (clave) do update set valor = excluded.valor, actualizada = now();

select '9. ESTADO FINAL: LA SIMULACIÓN QUEDA COMO ESTABA' as paso;
select public.bt_ajustes() -> 'pagoMovil' ->> 'banco' as banco,
       public.bt_ajustes() ->> 'atencion'             as atencion,
       public.bt_ajustes() -> 'tarifario' ->> 'base'  as tarifa_base,
       (select valor from public.settings where clave = 'publico')
         = (select valor from _fila_original)         as fila_idéntica_a_la_inicial,
       (select count(*) from public.settings)         as filas_en_settings;
