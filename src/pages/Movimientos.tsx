import { useMemo, useState } from "react";
import { Icon } from "../components/Icon";
import { MovimientoFila } from "../components/MovimientoFila";
import { etiquetaDia, formatearBs, formatearEntero } from "../lib/formato";
import type { Movimiento, Tarjeta } from "../lib/tipos";

type Filtro = "todos" | "recarga" | "viaje";

const FILTROS: { id: Filtro; etiqueta: string }[] = [
  { id: "todos", etiqueta: "Todos" },
  { id: "recarga", etiqueta: "Recargas" },
  { id: "viaje", etiqueta: "Viajes" },
];

interface Props {
  tarjeta: Tarjeta;
  movimientos: Movimiento[];
  seleccionadoId?: string | null;
  alSeleccionar?: (movimiento: Movimiento) => void;
}

export function Movimientos({ tarjeta, movimientos, seleccionadoId, alSeleccionar }: Props) {
  const [filtro, setFiltro] = useState<Filtro>("todos");

  const grupos = useMemo(() => {
    const filtrados = movimientos.filter((m) => filtro === "todos" || m.tipo === filtro);
    const mapa = new Map<string, Movimiento[]>();
    for (const movimiento of filtrados) {
      const dia = etiquetaDia(movimiento.at);
      const lista = mapa.get(dia);
      if (lista) lista.push(movimiento);
      else mapa.set(dia, [movimiento]);
    }
    return [...mapa.entries()].map(([dia, items]) => ({ dia, items }));
  }, [movimientos, filtro]);

  const delMes = useMemo(() => {
    const ahora = new Date();
    return movimientos.filter((m) => {
      const fecha = new Date(m.at);
      return (
        m.estado === "aprobado" &&
        fecha.getMonth() === ahora.getMonth() &&
        fecha.getFullYear() === ahora.getFullYear()
      );
    });
  }, [movimientos]);

  const recargado = delMes.filter((m) => m.tipo === "recarga").reduce((t, m) => t + m.monto, 0);
  const viajes = delMes.filter((m) => m.tipo === "viaje").length;

  return (
    <div className="vista">
      <header className="cabecera cabecera--titulo">
        <h1 className="cabecera__titulo cabecera__titulo--grande">Movimientos</h1>
      </header>

      <section className="resumen">
        <div className="resumen__saldo">
          <span className="resumen__etiqueta">Saldo disponible</span>
          <strong className="resumen__valor">{formatearBs(tarjeta.saldo)}</strong>
        </div>
        <div className="resumen__datos">
          <div>
            <span>Este mes</span>
            <strong>{viajes} viajes</strong>
          </div>
          <div>
            <span>Recargado</span>
            <strong>{formatearEntero(recargado)} Bs</strong>
          </div>
        </div>
      </section>

      <div className="filtros" role="group" aria-label="Filtrar movimientos">
        {FILTROS.map((opcion) => (
          <button
            key={opcion.id}
            type="button"
            className={`filtro${filtro === opcion.id ? " filtro--activo" : ""}`}
            aria-pressed={filtro === opcion.id}
            onClick={() => setFiltro(opcion.id)}
          >
            {opcion.etiqueta}
          </button>
        ))}
      </div>

      {grupos.length === 0 ? (
        <div className="vacio-bloque">
          <span className="vacio-bloque__icono">
            <Icon name="movimientos" />
          </span>
          <strong>Sin movimientos</strong>
          <p>
            {filtro === "viaje"
              ? "Aún no has pagado ningún pasaje con esta tarjeta."
              : filtro === "recarga"
                ? "Todavía no has recargado esta tarjeta."
                : "Cuando uses la tarjeta verás aquí cada viaje y cada recarga."}
          </p>
        </div>
      ) : (
        grupos.map((grupo) => (
          <section className="grupo" key={grupo.dia}>
            <h2 className="grupo__dia">{grupo.dia}</h2>
            <ul className="lista-movimientos lista-movimientos--extracto">
              {grupo.items.map((movimiento) => (
                <MovimientoFila
                  key={movimiento.id}
                  movimiento={movimiento}
                  conSaldo
                  conDia={false}
                  seleccionado={movimiento.id === seleccionadoId}
                  alSeleccionar={alSeleccionar ? () => alSeleccionar(movimiento) : undefined}
                />
              ))}
            </ul>
          </section>
        ))
      )}

      <p className="nota-pie">
        <Icon name="escudo" /> Los movimientos aprobados por Admin son los únicos que
        modifican el saldo. Las recargas en revisión no se descuentan ni se suman hasta
        confirmarse.
      </p>
    </div>
  );
}
