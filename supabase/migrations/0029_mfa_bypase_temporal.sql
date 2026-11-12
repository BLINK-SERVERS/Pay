-- BLINK PAY · 0029 · bypass temporal del segundo factor (riesgo R-07)
--
-- El back-office exige MFA activo en `bt_admin_sesion_mfa`, que es la única
-- puerta por la que pasan todas las operaciones administrativas. En la práctica
-- nadie la cruza: cada vez que se abre el cuadro de inscripción se genera un
-- secreto nuevo, así que el QR que el teléfono ya escaneó deja de servir y el
-- operador no consegue completar el paso.
--
-- Mientras se arregla la inscripción, esta migración habilita un bypass que:
--   1. caduca solo (`hasta`), sin código que lo re-encienda,
--   2. sólo se escribe con SQL directo como propietario — `anon` no tiene
--      permisos sobre `settings` y la tabla tiene RLS sin políticas, así que
--      ninguna ruta pública lo lee ni lo modifica,
--   3. deja rastro: cada sesión abierta durante el bypass nace marcada en
--      `account_sessions.bypase_mfa`,
--   4. avisa en la interfaz (`bt_admin_estado` devuelve `mfaBypase`).
--
--   Encender 72 horas:
--     update public.settings
--        set valor = jsonb_set(valor, '{hasta}', to_jsonb(now() + interval '72 hours')),
--            actualizada = now()
--      where clave = 'mfa_bypase';
--   Apagar antes de tiempo:
--     update public.settings
--        set valor = jsonb_set(valor, '{hasta}', 'null'), actualizada = now()
--      where clave = 'mfa_bypase';
--
-- Verificación: simulacion/prueba-0029.sql. Idempotente.

-- ------------------------------------------------------------
-- 1. El control del bypass
-- ------------------------------------------------------------

insert into public.settings (clave, valor)
values ('mfa_bypase', '{"hasta": null, "motivo": null}'::jsonb)
on conflict (clave) do nothing;

comment on column public.settings.valor is
  'Contenido de la clave en JSON. La clave `mfa_bypase` guarda hasta cuándo sigue abierto el segundo factor; no la expongan por ninguna ruta pública.';

create or replace function public.bt_mfa_bypase_hasta()
returns timestamptz
language sql stable security definer
set search_path = public
as $$
  select (valor ->> 'hasta')::timestamptz
    from public.settings
   where clave = 'mfa_bypase';
$$;

create or replace function public.bt_mfa_bypase_activo()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce(now() < public.bt_mfa_bypase_hasta(), false);
$$;

revoke all on function public.bt_mfa_bypase_hasta() from public, anon, authenticated;
revoke all on function public.bt_mfa_bypase_activo() from public, anon, authenticated;

-- ------------------------------------------------------------
-- 2. La puerta: un solo early-return
-- ------------------------------------------------------------

create or replace function public.bt_admin_sesion_mfa(p_token text)
returns accounts
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_cuenta public.accounts := public.bt_admin_sesion(p_token);
  v_sesion_mfa boolean;
begin
  -- La sesión sigue siendo válida aunque esté bypassada: `bt_admin_sesion`
  -- ya rechazó token inexistente o vencido antes de llegar aquí.
  if public.bt_mfa_bypase_activo() then
    return v_cuenta;
  end if;

  select s.mfa into v_sesion_mfa
    from public.account_sessions s
   where s.token::text = coalesce(p_token, '')
     and s.expira > now();

  if not v_cuenta.totp_activo then
    raise exception 'bt:mfa:Activa la verificación en dos pasos antes de operar.';
  end if;

  if not coalesce(v_sesion_mfa, false) then
    raise exception 'bt:mfa:Esta sesión no completó la verificación en dos pasos. Vuelve a entrar con tu código.';
  end if;

  return v_cuenta;
end;
$$;

-- ------------------------------------------------------------
-- 3. Rastro por sesión
-- ------------------------------------------------------------

alter table public.account_sessions
  add column if not exists bypase_mfa boolean not null default false;

comment on column public.account_sessions.bypase_mfa is
  'La sesión se abrió con el segundo factor en bypass (R-07). Nunca la pone el cliente.';

-- El alta de sesión es la única escritura: aqui se marca si al entrar el
-- bypass estaba encendido.
create or replace function public.bt_admin_entrar(
  p_cedula text,
  p_pin text,
  p_codigo text default ''
)
returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_digitos text := public.bt_solo_digitos(p_cedula);
  v_cuenta  public.accounts;
  v_token   uuid;
  v_fallos  int;
  v_contador bigint;
  v_bypase  boolean := public.bt_mfa_bypase_activo();
