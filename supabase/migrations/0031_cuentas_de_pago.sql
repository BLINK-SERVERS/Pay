-- BLINK PAY · 0031 · una cuenta puede tener varias fuentes de Pago Móvil
--
-- En el repo TARJETA se escribió como 0029; aquí es 0031 por el orden real de
-- esta historia (0030_sin_tope_recarga). Mismo cuerpo, verificada en la
-- simulación con prueba-0031. Pendiente de aplicar en Supabase.
--
-- Orden del 2026-11-11: «que se puedan añadir varias cuentas de pago». Hasta
-- hoy la cuenta tenía UN Pago Móvil guardado en cuatro columnas planas
-- (accounts.pago_propio / pago_banco / pago_telefono / pago_cedula, creadas en
-- 0005). En la calle eso no se corresponde con la realidad venezolana: la misma
-- persona recarga desde su banco, desde el Pago Móvil de su pareja o desde el
-- del familiar que le pasa plata, y los cuatro campos planos obligaban a
-- borrar uno para escribir el otro.
--
-- Se agrega `pago_cuentas` (hija de accounts, muchas por cuenta) con las mismas
-- validaciones que ya hacía bt_actualizar_pago, concentradas ahora en
-- bt_pago_normalizado() para que alta, edición y registro no tengan tres
-- criterios distintos. La fila `principal` es la que el portal trae por defecto
-- al recargar.
--
-- Las columnas planas NO se borran: siguen espejando a la cuenta principal
-- porque la aplicación publicada hoy (2.1.0) lee `datosPago` de bt_cuenta_json
-- y, si dejaran de llenarse, el portal en producción se quedaría sin fuente de
-- pago en cuanto se aplique esta migración. `datosPago` se conserva en el JSON
-- por lo mismo y `cuentasPago` se añade al lado.

-- ------------------------------------------------------------
-- 1. Tabla
-- ------------------------------------------------------------
create table if not exists public.pago_cuentas (
  id         uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  propia     boolean not null default true,
  banco      text    not null default '',
  telefono   text    not null default '',
  cedula     text    not null default '',
  principal  boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pago_cuentas_banco_corto  check (char_length(banco) <= 80),
  constraint pago_cuentas_telefono_ok  check (telefono = '' or telefono ~ '^0[0-9]{10}$'),
  constraint pago_cuentas_cedula_ok    check (cedula = '' or cedula ~ '^[0-9]{6,8}$'),
  -- Nadie guarda dos veces el mismo Pago Móvil, ni siquiera con otro orden.
  constraint pago_cuentas_sin_repetida unique (account_id, propia, banco, telefono, cedula)
);

create unique index if not exists pago_cuentas_una_principal
    on public.pago_cuentas (account_id) where principal;

create index if not exists pago_cuentas_por_cuenta
    on public.pago_cuentas (account_id, principal desc, created_at);

alter table public.pago_cuentas enable row level security;

comment on table public.pago_cuentas is
  'Cuentas de Pago Móvil con las que el pasajero fondea su billetera; la principal es la que trae la recarga.';

-- ------------------------------------------------------------
-- 2. Backfill desde las columnas planas
-- ------------------------------------------------------------
insert into public.pago_cuentas (account_id, propia, banco, telefono, cedula, principal)
select a.id, a.pago_propio, a.pago_banco, a.pago_telefono, a.pago_cedula, true
  from public.accounts a
 where not exists (select 1 from public.pago_cuentas p where p.account_id = a.id)
on conflict do nothing;

-- ------------------------------------------------------------
-- 3. Validación común
-- ------------------------------------------------------------
create or replace function public.bt_pago_normalizado(
  a public.accounts,
  p_propio boolean,
  p_banco text,
  p_telefono text,
  p_cedula text
)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_propio   boolean := coalesce(p_propio, true);
  v_banco    text := trim(coalesce(p_banco, ''));
  v_telefono text := public.bt_solo_digitos(p_telefono);
  v_cedula   text := public.bt_solo_digitos(p_cedula);
