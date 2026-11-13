-- BLINK PAY · 0034 · la sesión dice cuánto se puede transferir de cada tarjeta
--
-- Pendiente de aplicar en Supabase.
--
-- Hallazgo #158 de la revisión de bugs del 2026-11-12: Transferir promete un
-- saldo que el servidor rechaza.
--
-- El tope que muestra la pantalla es `min(tarjeta.saldo, topeTransferencia)`
-- (src/pages/Transferir.tsx:63) y `tarjeta.saldo` es `virtual_balance` en
-- crudo (bt_tarjeta_json, 0001:184). Pero `bt_transferir_saldo` no cobra
-- contra esa cifra: cobra contra `bt_disponible_transferencia` (0022:169), que
-- además de la columna descuenta
--   · los créditos aprobados que el validador todavía no ha escrito en el
--     plástico (`bt_creditos_pendientes`), y
--   · deja como techo el espejo del chip menos los débitos pendientes
--     (`last_chip_balance - bt_debitos_pendientes`).
-- El pasajero que acaba de reportar una recarga ve «Hasta Bs 5.000 disponibles»
-- y, en el resumen, «queda Bs 0,00»; al confirmar, el RPC responde «Solo
-- puedes transferir Bs 1.200 de esta tarjeta. Las recargas recién aprobadas se
-- habilitan cuando el validador las escribe en el plástico.» La promesa y el
-- rechazo viven en la misma pantalla, separados por un clic, y el PIN ya se
-- gastó en el intento (0021 cuenta los fallos).
--
-- El arreglo es que la sesión traiga la cifra del servidor, no que el cliente
-- la adivine: el dominio del disponible está en 0022 y copiar su fórmula a
-- TypeScript la condenaría a divergir en cuanto alguien la toque allí. Se
-- añade `disponible` a la proyección de la tarjeta vista desde la cuenta
-- (bt_tarjeta_cuenta_json), que es la que arman bt_entrar, bt_sesion,
-- bt_registrar, bt_vincular y bt_reanudar; el payload viaja pelado al cliente
-- (src/lib/nube.ts:190), así que no hace falta ningún mapeo nuevo.
--
-- La función pasa a `security definer` con `search_path` fijo porque
-- `bt_disponible_transferencia` está revocada a anon/authenticated (0022:698):
-- sin eso la propia sesión reventaría con 42501 para el pasajero. No abre
-- datos nuevos —la fila `cards` ya llegaba como argumento— y sigue `stable`,
-- así que el plan de la proyección no cambia. El coste por tarjeta son dos
-- lecturas por `card_adjustments_pendientes_idx` (0022:107), índice que ya
-- usa el propio `bt_transferir_saldo`.

create or replace function public.bt_tarjeta_cuenta_json(t public.cards, a public.accounts)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select public.bt_tarjeta_json(t) || jsonb_build_object(
    'titular', jsonb_build_object(
      'nombre',   a.nombres || ' ' || a.apellidos,
      'cedula',   a.cedula,
      'telefono', a.telefono),
    'disponible', public.bt_disponible_transferencia(t)
  );
$$;

comment on function public.bt_tarjeta_cuenta_json(public.cards, public.accounts) is
  'Tarjeta vista desde la cuenta: la proyección bt_tarjeta_json más el titular '
  'de la cuenta y, desde 0034, `disponible` = los Bs que bt_transferir_saldo '
  'acepta hoy (bt_disponible_transferencia, 0022). Transferir usa esa cifra '
  'como tope; si el campo falta —base sin 0034 aplicada— el cliente vuelve al '
  'saldo y conserva la conducta vieja. Security definer porque '
  'bt_disponible_transferencia está revocada a anon/authenticated.';

-- Se reafirma el cierre de 0005:630: es una proyección interna, no una RPC.
revoke all on function public.bt_tarjeta_cuenta_json(public.cards, public.accounts)
  from public, anon, authenticated;

-- · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · ·
-- Y de paso, el texto del rechazo
-- · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · · ·
--
-- Al verificar esta migración por HTTP contra la simulación apareció el
-- segundo bicho del mismo mensaje: «Solo puedes transferir .00 Bs de esta
-- tarjeta». `to_char(0, 'FM999999999.00')` devuelve '.00' —con `FM` y puros
-- nueves, el cero de la izquierda se suprime—, así que toda la frase quedaba
-- sin número. Sucede justo en el caso que 0034 hace visible: una tarjeta que
-- recibió una transferencia todavía no escrita en su plástico tiene
-- `disponible` 0 y saldo 4.000, que es el rechazo más frecuente a partir de
-- ahora. Lo mismo en el tope diario, que se arma con `v_usado_dia` y vale 0
-- en la primera transferencia del día: «Ya usaste .00 Bs».
--
-- El mask correcto fija un dígito obligatorio en la unidad: 'FM999999990.00'
-- → '0.00', y no cambia ninguna otra cifra ('4000.00' sale igual). Los masks
-- enteros ('FM999999999') no se tocan: a 0 ya le sale '0'.
--
-- Es la función de 0023:358 copiada tal cual, con esos dos masks corregidos;
-- `create or replace` conserva los permisos, así que el `grant` del final es
-- solo reafirmar el de 0023:610.
create or replace function public.bt_transferir_saldo(
  p_token text,
  p_origen text,
  p_destino text,
  p_monto numeric,
  p_pin text,
  p_clave uuid
)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_cuenta     public.accounts := public.bt_sesion_cuenta(p_token);
  v_origen     public.cards := public.bt_tarjeta_de_cuenta(v_cuenta, p_origen);
  v_destino    public.cards;
  v_monto      numeric := round(coalesce(p_monto, 0), 2);
  v_tope       numeric := public.bt_tope_transferencia();
  v_tope_dia   numeric := public.bt_tope_transferencia_diario();
  v_usado_dia  numeric;
  v_disponible numeric;
  v_clave      uuid := p_clave;
  v_previa     public.card_transfers;
  v_fallos     int;
  v_saldo_o    numeric;
  v_saldo_d    numeric;
  v_transfer   public.card_transfers;
  v_mov_o      public.card_movements;
  v_mov_d      public.card_movements;
  v_mascara_o  text;
  v_mascara_d  text;