begin
  if v_digitos !~ '^\d{6,8}$' then
    raise exception 'bt:sin-tarjeta:No encontramos una cuenta con esa cédula.';
  end if;

  select * into v_cuenta
    from public.accounts
   where cedula_digitos = v_digitos
     for update;

  if not found then
    raise exception 'bt:sin-tarjeta:No encontramos una cuenta con esa cédula.';
  end if;

  if v_cuenta.rol not in ('ADMIN', 'TAQUILLA') then
    return jsonb_build_object(
      'error', 'permiso',
      'mensaje', 'Esta cuenta no tiene acceso al back-office.');
  end if;

  if v_cuenta.bloqueado_hasta is not null and v_cuenta.bloqueado_hasta > now() then
    raise exception 'bt:credenciales:Demasiados intentos fallidos. Espera % min.',
      greatest(1, ceil(extract(epoch from (v_cuenta.bloqueado_hasta - now())) / 60)::int);
  end if;

  if extensions.crypt(coalesce(p_pin, ''), v_cuenta.pin_hash) <> v_cuenta.pin_hash then
    v_fallos := case
      when v_cuenta.bloqueado_hasta is not null and v_cuenta.bloqueado_hasta <= now() then 1
      else v_cuenta.intentos + 1
    end;

    update public.accounts
       set intentos = v_fallos,
           bloqueado_hasta = case when v_fallos >= 5 then now() + interval '5 minutes' end
     where id = v_cuenta.id;

    if v_fallos >= 5 then
      return jsonb_build_object(
        'error', 'credenciales',
        'mensaje', 'Demasiados intentos fallidos. Espera 5 min o recupera tu PIN en atención al cliente.');
    end if;

    return jsonb_build_object(
      'error', 'credenciales',
      'mensaje', 'El PIN no coincide. Inténtalo de nuevo.');
  end if;

  if v_cuenta.totp_activo then
    v_contador := public.bt_totp_contador(v_cuenta.totp_secret, p_codigo);

    if v_contador is null
       or v_contador <= coalesce(v_cuenta.totp_ultimo_contador, 0) then
      v_fallos := v_cuenta.intentos + 1;

      update public.accounts
         set intentos = v_fallos,
             bloqueado_hasta = case when v_fallos >= 5 then now() + interval '5 minutes' end
       where id = v_cuenta.id;

      if v_fallos >= 5 then
        return jsonb_build_object(
          'error', 'credenciales',
          'mensaje', 'Demasiados códigos fallidos. Espera 5 min antes de volver a intentar.');
      end if;

      return jsonb_build_object(
        'error', 'mfa',
        'mensaje', 'El código de verificación no es válido, venció o ya fue usado.');
    end if;

    update public.accounts
       set totp_ultimo_contador = v_contador
     where id = v_cuenta.id;
  end if;

  update public.accounts
     set intentos = 0, bloqueado_hasta = null
   where id = v_cuenta.id;

  delete from public.account_sessions where expira < now();

  insert into public.account_sessions (account_id, mfa, bypase_mfa)
  values (v_cuenta.id, v_cuenta.totp_activo, v_bypase and not v_cuenta.totp_activo)
  returning token into v_token;

  return jsonb_build_object(
    'token', v_token,
    'rol', v_cuenta.rol,
    'mfa', v_cuenta.totp_activo,
    'mfaPendiente', not v_cuenta.totp_activo,
    'sesionMfa', v_cuenta.totp_activo,
    'mfaBypase', v_bypase and not v_cuenta.totp_activo,
    'cuenta', public.bt_cuenta_json(v_cuenta));
end;
$$;

-- El panel consulta el estado al cargar; así el aviso es cierto aunque la
-- sesión se abriera antes de encender el bypass.
create or replace function public.bt_admin_estado(p_token text)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_cuenta public.accounts := public.bt_admin_sesion(p_token);
  v_sesion_mfa boolean;
begin
  select s.mfa into v_sesion_mfa
    from public.account_sessions s
   where s.token::text = coalesce(p_token, '')
     and s.expira > now();

  return jsonb_build_object(
    'rol', v_cuenta.rol,
    'mfa', v_cuenta.totp_activo,
    'mfaPendiente', not v_cuenta.totp_activo,
    'sesionMfa', coalesce(v_sesion_mfa, false),
    'mfaBypase', public.bt_mfa_bypase_activo() and not v_cuenta.totp_activo,
    'cuenta', public.bt_cuenta_json(v_cuenta));
end;
$$;
