-- ------------------------------------------------------------
-- 0026 — Rendimiento del extracto
--
-- 1. Índice de cobertura para la consulta más caliente del portal
--    (`where card_id = ? order by at desc offset ? limit ?`). Sustituye
--    al índice simple: misma clave, sin volver al heap para pintar la fila.
-- 2. `bt_movimientos` paginado con desplazamiento. La versión de tres
--    argumentos se conserva para clientes anteriores; la de cuatro no
--    lleva valores por defecto para que PostgREST no tenga ambigüedad.
-- 3. Columnas explícitas en vez de `select *`.
-- ------------------------------------------------------------

create index if not exists card_movements_pagina_idx
  on public.card_movements (card_id, at desc)
  include (id, tipo, monto, saldo_despues, detalle, estado, unidad, banco, referencia);

drop index if exists public.card_movements_card_idx;

create or replace function public.bt_movimientos(
  p_token text, p_serial text, p_limite int, p_desplazamiento int
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_cuenta  public.accounts := public.bt_sesion_cuenta(p_token);
  v_tarjeta public.cards := public.bt_tarjeta_de_cuenta(v_cuenta, p_serial);
  v_limite  int := least(greatest(coalesce(p_limite, 30), 1), 100);
  v_desde   int := greatest(coalesce(p_desplazamiento, 0), 0);
  v_lista   jsonb;
  v_hay_mas boolean;
begin
  -- Se pide una fila de más: si llega, hay otra página.
  select coalesce(jsonb_agg(
           jsonb_strip_nulls(jsonb_build_object(
             'id',           m.id,
             'serial',       v_tarjeta.visible_id,
             'tipo',         m.tipo,
             'monto',        m.monto,
             'saldoDespues', m.saldo_despues,
             'at',           m.at,
             'detalle',      m.detalle,
             'estado',       m.estado,
             'unidad',       m.unidad,
             'banco',        m.banco,
             'referencia',   m.referencia
           )) order by m.at desc
         ), '[]'::jsonb)
    into v_lista
    from (
      select id, tipo, monto, saldo_despues, detalle, estado,
             unidad, banco, referencia, at
        from public.card_movements
       where card_id = v_tarjeta.id
       order by at desc
       limit v_limite + 1
      offset v_desde
    ) m;

  v_hay_mas := jsonb_array_length(v_lista) > v_limite;

  if v_hay_mas then
    select jsonb_agg(elemento order by posicion)
      into v_lista
      from jsonb_array_elements(v_lista) with ordinality as fila(elemento, posicion)
     where posicion <= v_limite;
  end if;

  return jsonb_build_object('movimientos', v_lista, 'hayMas', v_hay_mas);
end;
$$;

revoke all on function public.bt_movimientos(text, text, int, int) from public;
grant execute on function public.bt_movimientos(text, text, int, int) to anon, authenticated;
