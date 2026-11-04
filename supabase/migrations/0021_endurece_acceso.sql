-- ============================================================
-- BLINK · endurece el acceso y los contadores de PIN
-- Ejecutar después de 0020_chip_monto_base.sql.
--
-- Corrige debilidades encontradas en la auditoría de seguridad:
--
--   1. Una sesión abierta solo con PIN podía llamar al back-office
--      aunque la cuenta tuviera MFA activo. Ahora la sesión guarda si
--      pasó el segundo factor y `bt_admin_sesion_mfa` lo exige.
--   2. El PIN de cambio no tenía contador: una sesión robada podía
--      probar los 10 000 PIN sin límite. Ahora comparte el bloqueo de
--      5 intentos / 5 minutos del acceso.
--   3. TOTP aceptaba reutilizar el mismo código y no limitaba los
--      intentos. Ahora recuerda el último contador y cuenta los fallos.
--   4. `bt_entrar`, `bt_admin_entrar` y `bt_vincular` leían la fila sin
--      `for update`, así que peticiones simultáneas podían saltarse el
--      bloqueo. Ahora se serializan por cuenta.
--   5. `bt_vincular` permitía probar seriales sin límite. Ahora corta a
--      los 10 fallos en 15 minutos.
--   6. Reportar una recarga no bloqueaba la tarjeta ni comprobaba que
--      siguiera activa y vigente. Ahora lo hace.
--
-- No cambia contratos del cliente: los fallos que deben persistir
-- vuelven como `{error, mensaje}` (el portal los convierte en
-- ErrorBlink) en lugar de lanzar y perder la escritura del contador.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Estado nuevo
-- ------------------------------------------------------------
alter table public.accounts
  add column if not exists totp_ultimo_contador bigint,
  add column if not exists vincular_intentos int not null default 0
    check (vincular_intentos >= 0),
  add column if not exists vincular_hasta timestamptz;

alter table public.account_sessions
  add column if not exists mfa boolean not null default false;

comment on column public.account_sessions.mfa is
  'TRUE solo cuando esta sesión completó el TOTP del back-office.';
comment on column public.accounts.totp_ultimo_contador is
  'Último paso TOTP aceptado; impide reutilizar el mismo código.';

-- ------------------------------------------------------------
-- 2. TOTP sin repetición
-- ------------------------------------------------------------

-- Devuelve el paso de 30 s que coincide con el código, o NULL. Se
-- prueban -1, 0 y +1 y se devuelve el mayor para que un código que
-- sirve en dos ventanas no pueda reutilizarse en la siguiente.
create or replace function public.bt_totp_contador(p_secreto text, p_codigo text)
returns bigint
language plpgsql stable security definer set search_path = public, extensions as $$
declare
  v_t bigint;
  v_encontrado bigint;
  d int;
begin
  if coalesce(p_secreto, '') = '' or coalesce(p_codigo, '') !~ '^\d{6}$' then
    return null;
  end if;

  v_t := floor(extract(epoch from now()) / 30)::bigint;

  for d in 0..2 loop
    if public.bt_totp_codigo(p_secreto, v_t + (1 - d)) = p_codigo then
      v_encontrado := v_t + (1 - d);
      exit;
    end if;
  end loop;

  return v_encontrado;
end;
$$;

create or replace function public.bt_totp_valido(p_secreto text, p_codigo text)
returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select public.bt_totp_contador(p_secreto, p_codigo) is not null;
$$;

-- ------------------------------------------------------------
-- 3. Sesiones del back-office
-- ------------------------------------------------------------

-- Sesión válida de un operador. No exige MFA: sirve para el primer
-- alta del segundo factor y para consultar el estado.
create or replace function public.bt_admin_sesion(p_token text)
returns public.accounts
language plpgsql stable security definer set search_path = public as $$
declare
  v_cuenta public.accounts;
begin
  select a.* into v_cuenta
    from public.account_sessions s
    join public.accounts a on a.id = s.account_id
   where s.token::text = coalesce(p_token, '')
     and s.expira > now();

  if not found then
    raise exception 'bt:sesion:Tu sesión venció. Vuelve a entrar.';
  end if;

  if v_cuenta.rol not in ('ADMIN', 'TAQUILLA') then
    raise exception 'bt:permiso:Esta cuenta no tiene acceso al back-office.';
  end if;

  return v_cuenta;
end;
$$;

-- Operar exige que ESTA sesión haya pasado el TOTP, no solo que la
-- cuenta tenga un segundo factor inscrito.
create or replace function public.bt_admin_sesion_mfa(p_token text)
returns public.accounts
language plpgsql stable security definer set search_path = public as $$
declare
  v_cuenta public.accounts := public.bt_admin_sesion(p_token);
  v_sesion_mfa boolean;
