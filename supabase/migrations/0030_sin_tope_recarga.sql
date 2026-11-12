-- BLINK PAY · 0030 · la recarga deja de tener tope
--
-- En el repo TARJETA se escribió como 0028; aquí es 0030 por el orden real de
-- esta historia (0029_mfa_bypase_temporal). Pendiente de aplicar en Supabase.
--
-- Orden del 2026-11-11: «en bloques de 2, 4, 6, 8 y 10 pasajes, y sin tope, ya
-- no habría tope de recarga». El portal ya lo refleja (Recargar.tsx dice «Sin
-- tope: puedes recargar los pasajes que quieras, de uno en uno»), pero la nube
-- seguía frenando: bt_recargar_pasajes() comparaba el total contra
-- bt_tope_recarga() y rechazaba cualquier compra por encima de 20.000 Bs
-- (settings.publico.topeRecarga, subido de 5.000 a 20.000 en 0019). Un pasajero
-- que escribiera 50 pasajes recibía «El tope por recarga es 20.000 Bs», es
-- decir, la promesa comercial nueva se caía apenas uno se pasaba del bloque 10.
--
-- El tope nació como control de fraude, y sigue siéndolo una parte: esta
-- migración NO toca los otros tres frenos de la misma función —
--   · 6 reportes por tarjeta en 10 minutos (avalancha de referencias),
--   · referencia bancaria duplicada (la misma transferencia no cuenta dos veces),
--   · teléfono, banco y referencia validados antes de aceptar nada.
-- Lo que se quita es únicamente el techo por importe, que ya no tiene sentido
-- cuando el pasajero puede comprar la cantidad de viaje que quiera.
--
-- bt_tope_recarga() se conserva devolviendo NULL en vez de borrarse: las
-- definiciones históricas de la función siguen en el repo (0001, 0005, 0014,
-- 0019, 0021) y borrar el símbolo dejaría esas migraciones irrecuperables en un
-- rollback. Con NULL, cualquier llamada vieja que quedara viva simplemente no
-- frena nada (`total > NULL` es NULL, y un IF NULL no entra). La clave
-- `topeRecarga` se queda en `settings.publico` sin borrarla —ya no la lee
-- nadie— para no tocar datos de producción por una limpieza que no hace falta.

-- ------------------------------------------------------------
-- 1. Recarga sin techo de importe
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
-- 2. El tope queda retirado, no borrado
-- ------------------------------------------------------------
create or replace function public.bt_tope_recarga()
returns numeric language sql stable as $$
  -- Retirado en 0028: la recarga ya no tiene techo de importe. Se conserva la
  -- firma porque las migraciones históricas la llaman; devolver NULL hace que
  -- cualquier comparativa antigua sea inofensiva.
  select null::numeric;
$$;

revoke all on function public.bt_tope_recarga() from public, anon, authenticated;
grant execute on function public.bt_recargar_pasajes(text, text, int, text, text, text)
  to anon, authenticated;
