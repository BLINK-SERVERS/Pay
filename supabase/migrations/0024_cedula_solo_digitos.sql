-- BLINK PAY · 0024 · la cédula vive solo en dígitos
--
-- El acceso pide la cédula numérica, sin prefijo V/E. Para que la misma
-- identidad funcione en todo el sistema, la base guarda y consulta solo
-- los dígitos: se normalizan las filas existentes y los validadores dejan
-- de exigir la letra.
--
-- Es idempotente: puede aplicarse sobre una base ya normalizada.

-- ------------------------------------------------------------
-- 1. Normalizar lo que ya está guardado
-- ------------------------------------------------------------
-- La restricción vieja exige `V-` o `E-`; se retira antes de reescribir.
alter table public.accounts drop constraint if exists accounts_cedula_check;

update public.accounts
   set cedula = public.bt_solo_digitos(cedula),
       pago_cedula = public.bt_solo_digitos(pago_cedula)
 where cedula ~ '\D'
    or pago_cedula ~ '\D';

update public.accounts
   set pago_cedula = ''
 where pago_cedula is null;

alter table public.accounts drop constraint if exists accounts_pago_cedula_check;
alter table public.accounts
  add constraint accounts_cedula_check check (cedula ~ '^\d{6,8}$');
alter table public.accounts
  add constraint accounts_pago_cedula_check check (pago_cedula ~ '^(\d{6,8})?$');

update public.cards
   set cedula = nullif(public.bt_solo_digitos(cedula), '')
 where cedula is not null;

-- ------------------------------------------------------------
-- 2. Registrar: acepta dígitos y guarda dígitos
-- ------------------------------------------------------------
create or replace function public.bt_registrar(
  p_nombres text,
  p_apellidos text,
  p_cedula text,
  p_telefono text,
  p_correo text,
  p_pin text,
  p_pago_propio boolean default true,
  p_pago_banco text default '',
  p_pago_telefono text default '',
  p_pago_cedula text default ''
)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_nombres  text := trim(coalesce(p_nombres, ''));
  v_apellidos text := trim(coalesce(p_apellidos, ''));
  v_cedula   text := public.bt_solo_digitos(p_cedula);
  v_digitos  text := public.bt_solo_digitos(p_cedula);
  v_tel      text := public.bt_solo_digitos(p_telefono);
  v_correo   text := lower(trim(coalesce(p_correo, '')));
  v_propio   boolean := coalesce(p_pago_propio, true);
  v_banco    text := trim(coalesce(p_pago_banco, ''));
  v_pago_tel text := public.bt_solo_digitos(p_pago_telefono);
  v_pago_ced text := public.bt_solo_digitos(p_pago_cedula);
  v_cuenta   public.accounts;
  v_token    uuid;
begin
  if v_nombres !~ '^[^0-9]{2,60}$' then
    raise exception 'bt:datos:Revisa tu nombre: entre 2 y 60 letras, sin números.';
  end if;

  if v_apellidos !~ '^[^0-9]{2,60}$' then
    raise exception 'bt:datos:Revisa tus apellidos: entre 2 y 60 letras, sin números.';
  end if;

  if v_digitos !~ '^\d{6,8}$' then
    raise exception 'bt:datos:Escribe la cédula con 6 a 8 dígitos.';
  end if;

  if v_tel !~ '^0\d{10}$' then
    raise exception 'bt:datos:El teléfono debe tener 11 dígitos y empezar por 0 (ej. 0414-1234567).';
  end if;

  if v_correo !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'bt:datos:Escribe un correo válido (ej. nombre@correo.com).';
  end if;

  if not public.bt_pin6_valido(p_pin) then
    raise exception 'bt:pin-invalido:Elige 6 dígitos, sin repetir el mismo ni secuencias como 123456.';
  end if;

  if exists (select 1 from public.accounts where cedula_digitos = v_digitos) then
    raise exception 'bt:ya-activada:Esa cédula ya tiene una cuenta. Entra con tu PIN.';
  end if;

  if exists (select 1 from public.accounts where lower(correo) = v_correo) then
    raise exception 'bt:ya-activada:Ese correo ya está registrado. Entra con tu PIN.';
  end if;

  if v_propio then
    v_banco    := '';
    v_pago_tel := v_tel;
    v_pago_ced := v_cedula;
  else
    if length(v_banco) < 2 then
      raise exception 'bt:datos:Selecciona el banco de tu cuenta de Pago Móvil.';
    end if;

    if v_pago_tel !~ '^0\d{10}$' then
      raise exception 'bt:datos:El teléfono del Pago Móvil debe tener 11 dígitos.';
    end if;

    if v_pago_ced !~ '^\d{6,8}$' then
      raise exception 'bt:datos:Escribe la cédula del titular de la cuenta de pago.';
    end if;
  end if;

  insert into public.accounts
    (nombres, apellidos, cedula, telefono, correo, pin_hash,
     pago_propio, pago_banco, pago_telefono, pago_cedula)
  values
    (v_nombres, v_apellidos, v_cedula, v_tel, v_correo,
     extensions.crypt(p_pin, extensions.gen_salt('bf', 10)),
     v_propio, v_banco, v_pago_tel, v_pago_ced)
  returning * into v_cuenta;

  delete from public.account_sessions where expira < now();

  insert into public.account_sessions (account_id)
  values (v_cuenta.id)
  returning token into v_token;

  return jsonb_build_object('token', v_token)
    || public.bt_billetera_json(v_cuenta);
