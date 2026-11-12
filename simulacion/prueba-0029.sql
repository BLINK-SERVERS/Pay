\set ON_ERROR_STOP on
\pset pager off

-- Prueba de la migración 0029 · bypass temporal del segundo factor (R-07).
-- Se corre en la simulación:
--   docker exec -i blink-simulacion_db_1 psql -U postgres -d blink < simulacion/prueba-0029.sql

select '1. CON EL BYPASE APAGADO LA PUERTA SIGUE CERRADA' as paso;
do $$
declare
  v_token uuid;
  v_error text;
begin
  update public.settings
     set valor = jsonb_set(valor, '{hasta}', 'null'), actualizada = now()
   where clave = 'mfa_bypase';

  insert into public.account_sessions (account_id, mfa, bypase_mfa)
  values ((select id from public.accounts where rol = 'ADMIN' limit 1), false, false)
  returning token into v_token;

  begin
    perform public.bt_admin_sesion_mfa(v_token::text);
    raise exception 'FALLO: operó sin segundo factor y sin bypass';
  exception when others then
    v_error := sqlerrm;
    if v_error not like 'bt:mfa%' then
      raise exception 'FALLO: esperaba bt:mfa y recibi %', v_error;
    end if;
    raise notice 'ok: %', v_error;
  end;

  delete from public.account_sessions where token = v_token;
end;
$$;

select '2. CON EL BYPASE ENCENDIDO SE OPERA Y LA SESION QUEDA MARCADA' as paso;
do $$
declare
  v_token   uuid;
  v_cuenta  public.accounts;
  v_marcada boolean;
begin
  update public.settings
     set valor = jsonb_set(valor, '{hasta}', to_jsonb(now() + interval '1 hour')),
         actualizada = now()
   where clave = 'mfa_bypase';

  if not public.bt_mfa_bypase_activo() then
    raise exception 'FALLO: el bypass no se ve activo';
  end if;

  insert into public.account_sessions (account_id, mfa, bypase_mfa)
  values ((select id from public.accounts where rol = 'ADMIN' limit 1), false,
          public.bt_mfa_bypase_activo())
  returning token into v_token;

  v_cuenta := public.bt_admin_sesion_mfa(v_token::text);
  if v_cuenta.rol <> 'ADMIN' then
    raise exception 'FALLO: la puerta devolvió otra cuenta';
  end if;

  select bypase_mfa into v_marcada from public.account_sessions where token = v_token;
  if not v_marcada then
    raise exception 'FALLO: la sesión del bypass quedó sin marcar';
  end if;

  raise notice 'ok: operador % con bypase_mfa = %', v_cuenta.cedula, v_marcada;

  delete from public.account_sessions where token = v_token;
end;
$$;

select '3. EL AVISO DEL PANEL REFLEJA EL BYPASE' as paso;
do $$
declare
  v_token uuid;
  v_estado jsonb;
begin
  insert into public.account_sessions (account_id, mfa, bypase_mfa)
  values ((select id from public.accounts where rol = 'ADMIN' limit 1), false, true)
  returning token into v_token;

  v_estado := public.bt_admin_estado(v_token::text);
  if v_estado ->> 'mfaBypase' <> 'true' or v_estado ->> 'mfa' <> 'false' then
    raise exception 'FALLO: bt_admin_estado devolvio %', v_estado;
  end if;
  raise notice 'ok: %', v_estado - 'cuenta';

  delete from public.account_sessions where token = v_token;
end;
$$;

select '4. SE APAGA SOLO: CADUCIDAD Y CIERRE MANUAL' as paso;
do $$
declare
  v_token uuid;
begin
  update public.settings
     set valor = jsonb_set(valor, '{hasta}', to_jsonb(now() - interval '1 second')),
         actualizada = now()
   where clave = 'mfa_bypase';

  if public.bt_mfa_bypase_activo() then
    raise exception 'FALLO: sigue activo después de vencer';
  end if;

  insert into public.account_sessions (account_id, mfa, bypase_mfa)
  values ((select id from public.accounts where rol = 'ADMIN' limit 1), false, true)
  returning token into v_token;

  begin
    perform public.bt_admin_sesion_mfa(v_token::text);
    raise exception 'FALLO: operó con el bypass vencido';
  exception when others then
    if sqlerrm not like 'bt:mfa%' then
      raise exception 'FALLO: esperaba bt:mfa y recibi %', sqlerrm;
    end if;
    raise notice 'ok al vencer: %', sqlerrm;
  end;

  delete from public.account_sessions where token = v_token;
end;
$$;

select '5. EL CONTROL NO ES LEGIBLE NI ESCRIBLE POR CLIENTES' as paso;
do $$
declare
  v_puede_funcion boolean;
  v_puede_tabla   boolean;
begin
  select has_function_privilege('anon', 'public.bt_mfa_bypase_activo()', 'execute')
    into v_puede_funcion;
  select has_table_privilege('anon', 'public.settings', 'select')
    into v_puede_tabla;

  if v_puede_funcion or v_puede_tabla then
    raise exception 'FALLO: anon puede leer el control (función=%, settings=%)',
      v_puede_funcion, v_puede_tabla;
  end if;

  raise notice 'ok: anon no ejecuta bt_mfa_bypase_activo ni lee settings';
end;
$$;

select '6. NADA DE ESTO CAMBIA UNA CUENTA CON MFA ACTIVO' as paso;
do $$
declare
  v_admin public.accounts;
begin
  update public.settings
     set valor = jsonb_set(valor, '{hasta}', to_jsonb(now() + interval '1 hour')),
         actualizada = now()
   where clave = 'mfa_bypase';

  update public.accounts set totp_activo = true where rol = 'ADMIN' returning * into v_admin;

  begin
    perform public.bt_admin_sesion_mfa('00000000-0000-0000-0000-000000000000');
    raise exception 'FALLO: aceptó un token inexistente';
  exception when others then
    if sqlerrm not like 'bt:sesion%' then
      raise exception 'FALLO: esperaba bt:sesion y recibi %', sqlerrm;
    end if;
    raise notice 'ok: el bypass no anula la validación de sesión (% )', sqlerrm;
  end;

  update public.accounts set totp_activo = false where rol = 'ADMIN';
  update public.settings
     set valor = jsonb_set(valor, '{hasta}', 'null'), actualizada = now()
   where clave = 'mfa_bypase';
end;
$$;

select 'LISTO' as resultado;