begin
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

-- La inscripción y activación del segundo factor pueden hacerse con
-- una sesión solo-PIN únicamente la primera vez. Si ya está activo,
-- se exige una sesión que haya pasado el TOTP: así una sesión robada
-- no puede re-inscribir el autenticador.
create or replace function public.bt_admin_sesion_config(p_token text)
returns public.accounts
language plpgsql stable security definer set search_path = public as $$
declare
  v_cuenta public.accounts := public.bt_admin_sesion(p_token);
begin
  if v_cuenta.totp_activo then
    return public.bt_admin_sesion_mfa(p_token);
  end if;

  return v_cuenta;
end;
$$;

-- ------------------------------------------------------------
-- 4. Acceso del operador: bloqueo y replay
-- ------------------------------------------------------------
create or replace function public.bt_admin_entrar(
  p_cedula text,
  p_pin text,
  p_codigo text default ''
)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_digitos text := public.bt_solo_digitos(p_cedula);
  v_cuenta  public.accounts;
  v_token   uuid;
  v_fallos  int;
  v_contador bigint;
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

  insert into public.account_sessions (account_id, mfa)
  values (v_cuenta.id, v_cuenta.totp_activo)
  returning token into v_token;

  return jsonb_build_object(
    'token', v_token,
    'rol', v_cuenta.rol,
    'mfa', v_cuenta.totp_activo,
    'mfaPendiente', not v_cuenta.totp_activo,
    'sesionMfa', v_cuenta.totp_activo,
    'cuenta', public.bt_cuenta_json(v_cuenta));
end;
$$;

create or replace function public.bt_admin_estado(p_token text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
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
    'cuenta', public.bt_cuenta_json(v_cuenta));
end;
$$;

-- ------------------------------------------------------------
-- 5. Inscripción y activación del segundo factor
-- ------------------------------------------------------------
create or replace function public.bt_admin_mfa_inscribir(p_token text)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_alfabeto text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  v_cuenta public.accounts := public.bt_admin_sesion_config(p_token);
  v_secreto text := '';
  v_uri text;
  i int;
begin
  for i in 1..32 loop
    v_secreto := v_secreto || substr(v_alfabeto, (get_byte(extensions.gen_random_bytes(1), 0) % 32) + 1, 1);
  end loop;

  update public.accounts
     set totp_secret = v_secreto,
         totp_activo = false,
         totp_confirmado_at = null,
         totp_ultimo_contador = null
   where id = v_cuenta.id;

  v_uri := 'otpauth://totp/BLINK%20Backoffice:' || replace(v_cuenta.cedula, ' ', '')
        || '?secret=' || v_secreto
        || '&issuer=BLINK&algorithm=SHA1&digits=6&period=30';

  return jsonb_build_object('secreto', v_secreto, 'uri', v_uri);
end;
$$;

create or replace function public.bt_admin_mfa_activar(p_token text, p_codigo text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_cuenta public.accounts := public.bt_admin_sesion_config(p_token);
  v_contador bigint;
begin
  if coalesce(v_cuenta.totp_secret, '') = '' then
    return jsonb_build_object(
      'error', 'mfa',
      'mensaje', 'Primero inscribe el dispositivo.');
  end if;

  v_contador := public.bt_totp_contador(v_cuenta.totp_secret, p_codigo);
  if v_contador is null then
    return jsonb_build_object(
      'error', 'mfa',
      'mensaje', 'El código no coincide. Revisa la hora del teléfono.');
  end if;

  update public.accounts
     set totp_activo = true,
         totp_confirmado_at = now(),
         totp_ultimo_contador = v_contador
   where id = v_cuenta.id;

  -- Acaba de demostrar posesión del segundo factor: la sesión actual
  -- puede operar sin obligar a un nuevo ingreso.
  update public.account_sessions
     set mfa = true
   where token::text = coalesce(p_token, '')
     and expira > now();

  return jsonb_build_object('ok', true);
end;
$$;

-- ------------------------------------------------------------
-- 6. Acceso del pasajero serializado
-- ------------------------------------------------------------
create or replace function public.bt_entrar(p_cedula text, p_pin text)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_digitos text := public.bt_solo_digitos(p_cedula);
  v_cuenta  public.accounts;
  v_token   uuid;
  v_fallos  int;
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

  if v_cuenta.bloqueado_hasta is not null and v_cuenta.bloqueado_hasta > now() then
    raise exception 'bt:credenciales:Demasiados intentos fallidos. Espera % min o recupera tu PIN en atención al cliente.',
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
        'mensaje', 'Demasiados intentos fallidos. Espera 5 min o recupera tu PIN en atención al cliente.'
      );
    end if;

    return jsonb_build_object(
      'error', 'credenciales',
      'mensaje', 'El PIN no coincide. Inténtalo de nuevo.'
    );
  end if;

  update public.accounts
     set intentos = 0, bloqueado_hasta = null
   where id = v_cuenta.id;

  delete from public.account_sessions where expira < now();

  -- El portal del pasajero nunca abre una sesión MFA: si la cuenta es
  -- de operador, sus RPC de back-office seguirán exigiendo el TOTP.
  insert into public.account_sessions (account_id, mfa)
  values (v_cuenta.id, false)
  returning token into v_token;

  return jsonb_build_object('token', v_token)
    || public.bt_billetera_json(v_cuenta);
