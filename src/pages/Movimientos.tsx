import { useMemo, useState } from "react";
import { EsqueletoMovimientos } from "../components/EsqueletoMovimientos";
import { Icon } from "../components/Icon";
import { MovimientoFila } from "../components/MovimientoFila";
import { etiquetaDia, formatearBs } from "../lib/formato";
import type { Movimiento, Tarjeta } from "../lib/tipos";

type Filtro = "todos" | "recarga" | "viaje" | "transferencia";

const FILTROS: { id: Filtro; etiqueta: string }[] = [
  { id: "todos", etiqueta: "Todos" },
  { id: "recarga", etiqueta: "Recargas" },
  { id: "viaje", etiqueta: "Viajes" },
  { id: "transferencia", etiqueta: "Transferencias" },
];

interface Props {
  tarjeta: Tarjeta;
  movimientos: Movimiento[];
  seleccionadoId?: string | null;
  alSeleccionar?: (movimiento: Movimiento) => void;
  /** Aviso cuando la lista no pudo cargarse (null ≠ "sin movimientos"). */
  error?: string;
  alReintentar?: () => void;
  /** El extracto todavía no llegó: muestra esqueletos, no el vacío. */
  cargando?: boolean;
  /** El servidor tiene páginas más antiguas sin traer. */
  hayMas?: boolean;
  cargandoMas?: boolean;
  alCargarMas?: () => void;
}

export function Movimientos({
  tarjeta,
  movimientos,
  seleccionadoId,
  alSeleccionar,
  error,
  alReintentar,
  cargando = false,
  hayMas = false,
  cargandoMas = false,
  alCargarMas,
}: Props) {
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

      {error ? (
        <div className="aviso aviso--peligro" role="alert">
          <Icon name="alerta" />
          <p>
            {error}{" "}
            {alReintentar ? (
              <button type="button" className="enlace-sutil" onClick={alReintentar}>
                Reintentar
              </button>
            ) : null}
          </p>
        </div>
      ) : null}

      {cargando ? (
        <div className="grupo">
          <span className="esqueleto esqueleto--dia" aria-hidden="true" />
          <EsqueletoMovimientos filas={6} etiqueta="Cargando el extracto…" />
        </div>
      ) : grupos.length === 0 ? (
        <div className="vacio-bloque">
          <span className="vacio-bloque__icono">
            <Icon name="movimientos" />
          </span>
          <strong>{error ? "Lista sin confirmar" : "Sin movimientos"}</strong>
          <p>
            {error
              ? "No pudimos leer el extracto. El saldo que ves puede estar viejo; reintenta cuando tengas señal."
              : filtro === "viaje"
                ? "Aún no has pagado ningún pasaje con esta tarjeta."
                : filtro === "recarga"
                  ? "Todavía no has recargado esta tarjeta."
                  : filtro === "transferencia"
                    ? "Todavía no has transferido saldo con esta tarjeta."
                    : "Cuando uses la tarjeta verás aquí cada viaje, recarga y transferencia."}
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
                  alSeleccionar={alSeleccionar}
                />
              ))}
            </ul>
          </section>
        ))
      )}

      {hayMas && alCargarMas && (
        <div className="mas-movimientos">
          <button
            type="button"
            className="boton boton--secundario"
            onClick={alCargarMas}
            disabled={cargandoMas}
            aria-busy={cargandoMas}
            aria-label={cargandoMas ? "Cargando más movimientos" : undefined}
          >
            {cargandoMas ? (
              <>
                <span className="girador" aria-hidden="true" />
                Cargando…
              </>
            ) : (
              "Ver movimientos anteriores"
            )}
          </button>
        </div>
      )}

      <p className="nota-pie">
        <Icon name="escudo" /> Solo los movimientos aprobados modifican el saldo. Las
        recargas en revisión no se descuentan ni se suman hasta confirmarse.
      </p>
    </div>
  );
}
