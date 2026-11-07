interface Props {
  filas?: number;
  /** Texto para lectores de pantalla mientras llega el extracto. */
  etiqueta?: string;
}

/**
 * Ocupa el alto exacto de las filas reales (`.movimiento`, 56 px) para que
 * la lista no salte al llegar los datos.
 */
export function EsqueletoMovimientos({
  filas = 4,
  etiqueta = "Cargando movimientos…",
}: Props) {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <ul className="lista-movimientos lista-movimientos--esqueleto" aria-hidden="true">
        {Array.from({ length: filas }, (_, posicion) => (
          <li className="movimiento-item" key={posicion}>
            <div className="movimiento">
              <span className="esqueleto esqueleto--icono" />
              <div className="movimiento__texto">
                <span className="esqueleto esqueleto--titulo" />
                <span className="esqueleto esqueleto--detalle" />
              </div>
              <div className="movimiento__cifras">
                <span className="esqueleto esqueleto--monto" />
              </div>
            </div>
          </li>
        ))}
      </ul>
      <span className="visualmente-oculto">{etiqueta}</span>
    </div>
  );
}