begin
  -- El nombre del banco llega del directorio del cliente (tipos.ts); la base
  -- no lo lista, así que solo se corta el desbordamiento.
  if length(v_banco) > 80 then
    raise exception 'bt:datos:El banco seleccionado no es válido.';
  end if;

  if v_propio then
    -- Teléfono y cédula son los de la cuenta; el banco sí se guarda.
    v_telefono := a.telefono;
    v_cedula   := a.cedula;
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

  return jsonb_build_object(
    'propio', v_propio, 'banco', v_banco, 'telefono', v_telefono, 'cedula', v_cedula);
end;
$$;

-- ------------------------------------------------------------
-- 4. Lectura
-- ------------------------------------------------------------
create or replace function public.bt_pago_cuenta_json(p public.pago_cuentas)
returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'id',        p.id,
    'propio',    p.propia,
    'banco',     p.banco,
    'telefono',  p.telefono,
    'cedula',    p.cedula,
    'principal', p.principal
  );
$$;

create or replace function public.bt_cuentas_pago(a public.accounts)
returns jsonb
language sql stable as $$
  select coalesce(
    jsonb_agg(public.bt_pago_cuenta_json(p)
              order by p.principal desc, p.created_at),
    '[]'::jsonb
  )
    from public.pago_cuentas p
   where p.account_id = a.id;
$$;

create or replace function public.bt_cuenta_json(a public.accounts)
returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'nombres',   a.nombres,
    'apellidos', a.apellidos,
    'cedula',    a.cedula,
    'telefono',  a.telefono,
    'correo',    a.correo,
    'rol',       a.rol,
    -- Las cuentas de pago completas…
    'cuentasPago', public.bt_cuentas_pago(a),
    -- …y el espejo de la principal, que es lo que lee la app publicada hoy.
    'datosPago', jsonb_build_object(
                   'propio',   a.pago_propio,
                   'banco',    a.pago_banco,
                   'telefono', a.pago_telefono,
                   'cedula',   a.pago_cedula)
  );
$$;