end;
$$;

-- ------------------------------------------------------------
-- 7. Cambio de PIN con el mismo bloqueo del acceso
-- ------------------------------------------------------------
create or replace function public.bt_cambiar_pin(p_token text, p_actual text, p_nuevo text)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_cuenta public.accounts := public.bt_sesion_cuenta(p_token);
  v_fallos int;
begin
  select * into v_cuenta
    from public.accounts
   where id = v_cuenta.id
     for update;

  if v_cuenta.bloqueado_hasta is not null and v_cuenta.bloqueado_hasta > now() then
    return jsonb_build_object(
      'error', 'credenciales',
      'mensaje', format(
        'Demasiados intentos fallidos. Espera %s min o recupera tu PIN en atención al cliente.',
        greatest(1, ceil(extract(epoch from (v_cuenta.bloqueado_hasta - now())) / 60)::int)
      )
    );
  end if;

  if extensions.crypt(coalesce(p_actual, ''), v_cuenta.pin_hash) <> v_cuenta.pin_hash then
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
        'mensaje', 'Demasiados intentos fallidos. Espera 5 min o recupera tu PIN en atención al cliente.'
      );
    end if;

    return jsonb_build_object(
      'error', 'credenciales',
      'mensaje', 'El PIN actual no coincide. Inténtalo de nuevo.'
    );
  end if;

  if not public.bt_pin6_valido(p_nuevo) then
    return jsonb_build_object(
      'error', 'pin-invalido',
      'mensaje', 'Elige 6 dígitos, sin repetir el mismo ni secuencias como 123456.'
    );
  end if;

  if p_nuevo = p_actual then
    return jsonb_build_object(
      'error', 'pin-invalido',
      'mensaje', 'El PIN nuevo debe ser distinto al actual.'
    );
  end if;

  update public.accounts
     set pin_hash = extensions.crypt(p_nuevo, extensions.gen_salt('bf', 10)),
         intentos = 0,
         bloqueado_hasta = null
   where id = v_cuenta.id;

  -- Cambiar la llave cierra las demás sesiones: si alguien más estaba
  -- dentro con el PIN viejo, deja de estar dentro.
  delete from public.account_sessions
   where account_id = v_cuenta.id
     and token::text <> coalesce(p_token, '');

  return jsonb_build_object('ok', true);
end;
$$;

