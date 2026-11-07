import { useEffect, useMemo, useRef, useState } from "react";
import { EsqueletoMovimientos } from "../components/EsqueletoMovimientos";
import { Icon } from "../components/Icon";
import { MovimientoFila } from "../components/MovimientoFila";
import { TarjetaVirtual } from "../components/TarjetaVirtual";
import { formatearBs } from "../lib/formato";
import type { Cuenta, Movimiento, Tarjeta } from "../lib/tipos";

interface Props {
  cuenta: Cuenta;
  tarjetas: Tarjeta[];
  tarjeta: Tarjeta | null;
  movimientos: Movimiento[];
  alSeleccionar: (serial: string) => void;
  alVincular: () => void;
  alVerMovimientos: () => void;
  seleccionadoId?: string | null;
  alSeleccionarMovimiento?: (movimiento: Movimiento) => void;
  /** El extracto todavía no llegó: muestra esqueletos, no el vacío. */
  cargandoMovimientos?: boolean;
}

function saludo(): string {
  const hora = new Date().getHours();
  if (hora < 12) return "Buenos días";
  if (hora < 19) return "Buenas tardes";
  return "Buenas noches";
}

export function Inicio({
  cuenta,
  tarjetas,
  tarjeta,
  movimientos,
  alSeleccionar,
  alVincular,
  alVerMovimientos,
  seleccionadoId,
  alSeleccionarMovimiento,
  cargandoMovimientos = false,
}: Props) {
  const nombre = cuenta.nombres.split(" ")[0] ?? "";
  const recientes = movimientos.slice(0, 4);
  const pendiente = movimientos.find((m) => m.estado === "pendiente");

  const carrusel = useRef<HTMLDivElement>(null);
  const [indice, setIndice] = useState(0);

  const indiceActivo = useMemo(
    () => tarjetas.findIndex((t) => t.serial === tarjeta?.serial),
    [tarjetas, tarjeta?.serial]
  );

  useEffect(() => {
    if (indiceActivo < 0 || indiceActivo === indice) return;
    setIndice(indiceActivo);
    const el = carrusel.current;
    if (el && el.clientWidth > 0) {
      el.scrollTo({ left: indiceActivo * el.clientWidth, behavior: "smooth" });
    }
    // indice queda fuera a propósito: solo se reacciona al cambio de tarjeta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indiceActivo]);

  function alDesplazar() {
    const el = carrusel.current;
    if (!el || el.clientWidth === 0) return;
    const calculado = Math.min(
      tarjetas.length - 1,
      Math.max(0, Math.round(el.scrollLeft / el.clientWidth))
    );
    if (calculado !== indice) {
      setIndice(calculado);
      const siguiente = tarjetas[calculado];
      if (siguiente) alSeleccionar(siguiente.serial);
    }
  }

  function irATarjeta(posicion: number) {
    const el = carrusel.current;
    if (!el) return;
    setIndice(posicion);
    el.scrollTo({ left: posicion * el.clientWidth, behavior: "smooth" });
    const elegida = tarjetas[posicion];
    if (elegida) alSeleccionar(elegida.serial);
  }

  return (
    <div className="vista vista--inicio">
      <header className="cabecera">
        <h1 className="cabecera__titulo">
          {saludo()}, {nombre}
        </h1>
      </header>

      {pendiente && (
        <button type="button" className="banda" onClick={alVerMovimientos}>
          <span className="banda__icono">
            <Icon name="reloj" />
          </span>
          <span className="banda__texto">
            <strong>Recarga en revisión</strong>
            <span>
              {formatearBs(pendiente.monto)} · {pendiente.banco ?? "Pago Móvil"} · Ref.{" "}
              {pendiente.referencia}
            </span>
          </span>
          <Icon name="adelante" className="banda__flecha" />
        </button>
      )}

      {tarjetas.length === 0 ? (
        <section className="billetera-vacia billetera-vacia--inicio">
          <span className="billetera-vacia__icono">
            <Icon name="tarjeta" />
          </span>
          <h2>Tu billetera está vacía</h2>
          <p>
            Registra el serial impreso al reverso de tu plástico y empieza a recargar desde el
            teléfono. Puedes vincular varias tarjetas en la misma cuenta.
          </p>
          <button type="button" className="boton boton--primario" onClick={alVincular}>
            <Icon name="mas" />
            Vincular mi primera tarjeta
          </button>
        </section>
      ) : (
        <section className="billetera" aria-roledescription="carrusel" aria-label="Tus tarjetas">
          <div
            className="billetera__carrusel"
            ref={carrusel}
            onScroll={alDesplazar}
            onKeyDown={(evento) => {
              if (evento.target !== evento.currentTarget) return;
              const destino = evento.key === "ArrowRight" ? Math.min(indice + 1, tarjetas.length - 1)
                : evento.key === "ArrowLeft" ? Math.max(indice - 1, 0)
                : evento.key === "Home" ? 0 : evento.key === "End" ? tarjetas.length - 1 : null;
              if (destino !== null) { evento.preventDefault(); irATarjeta(destino); }
            }}
            tabIndex={0}
            role="group"
            aria-label={`Tarjeta ${indice + 1} de ${tarjetas.length}`}
          >
            {tarjetas.map((item, posicion) => (
              <div className="billetera__slide" key={item.serial} inert={posicion !== indice} aria-hidden={posicion !== indice}>
                <TarjetaVirtual tarjeta={item} />
              </div>
            ))}
          </div>

          <div className="billetera__controles">
            {tarjetas.length > 1 && (
              <div className="billetera__puntos" role="group" aria-label="Elegir tarjeta">
                {tarjetas.map((item, posicion) => (
                  <button
                    key={item.serial}
                    type="button"
                    aria-pressed={posicion === indice}
                    aria-label={`Tarjeta ${posicion + 1}`}
                    className={`billetera__punto${
                      posicion === indice ? " billetera__punto--activo" : ""
                    }`}
                    onClick={() => irATarjeta(posicion)}
                  />
                ))}
              </div>
            )}
            <button type="button" className="billetera__agregar" onClick={alVincular}>
              <Icon name="mas" />
              Vincular tarjeta
            </button>
          </div>
        </section>
      )}

      {tarjeta && (
        <section className="seccion">
          <div className="seccion__cabecera">
            <h2 className="seccion__titulo">Últimos movimientos</h2>
          </div>
          {cargandoMovimientos ? (
            <EsqueletoMovimientos filas={4} etiqueta="Cargando tus últimos movimientos…" />
          ) : recientes.length > 0 ? (
            <ul className="lista-movimientos">
              {recientes.map((movimiento) => (
                <MovimientoFila
                  key={movimiento.id}
                  movimiento={movimiento}
                  seleccionado={movimiento.id === seleccionadoId}
                  alSeleccionar={alSeleccionarMovimiento}
                />
              ))}
            </ul>
          ) : (
            <p className="vacio">Todavía no hay movimientos en esta tarjeta.</p>
          )}
        </section>
      )}
    </div>
  );
}