-- ------------------------------------------------------------
-- 5. Escritura
-- ------------------------------------------------------------
-- Después de cualquier cambio: si no quedó ninguna principal, la principal es
-- la más antigua; y las columnas planas se vuelven a espejar.
create or replace function public.bt_cierre_pago_cuentas(p_cuenta uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_principal public.pago_cuentas;
begin
  update public.pago_cuentas
     set principal = true
   where id = (
     select p.id from public.pago_cuentas p
      where p.account_id = p_cuenta
      order by p.created_at
      limit 1
   )
     and not exists (
       select 1 from public.pago_cuentas p
        where p.account_id = p_cuenta and p.principal
     );

  select * into v_principal
    from public.pago_cuentas p
   where p.account_id = p_cuenta
     and p.principal;

  update public.accounts
     set pago_propio   = coalesce(v_principal.propia, true),
         pago_banco    = coalesce(v_principal.banco, ''),
         pago_telefono = coalesce(v_principal.telefono, ''),
         pago_cedula   = coalesce(v_principal.cedula, '')
   where id = p_cuenta;
end;
$$;

create or replace function public.bt_alta_cuenta_pago(
  p_token text,
  p_propio boolean,
  p_banco text default '',
  p_telefono text default '',
  p_cedula text default ''
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_cuenta public.accounts := public.bt_sesion_cuenta(p_token);
  v_ok     jsonb := public.bt_pago_normalizado(v_cuenta, p_propio, p_banco, p_telefono, p_cedula);
  v_total  int;
begin
  select count(*) into v_total from public.pago_cuentas where account_id = v_cuenta.id;

  -- Tope antispam: no es una billetera infinita de terceros.
  if v_total >= 10 then
    raise exception 'bt:datos:Ya tienes 10 cuentas de Pago Móvil. Borra una antes de añadir otra.';
  end if;

  if exists (
    select 1 from public.pago_cuentas p
     where p.account_id = v_cuenta.id
       and p.propia   = (v_ok ->> 'propio')::boolean
       and p.banco    = v_ok ->> 'banco'
       and p.telefono = v_ok ->> 'telefono'
       and p.cedula   = v_ok ->> 'cedula'
  ) then
    raise exception 'bt:datos:Esa cuenta de Pago Móvil ya está en tu lista.';
  end if;

  insert into public.pago_cuentas
    (account_id, propia, banco, telefono, cedula, principal)
  values
    (v_cuenta.id, (v_ok ->> 'propio')::boolean, v_ok ->> 'banco',
     v_ok ->> 'telefono', v_ok ->> 'cedula', v_total = 0);

  perform public.bt_cierre_pago_cuentas(v_cuenta.id);

  select * into v_cuenta from public.accounts where id = v_cuenta.id;
  return jsonb_build_object('cuenta', public.bt_cuenta_json(v_cuenta));
end;
$$;

create or replace function public.bt_editar_cuenta_pago(
  p_token text,
  p_id uuid,
  p_propio boolean,
  p_banco text default '',
  p_telefono text default '',
  p_cedula text default ''
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_cuenta public.accounts := public.bt_sesion_cuenta(p_token);
  v_ok     jsonb := public.bt_pago_normalizado(v_cuenta, p_propio, p_banco, p_telefono, p_cedula);
  v_pago   public.pago_cuentas;
begin
  select * into v_pago
    from public.pago_cuentas
   where id = p_id
     and account_id = v_cuenta.id;

  if not found then
    raise exception 'bt:datos:Esa cuenta de Pago Móvil no está en tu lista.';
  end if;

  if exists (
    select 1 from public.pago_cuentas q
     where q.account_id = v_cuenta.id
       and q.id <> v_pago.id
       and q.propia   = (v_ok ->> 'propio')::boolean
       and q.banco    = v_ok ->> 'banco'
       and q.telefono = v_ok ->> 'telefono'
       and q.cedula   = v_ok ->> 'cedula'
  ) then
    raise exception 'bt:datos:Esa cuenta de Pago Móvil ya está en tu lista.';
  end if;

  update public.pago_cuentas
     set propia   = (v_ok ->> 'propio')::boolean,
         banco    = v_ok ->> 'banco',
         telefono = v_ok ->> 'telefono',
         cedula   = v_ok ->> 'cedula',
         updated_at = now()
   where id = v_pago.id;

  perform public.bt_cierre_pago_cuentas(v_cuenta.id);

  select * into v_cuenta from public.accounts where id = v_cuenta.id;
  return jsonb_build_object('cuenta', public.bt_cuenta_json(v_cuenta));
end;
$$;

create or replace function public.bt_borrar_cuenta_pago(p_token text, p_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_cuenta public.accounts := public.bt_sesion_cuenta(p_token);
  v_total  int;
begin
  select count(*) into v_total from public.pago_cuentas where account_id = v_cuenta.id;

  if v_total <= 1 then
    raise exception 'bt:datos:Necesitas al menos una cuenta de Pago Móvil.';
  end if;

  delete from public.pago_cuentas
   where id = p_id
     and account_id = v_cuenta.id;

  if not found then
    raise exception 'bt:datos:Esa cuenta de Pago Móvil no está en tu lista.';
  end if;

  perform public.bt_cierre_pago_cuentas(v_cuenta.id);

  select * into v_cuenta from public.accounts where id = v_cuenta.id;
  return jsonb_build_object('cuenta', public.bt_cuenta_json(v_cuenta));
end;
$$;

-- La principal es la que Recargar trae por defecto.
create or replace function public.bt_usar_cuenta_pago(p_token text, p_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_cuenta public.accounts := public.bt_sesion_cuenta(p_token);
begin
  update public.pago_cuentas
     set principal = (id = p_id)
   where account_id = v_cuenta.id;

  if not exists (
    select 1 from public.pago_cuentas
     where id = p_id and account_id = v_cuenta.id and principal
  ) then
    raise exception 'bt:datos:Esa cuenta de Pago Móvil no está en tu lista.';
  end if;

  perform public.bt_cierre_pago_cuentas(v_cuenta.id);

  select * into v_cuenta from public.accounts where id = v_cuenta.id;
  return jsonb_build_object('cuenta', public.bt_cuenta_json(v_cuenta));
end;
$$;

-- bt_actualizar_pago pasa a escribir la cuenta principal; así «Mis datos»
-- sigue siendo el formulario de la fuente de pago que se usa al recargar.
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
  v_cuenta public.accounts := public.bt_sesion_cuenta(p_token);
  v_ok     jsonb := public.bt_pago_normalizado(v_cuenta, p_propio, p_banco, p_telefono, p_cedula);
  v_pago   public.pago_cuentas;
begin
  select * into v_pago
    from public.pago_cuentas p
   where p.account_id = v_cuenta.id
   order by p.principal desc, p.created_at
   limit 1;

  if v_pago.id is null then
    insert into public.pago_cuentas (account_id, propia, banco, telefono, cedula, principal)
    values (v_cuenta.id, (v_ok ->> 'propio')::boolean, v_ok ->> 'banco',
            v_ok ->> 'telefono', v_ok ->> 'cedula', true)
    returning * into v_pago;
  else
    update public.pago_cuentas
       set propia   = (v_ok ->> 'propio')::boolean,
           banco    = v_ok ->> 'banco',
           telefono = v_ok ->> 'telefono',
           cedula   = v_ok ->> 'cedula',
           principal = true,
           updated_at = now()
     where id = v_pago.id;
  end if;

  perform public.bt_cierre_pago_cuentas(v_cuenta.id);

  select * into v_cuenta from public.accounts where id = v_cuenta.id;
  return jsonb_build_object('cuenta', public.bt_cuenta_json(v_cuenta));
end;
$$;

-- El registro crea la primera cuenta de pago con los datos que ya valida
-- bt_registrar en las columnas planas.
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

  insert into public.pago_cuentas
    (account_id, propia, banco, telefono, cedula, principal)
  values
    (v_cuenta.id, v_propio, v_banco, v_pago_tel, v_pago_ced, true);

  delete from public.account_sessions where expira < now();

  insert into public.account_sessions (account_id)
  values (v_cuenta.id)
  returning token into v_token;

  return jsonb_build_object('token', v_token)
    || public.bt_billetera_json(v_cuenta);
end;
$$;

-- ------------------------------------------------------------
-- 6. Permisos
-- ------------------------------------------------------------
revoke all on function public.bt_pago_cuenta_json(public.pago_cuentas)   from public, anon, authenticated;
revoke all on function public.bt_cuentas_pago(public.accounts)           from public, anon, authenticated;
revoke all on function public.bt_pago_normalizado(public.accounts, boolean, text, text, text)
  from public, anon, authenticated;
revoke all on function public.bt_cierre_pago_cuentas(uuid)               from public, anon, authenticated;

revoke all on function public.bt_alta_cuenta_pago(text, boolean, text, text, text)
  from public, anon, authenticated;
revoke all on function public.bt_editar_cuenta_pago(text, uuid, boolean, text, text, text)
  from public, anon, authenticated;
revoke all on function public.bt_borrar_cuenta_pago(text, uuid)          from public, anon, authenticated;
revoke all on function public.bt_usar_cuenta_pago(text, uuid)            from public, anon, authenticated;
revoke all on function public.bt_actualizar_pago(text, boolean, text, text, text)
  from public, anon, authenticated;
revoke all on function public.bt_registrar(text, text, text, text, text, text, boolean, text, text, text)
  from public, anon, authenticated;

grant execute on function public.bt_alta_cuenta_pago(text, boolean, text, text, text)
  to anon, authenticated;
grant execute on function public.bt_editar_cuenta_pago(text, uuid, boolean, text, text, text)
  to anon, authenticated;
grant execute on function public.bt_borrar_cuenta_pago(text, uuid)       to anon, authenticated;
grant execute on function public.bt_usar_cuenta_pago(text, uuid)         to anon, authenticated;
grant execute on function public.bt_actualizar_pago(text, boolean, text, text, text)
  to anon, authenticated;
grant execute on function public.bt_registrar(text, text, text, text, text, text, boolean, text, text, text)
  to anon, authenticated;

comment on function public.bt_alta_cuenta_pago(text, boolean, text, text, text) is
  'Añade una cuenta de Pago Móvil a la cuenta de la sesión; la primera nace principal.';
comment on function public.bt_usar_cuenta_pago(text, uuid) is
  'Marca una cuenta de Pago Móvil como la que trae la recarga por defecto.';
