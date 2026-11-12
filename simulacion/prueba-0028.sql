\set ON_ERROR_STOP on
\pset pager off

-- BLINK PAY · prueba 0028 · el banco emisor sobrevive a «Mis datos»
-- Se fabrica su propio pasajero para no depender de los datos del lote; borra
-- el de la pasada anterior para que la batería sea repetible.
select '0. PASAJERO DE PRUEBA' as paso;
delete from public.accounts where cedula_digitos in ('30111222', '30111444');
select public.bt_registrar('Prueba','Banco','V-30111222','04141112233',
                           'p0027@blink.test','704815', true, '', '', '')::jsonb
       ->>'token' as token \gset p_

select '1. CON «Mis datos» EL BANCO SE GUARDA (antes se vaciaba)' as paso;
select jsonb_pretty(
  public.bt_actualizar_pago(:'p_token', true, 'Banco Mercantil', '', '')::jsonb
  ->'cuenta'->'datosPago') as despues_de_guardar;

select '2. LO QUE QUEDÓ EN LA TABLA' as paso;
select pago_propio, pago_banco, pago_telefono, pago_cedula
  from public.accounts where cedula_digitos = '30111222';

select '3. IDEM CON LA SESIÓN (la app releé desde bt_sesion)' as paso;
select jsonb_pretty(public.bt_sesion(:'p_token')::jsonb ->'cuenta'->'datosPago') as leido;

select '4. «Mis datos» SIN BANCO sigue permitiendo el vacío (registro)' as paso;
select jsonb_pretty(
  public.bt_actualizar_pago(:'p_token', true, 'Banco de Venezuela, S.A.', '', '')::jsonb
  ->'cuenta'->'datosPago') as con_banco;
select jsonb_pretty(
  public.bt_actualizar_pago(:'p_token', true, '', '', '')::jsonb
  ->'cuenta'->'datosPago') as sin_banco;

-- El rechazo es un error previsto: se apaga ON_ERROR_STOP solo para este paso
-- y el propio mensaje de psql queda como prueba a la vista.
\set ON_ERROR_STOP off
select '5. «Otra cuenta» sin banco sigue rechazándose' as paso;
select public.bt_actualizar_pago(:'p_token', false, '', '04141112233', '30111222');
\set ON_ERROR_STOP on

select '5b. CUENTA AJENA COMPLETA SÍ se guarda' as paso;
select jsonb_pretty(
  public.bt_actualizar_pago(:'p_token', false, 'Banesco Banco Universal',
                            '04149998877', 'V-11223344')::jsonb
  ->'cuenta'->'datosPago') as cuenta_ajena;

select '6. EL RESTO DE LA CUENTA NO SE TOCA' as paso;
select nombres, apellidos, cedula, telefono, correo
  from public.accounts where cedula_digitos = '30111222';
