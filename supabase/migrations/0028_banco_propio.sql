-- BLINK PAY · 0028 · el banco emisor debe guardarse también con "Mis datos"
--
-- En el repo TARJETA se escribió como 0027; aquí es 0028 por el orden real de
-- esta historia (0026_rendimiento). Aplicada en Supabase el 2026-11-11.
--
-- Reporte del 2026-11-11: en la app Pay «el banco no se guarda». Había dos
-- causas distintas y esta migración arregla la segunda.
--
-- 1) La primera ya estaba resuelta aquí: el API gateway de Supabase dejó de
--    exponer `public` y toda RPC sin `Content-Profile` respondía 404
--    (PGRST202) con el aviso «BLINK no está disponible en este momento». Este
--    repo lo corrigió el 2026-11-07 (e7ff498) y el back-office el 2026-11-11;
--    el validador ya la enviaba (firmware/validador/red.cpp).
--
-- 2) Esta: bt_actualizar_pago() forzaba `v_banco := ''` siempre que
--    p_propio = true, es decir, cuando el pasajero paga desde su propio Pago
--    Móvil. El selector «Banco emisor» de Mi cuenta queda visible en los dos
--    casos, así que la persona elegía su banco, pulsaba Guardar y la función
--    tiraba el valor sin avisar.
--
--    Vaciar el banco también rompe la pantalla de recarga: Recargar.tsx toma
--    el banco guardado para titular el Pago Móvil y, al venir vacío, muestra
--    «Elige tu banco emisor» en cada recarga aunque ya esté elegido. Un Pago
--    Móvil propio tiene banco igual que uno ajeno; lo que la bandera `propio`
--    evita es repetir teléfono y cédula, no borrar la entidad.
--
--    bt_registrar() se queda como está: el registro con «Mis datos» nunca
--    pregunta el banco, así que no hay nada que conservar.

create or replace function public.bt_actualizar_pago(
  p_token    text,
  p_propio   boolean,
  p_banco    text   default '',
  p_telefono text   default '',
  p_cedula   text   default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cuenta   public.accounts := public.bt_sesion_cuenta(p_token);
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

comment on function public.bt_actualizar_pago(text, boolean, text, text, text) is
  'Guarda la fuente de Pago Móvil de la cuenta. Con p_propio = true toma teléfono y cédula de la cuenta y conserva el banco elegido.';
