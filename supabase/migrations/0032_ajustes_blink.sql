-- BLINK PAY · 0032 · los ajustes públicos dicen Blink, no los datos de prueba
--
-- Pendiente de aplicar en Supabase (BLINK-DOC-09 B-20). En el repo TARJETA esta
-- misma migración se escribió como 0030: la serie canónica es la de aquí.
--
-- Orden del 2026-11-11: «el pagomovil es 34201580 04246603660 Banco nacional de
-- Crédito (BNC), sin titular» y «atención al cliente solo será
-- support@blink.com.ve». El portal ya lo trae así en el código
-- (AJUSTES_POR_DEFECTO en src/lib/tipos.ts), pero en producción ese objeto
-- apenas manda cuando la nube no contesta: src/lib/nube.ts mezcla el resultado
-- de bt_ajustes() SOBRE los valores por defecto, así que gana lo que haya en la
-- base. Y en la base sigue el sembrado de 0001, que es dato de prueba:
--   · pagoMovil.banco    → "Banesco"                  (debe ser BNC)
--   · pagoMovil.rif      → "J-00000000-0"             (debe ser 34201580)
--   · pagoMovil.telefono → "0414-0000000"             (debe ser 0424-6603660)
--   · pagoMovil.titular  → "BLINK PASAJES, C.A."      (ya no existe ese campo)
--   · atencion           → "0800-BLINK-00"            (debe ser el correo)
-- Mientras eso quede así, el paso de pago de Recargar —que arma el bloque
-- «Paga a Blink» con ajustes.pagoMovil— le dice al pasajero que transfiera a un
-- banco que no es, y Perfil muestra un 0800 que además arma un
-- `mailto:0800-BLINK-00` roto. Es el fallo más caro de la lista: afecta al
-- dinero que entra.
--
-- Se arregla la base, no el cliente. El campo existe para que la operación
-- pueda cambiar el banco o el canal de atención sin recompilar el portal; si el
-- cliente ignorara a bt_ajustes() se perdería esa capacidad. El UPDATE deja de
-- un solo golpe los cuatro datos que sí corresponden y, al reemplazar el objeto
-- `pagoMovil` completo, desaparece la clave `titular` que ya no lee nadie. Las
-- demás claves de la fila se conservan: `tarifario` (0019) y `topeRecarga`
-- (clave muerta desde 0030, que 0030 decidió no borrar) siguen donde estaban.
--
-- Se toca también el objeto de respaldo de bt_ajustes(): es el `coalesce` que se
-- devuelve cuando la fila `publico` no existe —una base recién creada, un
-- rollback— y llevaba los mismos datos de prueba. Sin ese arreglo, cualquier
-- entorno nuevo volvería a caer en Banesco.

-- ------------------------------------------------------------
-- 1. La fila publicada
-- ------------------------------------------------------------
update public.settings
   set valor = valor || jsonb_build_object(
         'pagoMovil', jsonb_build_object(
           'banco', 'Banco Nacional de Crédito',
           'rif', '34201580',
           'telefono', '0424-6603660'
         ),
         'atencion', 'support@blink.com.ve'
       ),
       actualizada = now()
 where clave = 'publico';

-- Si la fila no estaba (entorno limpio), se siembra ya correcta. on conflict do
-- nothing evita pisar la que acaba de actualizarse arriba.
insert into public.settings (clave, valor)
values ('publico', jsonb_build_object(
  'pagoMovil', jsonb_build_object(
    'banco', 'Banco Nacional de Crédito',
    'rif', '34201580',
    'telefono', '0424-6603660'
  ),
  'atencion', 'support@blink.com.ve'
))
on conflict (clave) do nothing;

-- ------------------------------------------------------------
-- 2. El respaldo de bt_ajustes()
-- ------------------------------------------------------------
create or replace function public.bt_ajustes()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_valor jsonb;
begin
  select valor into v_valor from public.settings where clave = 'publico';

  return coalesce(v_valor, jsonb_build_object(
    'pagoMovil', jsonb_build_object(
      'banco', 'Banco Nacional de Crédito',
      'rif', '34201580',
      'telefono', '0424-6603660'),
    'topeRecarga', 20000,
    'atencion', 'support@blink.com.ve'
  ));
end;
$$;

comment on function public.bt_ajustes() is
  'Ajustes que el portal del pasajero puede leer sin sesión (RLS anon). El '
  'objeto devuelto se mezcla sobre AJUSTES_POR_DEFECTO en el cliente, así que '
  'lo que haya aquí manda sobre el código: 0032 sacó de la fila los datos de '
  'prueba de 0001 (Banesco / J-00000000-0 / 0414-0000000 / BLINK PASAJES, C.A. '
  '/ 0800-BLINK-00). `topeRecarga` se conserva aunque 0030 dejó de leerla.';

grant execute on function public.bt_ajustes() to anon, authenticated;
