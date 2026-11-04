import { Icon, type IconName } from "./Icon";
import { formatearBs, formatearHora, formatearMovimiento } from "../lib/formato";
import type { Movimiento } from "../lib/tipos";

const ICONOS: Record<Movimiento["tipo"], IconName> = {
  recarga: "rayo",
  viaje: "autobus",
  devolucion: "actualizar",
  ajuste: "escudo",
  transferencia: "transferir",
};

interface Props {
  movimiento: Movimiento;
  /** Muestra el saldo resultante a la derecha, como un extracto. */
  conSaldo?: boolean;
  /** Omite el día porque la fila ya vive bajo un encabezado de fecha. */
  conDia?: boolean;
  /** En escritorio, abre el detalle en el inspector. */
  alSeleccionar?: () => void;
  seleccionado?: boolean;
}

export function MovimientoFila({
  movimiento,
  conSaldo = false,
  conDia = true,
  alSeleccionar,
  seleccionado = false,
}: Props) {
  const entrada = movimiento.monto > 0;
  const pendiente = movimiento.estado === "pendiente";
  const rechazado = movimiento.estado === "rechazado";
  const referencia = movimiento.referencia ? ` · Ref. ${movimiento.referencia}` : "";
  const unidad = movimiento.unidad ? ` · ${movimiento.unidad}` : "";

  const contenido = (
    <>
      <span
        className={`movimiento__icono${
          entrada ? " movimiento__icono--entra" : " movimiento__icono--sale"
        }`}
        aria-hidden="true"
      >
        <Icon name={ICONOS[movimiento.tipo] ?? "punto"} />
      </span>

      <div className="movimiento__texto">
        <strong>{movimiento.detalle}</strong>
        <span>
          {conDia ? formatearMovimiento(movimiento.at) : formatearHora(movimiento.at)}
          {movimiento.tipo === "recarga" && movimiento.banco
            ? ` · ${movimiento.banco}${referencia}`
            : unidad}
        </span>
      </div>

      <div className="movimiento__cifras">
        <strong className={entrada ? "movimiento__monto--entra" : "movimiento__monto--sale"}>
          {entrada ? "+" : "−"}
          {formatearBs(Math.abs(movimiento.monto)).replace("Bs ", "")}
        </strong>
        {conSaldo && movimiento.estado === "aprobado" && (
          <span className="movimiento__saldo">{formatearBs(movimiento.saldoDespues)}</span>
        )}
        {pendiente && <span className="etiqueta etiqueta--espera">En revisión</span>}
        {rechazado && <span className="etiqueta etiqueta--mal">Rechazada</span>}
      </div>
    </>
  );

  return (
    <li className={`movimiento-item${seleccionado ? " movimiento-item--activo" : ""}`}>
      {alSeleccionar ? (
        <button
          type="button"
          className={`movimiento movimiento--accion${
            pendiente ? " movimiento--pendiente" : ""
          }`}
          aria-pressed={seleccionado}
          onClick={alSeleccionar}
        >
          {contenido}
        </button>
      ) : (
        <div className={`movimiento${pendiente ? " movimiento--pendiente" : ""}`}>
          {contenido}
        </div>
      )}
    </li>
  );
}