-- ------------------------------------------------------------
-- 8. Vincular con límite de intentos
-- ------------------------------------------------------------
create or replace function public.bt_vincular_fallar(
  p_cuenta public.accounts,
  p_codigo text,
  p_mensaje text
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_intentos int := case
    when p_cuenta.vincular_hasta is not null and p_cuenta.vincular_hasta <= now() then 1
    else p_cuenta.vincular_intentos + 1
  end;
begin
  update public.accounts
     set vincular_intentos = v_intentos,
         vincular_hasta = case when v_intentos >= 10 then now() + interval '15 minutes' end
   where id = p_cuenta.id;

  if v_intentos >= 10 then
    return jsonb_build_object(
      'error', 'credenciales',
      'mensaje', 'Demasiados seriales incorrectos. Espera 15 min antes de volver a intentar.'
    );
  end if;

  return jsonb_build_object('error', p_codigo, 'mensaje', p_mensaje);
end;
$$;

create or replace function public.bt_vincular(p_token text, p_serial text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_cuenta  public.accounts := public.bt_sesion_cuenta(p_token);
  v_serial  text := upper(trim(coalesce(p_serial, '')));
  v_tarjeta public.cards;
begin
  select * into v_cuenta
    from public.accounts
   where id = v_cuenta.id
     for update;

  if v_cuenta.vincular_hasta is not null and v_cuenta.vincular_hasta > now() then
    return jsonb_build_object(
      'error', 'credenciales',
      'mensaje', format(
        'Demasiados seriales incorrectos. Espera %s min antes de volver a intentar.',
        greatest(1, ceil(extract(epoch from (v_cuenta.vincular_hasta - now())) / 60)::int)
      )
    );
  end if;

  if v_serial !~ '^[AGE]-[0-9]{5}-[0-9]{3}-[A-HJ-NPR-Z]$'
     or not public.bt_luhn_valido(v_serial) then
    return public.bt_vincular_fallar(
      v_cuenta, 'datos', 'El serial tiene el formato G-00001-001-N.');
  end if;

  select * into v_tarjeta from public.cards where visible_id = v_serial for update;

  if not found then
    return public.bt_vincular_fallar(
      v_cuenta, 'sin-tarjeta', 'No encontramos ese serial. Revisa el número impreso.');
  end if;

  if v_tarjeta.chip_uid is null then
    return public.bt_vincular_fallar(
      v_cuenta, 'sin-enrolar',
      'Esa tarjeta todavía no está enrolada. Pasa por taquilla antes de vincularla.');
  end if;

  if not public.bt_tarjeta_vigente(v_tarjeta) then
    return public.bt_vincular_fallar(
      v_cuenta, 'sin-tarjeta', 'Esa tarjeta venció. Pasa por taquilla para renovarla.');
  end if;

  if v_tarjeta.status in ('BLOCKED', 'LOST', 'SCRAP') then
    return public.bt_vincular_fallar(
      v_cuenta, 'bloqueada',
      'Esa tarjeta no está disponible. Comunícate con atención al cliente.');
  end if;

  if v_tarjeta.account_id = v_cuenta.id then
    return public.bt_vincular_fallar(
      v_cuenta, 'duplicada', 'Esa tarjeta ya está en tu billetera.');
  end if;

  if v_tarjeta.account_id is not null then
    return public.bt_vincular_fallar(
      v_cuenta, 'ya-activada',
      'Esa tarjeta ya está vinculada a otra cuenta. Verifica el serial.');
  end if;

  update public.cards
     set account_id   = v_cuenta.id,
         nombre       = v_cuenta.nombres || ' ' || v_cuenta.apellidos,
         status       = 'ACTIVE',
         asignada_at  = now(),
         asignada_por = 'portal'
   where id = v_tarjeta.id;

  insert into public.card_events (card_id, evento, canal, operador, detalle)
  values (v_tarjeta.id, 'ASIGNADA', 'portal', v_cuenta.cedula,
          jsonb_build_object('lote', v_tarjeta.batch_id, 'cuenta', v_cuenta.id));

  update public.accounts
     set vincular_intentos = 0,
         vincular_hasta = null
   where id = v_cuenta.id;

  return public.bt_billetera_json(v_cuenta);
end;
$$;

-- ------------------------------------------------------------
-- 9. Recarga: bloquear la tarjeta y exigir que siga usable
-- ------------------------------------------------------------
create or replace function public.bt_recargar_pasajes(
  p_token text,
  p_serial text,
  p_pasajes int,
  p_telefono text,
  p_banco text,
  p_referencia text
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_cuenta     public.accounts := public.bt_sesion_cuenta(p_token);
  v_tarjeta    public.cards := public.bt_tarjeta_de_cuenta(v_cuenta, p_serial);
  v_tope       numeric := public.bt_tope_recarga();
  v_pasajes    int := coalesce(p_pasajes, 0);
  v_base       numeric;
  v_cotizacion jsonb;
  v_total      numeric;
  v_acreditado numeric;
  v_tel        text := public.bt_solo_digitos(p_telefono);
  v_banco      text := trim(coalesce(p_banco, ''));
  v_ref_dig    text := public.bt_solo_digitos(p_referencia);
  v_ref        text;
  v_movimiento public.card_movements;
  v_reportes   int;
begin
  -- Serializa reportes concurrentes de la misma tarjeta: sin esto dos
  -- peticiones podían pasar a la vez la comprobación de duplicados.
  select * into v_tarjeta
    from public.cards
   where id = v_tarjeta.id
     for update;

  if v_tarjeta.status <> 'ACTIVE' or not public.bt_tarjeta_vigente(v_tarjeta) then
    raise exception 'bt:bloqueada:Esa tarjeta no está activa. No se puede recargar.';
  end if;

  if v_pasajes < 1 then
    raise exception 'bt:pin-invalido:Elige cuántos pasajes quieres recargar.';
  end if;

  -- La tarifa del plástico manda: una tarjeta de estudiante compra
  -- pasajes a su propia tarifa, con las mismas comisiones y margen.
  v_base := coalesce(nullif(v_tarjeta.tarifa, 0), (public.bt_tarifario() ->> 'base')::numeric);
  v_cotizacion := public.bt_cotizar_recarga(v_pasajes, v_base);
  v_total      := (v_cotizacion ->> 'total')::numeric;
  v_acreditado := (v_cotizacion ->> 'acreditado')::numeric;

  if v_total > v_tope then
    raise exception 'bt:pin-invalido:El tope por recarga es % Bs. Compra menos pasajes o divide el pago.',
      trim(to_char(round(v_tope), 'FM999999999'));
  end if;

  if v_tel !~ '^0\d{10}$' then
    raise exception 'bt:pin-invalido:El teléfono debe tener 11 dígitos y empezar por 0 (ej. 0414-1234567).';
  end if;

  if length(v_banco) < 2 then
    raise exception 'bt:pin-invalido:Selecciona el banco emisor.';
  end if;

  if length(v_ref_dig) < 4 then
    raise exception 'bt:pin-invalido:Escribe los últimos 4 dígitos de la referencia.';
  end if;

  v_ref := right(v_ref_dig, 4);

  select count(*) into v_reportes
    from public.recharges
   where card_id = v_tarjeta.id
     and created_at > now() - interval '10 minutes';

  if v_reportes >= 6 then
    raise exception 'bt:duplicada:Demasiados reportes seguidos. Espera unos minutos antes de enviar otro.';
  end if;

  if exists (
    select 1
      from public.recharges
     where card_id = v_tarjeta.id
       and bank = v_banco
       and bank_reference = v_ref
       and status <> 'rechazado'
  ) then
    raise exception 'bt:duplicada:Ya reportaste esa referencia. Revisa Movimientos.';
  end if;

  insert into public.card_movements
    (card_id, tipo, monto, saldo_despues, detalle, estado, banco, referencia)
  values
    (v_tarjeta.id, 'recarga', v_acreditado, v_tarjeta.virtual_balance,
     format('Recarga de %s %s en revisión', v_pasajes,
            case when v_pasajes = 1 then 'pasaje' else 'pasajes' end),
     'pendiente', v_banco, v_ref)
  returning * into v_movimiento;

  insert into public.recharges
    (card_id, movement_id, amount, sender_phone, bank, bank_reference, created_at,
     pasajes, tarifa_base, monto_base, comision_entrada, provision_salida,
     margen_blink, excedente_redondeo, tarifario)
  values
    (v_tarjeta.id, v_movimiento.id, v_total, v_tel, v_banco, v_ref, v_movimiento.at,
     v_pasajes, v_base, v_acreditado,
     (v_cotizacion ->> 'comisionEntrada')::numeric,
     (v_cotizacion ->> 'provisionSalida')::numeric,
     (v_cotizacion ->> 'margen')::numeric,
     (v_cotizacion ->> 'excedente')::numeric,
     public.bt_tarifario());

  return jsonb_build_object(
    'movimiento', public.bt_movimiento_json(v_movimiento, v_tarjeta.visible_id),
    'cotizacion', v_cotizacion
  );
end;
$$;

-- ------------------------------------------------------------
-- 10. Permisos
-- ------------------------------------------------------------
revoke all on function public.bt_totp_contador(text, text) from public, anon, authenticated;
revoke all on function public.bt_totp_valido(text, text) from public, anon, authenticated;
revoke all on function public.bt_admin_sesion(text) from public, anon, authenticated;
revoke all on function public.bt_admin_sesion_mfa(text) from public, anon, authenticated;
revoke all on function public.bt_admin_sesion_config(text) from public, anon, authenticated;
revoke all on function public.bt_vincular_fallar(public.accounts, text, text) from public, anon, authenticated;

-- Las RPC públicas conservan sus permisos; se reafirman por claridad.
revoke all on function public.bt_entrar(text, text) from public, anon, authenticated;
revoke all on function public.bt_cambiar_pin(text, text, text) from public, anon, authenticated;
revoke all on function public.bt_vincular(text, text) from public, anon, authenticated;
revoke all on function public.bt_recargar_pasajes(text, text, int, text, text, text)
  from public, anon, authenticated;

grant execute on function public.bt_entrar(text, text) to anon, authenticated;
grant execute on function public.bt_cambiar_pin(text, text, text) to anon, authenticated;
grant execute on function public.bt_vincular(text, text) to anon, authenticated;
grant execute on function public.bt_recargar_pasajes(text, text, int, text, text, text)
  to anon, authenticated;
