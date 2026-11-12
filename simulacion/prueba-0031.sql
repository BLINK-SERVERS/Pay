\set ON_ERROR_STOP on
\pset pager off

-- BLINK PAY · prueba 0031 · varias cuentas de Pago Móvil por pasajero
-- Espejo de tarjeta/simulacion/prueba-0029.sql con su propio pasajero
-- (30111631) para que ambas baterías puedan correr sobre la misma base.
-- Se fabrica su propio pasajero y borra el de la pasada anterior: la batería es
-- repetible sin depender del lote de la simulación.
delete from public.pago_cuentas where account_id in (select id from public.accounts where cedula_digitos = '30111631');
delete from public.accounts where cedula_digitos in ('30111631');

select '0. PASAJERO DE PRUEBA' as paso;
select public.bt_registrar('Prueba','Pago','V-30111631','04141117766',
                           'p0031@blink.test','628491', true, '', '', '')::jsonb
       ->>'token' as token \gset p_

select '1. EL REGISTRO DEJA UNA CUENTA PRINCIPAL Y EL ESPEJO PLANO' as paso;
select jsonb_pretty(public.bt_sesion(:'p_token')::jsonb -> 'cuenta' -> 'cuentasPago') as cuentas;
select pago_propio, pago_banco, pago_telefono, pago_cedula
  from public.accounts where cedula_digitos = '30111631';

select '2. ALTA DE LA SEGUNDA (de un familiar) NO TOCA LA PRINCIPAL' as paso;
select jsonb_pretty(
  (public.bt_alta_cuenta_pago(:'p_token', false, 'Banco Mercantil',
                              '04129998877', 'V-11223344')::jsonb -> 'cuenta' -> 'cuentasPago')) as despues;
select jsonb_pretty(
  (public.bt_alta_cuenta_pago(:'p_token', false, 'Banesco Banco Universal',
                              '04145556677', 'V-87654321')::jsonb -> 'cuenta' -> 'cuentasPago')) as tercera;

select '3. LAS COLUMNAS PLANAS SIGUEN ESPEJANDO LA PRINCIPAL' as paso;
select pago_propio, pago_banco, pago_telefono, pago_cedula
  from public.accounts where cedula_digitos = '30111631';

select '4. CAMBIAR DE CUENTA TAMBIÉN CAMBIA LO QUE USA LA RECARGA' as paso;
select p.id as segunda
  from public.pago_cuentas p
  join public.accounts a on a.id = p.account_id
 where a.cedula_digitos = '30111631' and p.banco = 'Banco Mercantil' \gset g_
select jsonb_pretty(
  (public.bt_usar_cuenta_pago(:'p_token', :'g_segunda')::jsonb -> 'cuenta' -> 'cuentasPago')) as reordenadas;
select jsonb_pretty(
  (public.bt_sesion(:'p_token')::jsonb -> 'cuenta' -> 'datosPago')) as espejo_plano;

select '5. EDITAR UNA CUENTA CONSERVA SU PUESTO' as paso;
select jsonb_pretty(
  (public.bt_editar_cuenta_pago(:'p_token', :'g_segunda', false, 'BBVA Provincial',
                               '04129998877', 'V-11223344')::jsonb
   -> 'cuenta' -> 'cuentasPago')) as editada;

\set ON_ERROR_STOP off
select '6. RECHAZOS QUE SIGUEN VIVIENDO' as paso;
select '   6a. duplicada';
select public.bt_alta_cuenta_pago(:'p_token', false, 'BBVA Provincial', '04129998877', 'V-11223344');
select '   6b. ajena a la sesión';
select public.bt_editar_cuenta_pago(:'p_token', gen_random_uuid(), false, 'Banesco Banco Universal', '04141117766', 'V-30111631');
select '   6c. ajena también al borrar';
select public.bt_borrar_cuenta_pago(:'p_token', gen_random_uuid());
select '   6d. «Mis datos» sin banco';
select public.bt_alta_cuenta_pago(:'p_token', false, '', '04129998877', 'V-11223344');
select '   6e. teléfono del Pago Móvil mal formado';
select public.bt_alta_cuenta_pago(:'p_token', false, 'Bancamiga', '412999887', 'V-11223344');
\set ON_ERROR_STOP on

select '7. BORRAR LA PRINCIPAL PROMUEVE A LA MÁS ANTIGUA' as paso;
select p.id as principal_actual
  from public.pago_cuentas p
  join public.accounts a on a.id = p.account_id
 where a.cedula_digitos = '30111631' and p.principal \gset h_
select jsonb_pretty(
  (public.bt_borrar_cuenta_pago(:'p_token', :'h_principal_actual')::jsonb -> 'cuenta' -> 'cuentasPago')) as despues_del_borro;

select '8. LA ÚLTIMA NO SE PUEDE BORRAR' as paso;
-- Primero queda una sola: se borra la del banco ajeno.
select p.id as ajena
  from public.pago_cuentas p
  join public.accounts a on a.id = p.account_id
 where a.cedula_digitos = '30111631' and p.banco = 'Banesco Banco Universal' \gset s_
select jsonb_pretty(
  (public.bt_borrar_cuenta_pago(:'p_token', :'s_ajena')::jsonb -> 'cuenta' -> 'cuentasPago')) as despues_de_la_ajena;
-- Y la que sobrevive ya no se puede borrar.
\set ON_ERROR_STOP off
select public.bt_borrar_cuenta_pago(:'p_token', :'s_ajena');
select '   8b. la única que queda resiste' as prueba;
select p.id as unica
  from public.pago_cuentas p
  join public.accounts a on a.id = p.account_id
 where a.cedula_digitos = '30111631' \gset u_
select public.bt_borrar_cuenta_pago(:'p_token', :'u_unica');
\set ON_ERROR_STOP on

select '9. «Mis datos» SOBRE LA ÚNICA CUENTA RESTANTE' as paso;
select jsonb_pretty(
  (public.bt_actualizar_pago(:'p_token', true, 'Banco de Venezuela, S.A.', '', '')::jsonb
   -> 'cuenta' -> 'cuentasPago')) as propia_actualizada;
select jsonb_pretty(
  (public.bt_sesion(:'p_token')::jsonb -> 'cuenta' -> 'datosPago')) as espejo;
