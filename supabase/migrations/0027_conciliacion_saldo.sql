-- BLINK PAY · 0027 · conciliación del saldo virtual contra su libro mayor
--
-- En el repo TARJETA se escribió como 0026; aquí toma el 0027 porque la
-- historia real de esta base va por 0026_rendimiento. Aplicada en Supabase el
-- 2026-11-11, después de esa.
--
-- Hallazgo del 2026-11-11. La tarjeta A-00000-000-H tenía virtual_balance = 0
-- mientras sus movimientos aprobados sumaban 10 500 Bs. El validador consulta
-- la columna (0023) y rechazaba el toque, pero la pantalla de rechazo imprime
-- el saldo del chip: el pasajero veía un "no" y 4 000 Bs al mismo tiempo.
--
-- Nada en el esquema mantiene la columna casada con los movimientos, así que el
-- desfase es silencioso: solo lo descubre el pasajero en el bus. Esta migración
-- aporta el diagnóstico y la reparación, sin inventar dinero: el destino siempre
-- es la suma de los movimientos 'aprobado', y si la columna ya cuadra no escribe.

-- ------------------------------------------------------------
-- 1. La bitácora admite el evento de conciliación
-- ------------------------------------------------------------
-- Las mermas del panel cuentan RFPGC, CHIP_ERR y SCRAP por nombre, así que un
-- evento nuevo no altera ninguna métrica.
alter table public.card_events drop constraint if exists card_events_evento_check;
alter table public.card_events
  add constraint card_events_evento_check
  check (evento = any (array[
    'ENROLADA', 'ASIGNADA', 'PERDIDA', 'RFPGC', 'CHIP_ERR', 'SCRAP', 'CONCILIADA'
  ]));

-- ------------------------------------------------------------
-- 2. Diagnóstico de solo lectura: qué tarjetas están descuadradas
-- ------------------------------------------------------------
create or replace function public.bt_conciliacion_saldos()
returns table (
  serial        text,
  estado        text,
  saldo_columna numeric,
  libro         numeric,
  por_entregar  numeric,
  espejo_chip   numeric,
  desvio        numeric
)
language sql stable security definer set search_path = public as $$
  select c.visible_id,
         c.status,
         c.virtual_balance,
         coalesce(l.total, 0),
         public.bt_creditos_pendientes(c.id),
         c.last_chip_balance,
         c.virtual_balance - coalesce(l.total, 0)
    from public.cards c
    left join lateral (
      select sum(m.monto) as total
        from public.card_movements m
       where m.card_id = c.id
         and m.estado = 'aprobado'
    ) l on true
   where c.virtual_balance is distinct from coalesce(l.total, 0)
   order by c.visible_id;
$$;

comment on function public.bt_conciliacion_saldos() is
  'Tarjetas cuyo virtual_balance no coincide con la suma de sus movimientos aprobados. Vacío = el libro cuadra.';

-- ------------------------------------------------------------
-- 3. Reparación: la columna vuelve a su propio libro
-- ------------------------------------------------------------
create or replace function public.bt_conciliar_tarjeta(
  p_serial    text,
  p_operador  text default 'sistema',
  p_motivo    text default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_tarjeta public.cards;
  v_libro   numeric;
  v_por_entregar numeric;
begin
  select * into v_tarjeta from public.cards where visible_id = p_serial for update;

  if not found then
    raise exception 'Tarjeta no encontrada: %.', p_serial;
  end if;

  select coalesce(sum(monto), 0) into v_libro
    from public.card_movements
   where card_id = v_tarjeta.id
     and estado = 'aprobado';

  if v_tarjeta.virtual_balance = v_libro then
    return jsonb_build_object(
      'ok', true, 'cambio', false, 'serial', p_serial,
      'saldo', v_libro, 'mensaje', 'La columna ya cuadra con el libro.');
  end if;

  update public.cards
     set virtual_balance = v_libro, updated_at = now()
   where id = v_tarjeta.id;

  v_por_entregar := public.bt_creditos_pendientes(v_tarjeta.id);

  insert into public.card_events (card_id, evento, canal, operador, detalle)
  values (
    v_tarjeta.id, 'CONCILIADA', 'sistema', p_operador,
    jsonb_build_object(
      'antes',       v_tarjeta.virtual_balance,
      'despues',     v_libro,
      'diferencia',  v_libro - v_tarjeta.virtual_balance,
      'porEntregar', v_por_entregar,
      'espejoChip',  v_tarjeta.last_chip_balance,
      'motivo',      coalesce(nullif(trim(p_motivo), ''), 'sin indicar')
    )
  );

  return jsonb_build_object(
    'ok', true, 'cambio', true, 'serial', p_serial,
    'antes', v_tarjeta.virtual_balance, 'despues', v_libro,
    'diferencia', v_libro - v_tarjeta.virtual_balance,
    'por_entregar', v_por_entregar,
    'invariante', jsonb_build_object(
      'saldo_menos_por_entregar', v_libro - v_por_entregar,
      'espejo_chip', v_tarjeta.last_chip_balance)
  );
end;
$$;

comment on function public.bt_conciliar_tarjeta(text, text, text) is
  'Ajusta virtual_balance a la suma de los movimientos aprobados y deja CONCILIADA en la bitácora. Idempotente.';

-- ------------------------------------------------------------
-- 4. Solo operación las puede llamar
-- ------------------------------------------------------------
revoke all on function public.bt_conciliacion_saldos() from public, anon, authenticated;
revoke all on function public.bt_conciliar_tarjeta(text, text, text) from public, anon, authenticated;
