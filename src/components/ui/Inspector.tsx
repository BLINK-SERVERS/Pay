import { BlinkSymbol, type NombreSimbolo } from "./BlinkSymbol";
import { formatearBs, formatearMovimiento } from "../../lib/formato";
import { pasajesEquivalentes } from "../../lib/dominio";
import type { Cuenta, Movimiento, Tarjeta } from "../../lib/tipos";

const ICONOS: Record<Movimiento["tipo"], NombreSimbolo> = {
  recarga: "rayo",
  viaje: "autobus",
  devolucion: "actualizar",
  ajuste: "escudo",
  transferencia: "transferir",
};

interface Props {
  cuenta: Cuenta;
  tarjeta: Tarjeta | null;
  movimientos: Movimiento[];
  seleccionado: Movimiento | null;
  alLimpiar: () => void;
  alRecargar: () => void;
  alVerMovimientos: () => void;
}

/** Panel inspector de 300 px: contexto de la tarjeta y detalle del movimiento. */
export function Inspector({
  cuenta,
  tarjeta,
  movimientos,
  seleccionado,
  alLimpiar,
  alRecargar,
  alVerMovimientos,
}: Props) {
  const delMes = movimientos.filter((m) => {
    const fecha = new Date(m.at);
    const ahora = new Date();
    return (
      m.estado === "aprobado" &&
      fecha.getMonth() === ahora.getMonth() &&
      fecha.getFullYear() === ahora.getFullYear()
    );
  });
  const viajes = delMes.filter((m) => m.tipo === "viaje").length;
  const recargado = delMes
    .filter((m) => m.tipo === "recarga")
    .reduce((total, m) => total + m.monto, 0);
  const pasajes = tarjeta ? pasajesEquivalentes(tarjeta.saldo, tarjeta.tarifa) : 0;

  return (
    <aside className="inspector" aria-label="Inspector">
      <header className="inspector__cabecera">
        <h2>{seleccionado ? "Detalle del movimiento" : "Resumen"}</h2>
        {seleccionado && (
          <button
            type="button"
            className="inspector__cerrar"
            onClick={alLimpiar}
            aria-label="Cerrar el detalle"
          >
            <BlinkSymbol nombre="cerrar" tamano="xs" />
          </button>
        )}
      </header>

      {seleccionado ? (
        <section className="inspector__detalle">
          <span
            className={`inspector__icono${
              seleccionado.monto > 0 ? " inspector__icono--entra" : " inspector__icono--sale"
            }`}
          >
            <BlinkSymbol nombre={ICONOS[seleccionado.tipo] ?? "punto"} tamano="lg" />
          </span>
          <strong className="inspector__monto">
            {seleccionado.monto > 0 ? "+" : "−"}
            {formatearBs(Math.abs(seleccionado.monto))}
          </strong>
          <p className="inspector__concepto">{seleccionado.detalle}</p>
          <span
            className={`etiqueta ${
              seleccionado.estado === "aprobado"
                ? "etiqueta--bien"
                : seleccionado.estado === "pendiente"
                  ? "etiqueta--espera"
                  : "etiqueta--mal"
            }`}
          >
            {seleccionado.estado === "aprobado"
              ? "Aprobado"
              : seleccionado.estado === "pendiente"
                ? "En revisión"
                : "Rechazado"}
          </span>

          <dl className="inspector__filas">
            <div>
              <dt>Fecha</dt>
              <dd>{formatearMovimiento(seleccionado.at)}</dd>
            </div>
            {seleccionado.referencia && (
              <div>
                <dt>Referencia</dt>
                <dd className="mono">{seleccionado.referencia}</dd>
              </div>
            )}
            {seleccionado.banco && (
              <div>
                <dt>Banco</dt>
                <dd>{seleccionado.banco}</dd>
              </div>
            )}
            {seleccionado.unidad && (
              <div>
                <dt>Unidad</dt>
                <dd>{seleccionado.unidad}</dd>
              </div>
            )}
            {seleccionado.estado === "aprobado" && (
              <div>
                <dt>Saldo después</dt>
                <dd className="mono">{formatearBs(seleccionado.saldoDespues)}</dd>
              </div>
            )}
          </dl>

          <button type="button" className="boton boton--secundario boton--compacto" onClick={alVerMovimientos}>
            Ver todos los movimientos
          </button>
        </section>
      ) : (
        <>
          <section className="inspector__tarjeta">
            <span className="inspector__etiqueta">Tarjeta activa</span>
            <strong className="inspector__serial mono">
              {tarjeta?.serial ?? "Sin tarjeta vinculada"}
            </strong>
            {tarjeta && (
              <>
                <span className="inspector__saldo">{formatearBs(tarjeta.saldo)}</span>
                <span className="inspector__pasajes">
                  <BlinkSymbol nombre="autobus" tamano="xs" />
                  {pasajes} {pasajes === 1 ? "pasaje" : "pasajes"} a {formatearBs(tarjeta.tarifa)}
                </span>
              </>
            )}
          </section>

          <section className="inspector__bento" aria-label="Este mes">
            <div>
              <span>Viajes</span>
              <strong>{viajes}</strong>
            </div>
            <div>
              <span>Recargado</span>
              <strong>{formatearBs(recargado)}</strong>
            </div>
          </section>

          <section className="inspector__pago">
            <h3>Pago Móvil</h3>
            <dl className="inspector__filas">
              <div>
                <dt>Banco</dt>
                <dd>{cuenta.datosPago.banco || "Por definir"}</dd>
              </div>
              <div>
                <dt>Teléfono</dt>
                <dd className="mono">{cuenta.datosPago.telefono || "Por definir"}</dd>
              </div>
            </dl>
          </section>

          <button type="button" className="boton boton--primario" onClick={alRecargar}>
            <BlinkSymbol nombre="mas" tamano="sm" />
            Recargar saldo
          </button>
        </>
      )}
    </aside>
  );
}