begin
  if v_clave is null then
    return jsonb_build_object(
      'error', 'datos',
      'mensaje', 'No pudimos identificar esta operación. Vuelve a intentarlo.');
  end if;

  -- Bloquea la cuenta para que el PIN y sus intentos no se mezclen con
  -- otro cambio de PIN o acceso simultáneo.
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

  -- Idempotencia: el mismo comprobante no se aplica dos veces.
  select * into v_previa from public.card_transfers where clave = v_clave;

  if found then
    if v_previa.cuenta_id <> v_cuenta.id then
      return jsonb_build_object(
        'error', 'duplicada',
        'mensaje', 'Esa operación ya fue registrada. Revisa Movimientos.');
    end if;

    return jsonb_build_object(
      'transferencia', public.bt_transferencia_json(v_previa),
      'repetida', true
    );
  end if;

  if v_monto <= 0 then
    return jsonb_build_object(
      'error', 'datos',
      'mensaje', 'Escribe un monto mayor que cero.');
  end if;

  -- El value block de MIFARE guarda enteros: un saldo con decimales no se
  -- puede escribir en el chip y la nube y el plástico dejarían de coincidir.
  if v_monto <> trunc(v_monto) then
    return jsonb_build_object(
      'error', 'datos',
      'mensaje', 'Transfiere solo bolívares enteros, sin céntimos.');
  end if;

  if v_monto > v_tope then
    return jsonb_build_object(
      'error', 'datos',
      'mensaje', format(
        'El tope por transferencia es %s Bs. Divide el monto en varias operaciones.',
        trim(to_char(round(v_tope), 'FM999999999')))
    );
  end if;

  if v_origen.visible_id = upper(trim(coalesce(p_destino, ''))) then
    return jsonb_build_object(
      'error', 'datos',
      'mensaje', 'Elige una tarjeta distinta a la de origen.');
  end if;

  select * into v_destino
    from public.cards
   where visible_id = upper(trim(coalesce(p_destino, '')));

  if not found then
    return jsonb_build_object(
      'error', 'sin-tarjeta',
      'mensaje', 'No encontramos la tarjeta de destino. Revisa el serial.');
  end if;

  -- Bloquea ambas tarjetas siempre en el mismo orden para que dos
  -- transferencias cruzadas no se queden esperando una a la otra.
  perform 1
    from public.cards
   where id in (v_origen.id, v_destino.id)
   order by id
     for update;

  select * into v_origen from public.cards where id = v_origen.id;
  select * into v_destino from public.cards where id = v_destino.id;

  if v_origen.status <> 'ACTIVE' or not public.bt_tarjeta_vigente(v_origen) then
    return jsonb_build_object(
      'error', 'bloqueada',
      'mensaje', 'Tu tarjeta de origen no está activa. No se puede transferir.');
  end if;

  if v_destino.chip_uid is null then
    return jsonb_build_object(
      'error', 'sin-enrolar',
      'mensaje', 'La tarjeta de destino todavía no está enrolada.');
  end if;

  if v_destino.status <> 'ACTIVE' or not public.bt_tarjeta_vigente(v_destino) then
    return jsonb_build_object(
      'error', 'bloqueada',
      'mensaje', 'La tarjeta de destino no está activa. No se puede transferir.');
  end if;

  if v_destino.account_id is null then
    return jsonb_build_object(
      'error', 'sin-tarjeta',
      'mensaje', 'La tarjeta de destino no está vinculada a una cuenta. Pídele al titular que la vincule.');
  end if;

  select coalesce(sum(t.monto), 0)
    into v_usado_dia
    from public.card_transfers t
   where t.cuenta_id = v_cuenta.id
     and t.at > now() - interval '24 hours';

  if v_usado_dia + v_monto > v_tope_dia then
    return jsonb_build_object(
      'error', 'datos',
      'mensaje', format(
        'El tope diario para transferir es %s Bs. Ya usaste %s Bs en las últimas 24 horas.',
        trim(to_char(round(v_tope_dia), 'FM999999999')),
        trim(to_char(round(v_usado_dia, 2), 'FM999999990.00')))
    );
  end if;

  v_disponible := public.bt_disponible_transferencia(v_origen);

  if v_monto > v_disponible then
    return jsonb_build_object(
      'error', 'datos',
      'mensaje', format(
        'Solo puedes transferir %s Bs de esta tarjeta. Las recargas recién aprobadas se habilitan cuando el validador las escribe en el plástico.',
        trim(to_char(round(v_disponible, 2), 'FM999999990.00')))
    );
  end if;

  insert into public.card_transfers
    (clave, cuenta_id, origen_id, destino_id, monto, origen_saldo, destino_saldo)
  values
    (v_clave, v_cuenta.id, v_origen.id, v_destino.id, v_monto,
     v_origen.virtual_balance, v_destino.virtual_balance)
  returning * into v_transfer;

  insert into public.card_adjustments (card_id, transfer_id, monto, motivo)
  values
    (v_origen.id, v_transfer.id, -v_monto, 'transferencia-enviada'),
    (v_destino.id, v_transfer.id, v_monto, 'transferencia-recibida');

  update public.cards
     set virtual_balance = virtual_balance - v_monto
   where id = v_origen.id
  returning virtual_balance into v_saldo_o;

  update public.cards
     set virtual_balance = virtual_balance + v_monto
   where id = v_destino.id
  returning virtual_balance into v_saldo_d;

  v_mascara_o := right(regexp_replace(v_origen.visible_id, '\D', '', 'g'), 4);
  v_mascara_d := right(regexp_replace(v_destino.visible_id, '\D', '', 'g'), 4);

  insert into public.card_movements
    (card_id, tipo, monto, saldo_despues, detalle, estado)
  values
    (v_origen.id, 'transferencia', -v_monto, v_saldo_o,
     format('Transferencia a la tarjeta terminada en %s', v_mascara_d), 'aprobado')
  returning * into v_mov_o;

  insert into public.card_movements
    (card_id, tipo, monto, saldo_despues, detalle, estado)
  values
    (v_destino.id, 'transferencia', v_monto, v_saldo_d,
     format('Transferencia recibida de la tarjeta terminada en %s', v_mascara_o), 'aprobado')
  returning * into v_mov_d;

  update public.card_transfers
     set origen_saldo = v_saldo_o,
         destino_saldo = v_saldo_d
   where id = v_transfer.id
  returning * into v_transfer;

  return jsonb_build_object(
    'transferencia', public.bt_transferencia_json(v_transfer),
    'movimiento', public.bt_movimiento_json(v_mov_o, v_origen.visible_id),
    'repetida', false
  );
end;
$$;

grant execute on function public.bt_transferir_saldo(text, text, text, numeric, text, uuid)
  to anon, authenticated;