end;
$$;

-- ------------------------------------------------------------
-- 3. Actualizar el Pago Móvil: también solo dígitos
-- ------------------------------------------------------------
create or replace function public.bt_actualizar_pago(
  p_token text,
  p_propio boolean,
  p_banco text default '',
  p_telefono text default '',
  p_cedula text default ''
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_cuenta   public.accounts := public.bt_sesion_cuenta(p_token);
  v_propio   boolean := coalesce(p_propio, true);
  v_banco    text := trim(coalesce(p_banco, ''));
  v_telefono text := public.bt_solo_digitos(p_telefono);
  v_cedula   text := public.bt_solo_digitos(p_cedula);
begin
  if v_propio then
    v_banco    := '';
    v_telefono := v_cuenta.telefono;
    v_cedula   := v_cuenta.cedula;
  else
    if length(v_banco) < 2 then
      raise exception 'bt:datos:Selecciona el banco de tu cuenta de Pago Móvil.';
    end if;

    if v_telefono !~ '^0\d{10}$' then
      raise exception 'bt:datos:El teléfono del Pago Móvil debe tener 11 dígitos.';
    end if;

    if v_cedula !~ '^\d{6,8}$' then
      raise exception 'bt:datos:Escribe la cédula del titular de la cuenta de pago.';
    end if;
  end if;

  update public.accounts
     set pago_propio   = v_propio,
         pago_banco    = v_banco,
         pago_telefono = v_telefono,
         pago_cedula   = v_cedula
   where id = v_cuenta.id
  returning * into v_cuenta;

  return jsonb_build_object('cuenta', public.bt_cuenta_json(v_cuenta));
end;
$$;

-- ------------------------------------------------------------
-- 4. Permisos: se conservan los de 0005/0021
-- ------------------------------------------------------------
revoke all on function public.bt_registrar(text, text, text, text, text, text, boolean, text, text, text) from public;
revoke all on function public.bt_actualizar_pago(text, boolean, text, text, text) from public;
grant execute on function public.bt_registrar(text, text, text, text, text, text, boolean, text, text, text) to anon, authenticated;
grant execute on function public.bt_actualizar_pago(text, boolean, text, text, text) to anon, authenticated;

-- ------------------------------------------------------------
-- 5. Huella del teléfono: vinculación permanente
-- ------------------------------------------------------------
-- La biometría no guarda un token (que vence en 12 h) sino una llave
-- secreta propia de cada teléfono. Con esa llave el dispositivo reabre
-- una sesión nueva tantas veces como haga falta: seguirá funcionando
-- tras cerrar sesión, recargar la app o vencer el token, hasta que el
-- pasajero desactive la huella. Solo se conserva su hash bcrypt.
alter table public.accounts
  add column if not exists enlace_hash text;

-- Vincula el teléfono actual: devuelve la llave que el cliente guarda en
-- su almacenamiento seguro y reemplaza cualquier vínculo anterior.
create or replace function public.bt_crear_enlace(p_token text)
returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_cuenta public.accounts := public.bt_sesion_cuenta(p_token);
  v_llave  text := translate(
    encode(extensions.gen_random_bytes(32), 'base64'), '+/=', '-_');
begin
  update public.accounts
     set enlace_hash = extensions.crypt(v_llave, extensions.gen_salt('bf', 10))
   where id = v_cuenta.id;

  return v_llave;
end;
$$;

-- Reabre la sesión presentando la llave del teléfono vinculado.
create or replace function public.bt_reanudar(p_cedula text, p_llave text)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_digitos text := public.bt_solo_digitos(p_cedula);
  v_cuenta  public.accounts;
  v_token   uuid;
begin
  if v_digitos !~ '^\d{6,8}$' or length(coalesce(p_llave, '')) < 20 then
    raise exception 'bt:credenciales:La huella de este teléfono ya no es válida. Entra con tu PIN.';
  end if;

  select * into v_cuenta
    from public.accounts
   where cedula_digitos = v_digitos;

  if not found
     or coalesce(v_cuenta.enlace_hash, '') = ''
     or extensions.crypt(p_llave, v_cuenta.enlace_hash) <> v_cuenta.enlace_hash then
    raise exception 'bt:credenciales:La huella de este teléfono ya no es válida. Entra con tu PIN.';
  end if;

  delete from public.account_sessions where expira < now();

  -- Igual que el acceso con PIN: el portal nunca abre una sesión MFA.
  insert into public.account_sessions (account_id, mfa)
  values (v_cuenta.id, false)
  returning token into v_token;

  return jsonb_build_object('token', v_token)
    || public.bt_billetera_json(v_cuenta);
end;
$$;

revoke all on function public.bt_crear_enlace(text) from public;
revoke all on function public.bt_reanudar(text, text) from public;
grant execute on function public.bt_crear_enlace(text) to anon, authenticated;
grant execute on function public.bt_reanudar(text, text) to anon, authenticated;
