import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../components/Icon";
import { MovimientoFila } from "../components/MovimientoFila";
import { TarjetaVirtual } from "../components/TarjetaVirtual";
import { formatearBs, formatearEntero, iniciales, nombreCompleto } from "../lib/formato";
import { pasajesEquivalentes } from "../lib/dominio";
import type { Cuenta, Movimiento, Tarjeta } from "../lib/tipos";

interface Props {
  cuenta: Cuenta;
  tarjetas: Tarjeta[];
  tarjeta: Tarjeta | null;
  movimientos: Movimiento[];
  saldoOculto: boolean;
  alAlternarSaldo: () => void;
  alSeleccionar: (serial: string) => void;
  alVincular: () => void;
  alRecargar: () => void;
  alVerMovimientos: () => void;
  alVerPerfil: () => void;
  alAbrirPagoMovil: () => void;
  seleccionadoId?: string | null;
  alSeleccionarMovimiento?: (movimiento: Movimiento) => void;
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
  saldoOculto,
  alAlternarSaldo,
  alSeleccionar,
  alVincular,
  alRecargar,
  alVerMovimientos,
  alVerPerfil,
  alAbrirPagoMovil,
  seleccionadoId,
  alSeleccionarMovimiento,
}: Props) {
  const nombre = cuenta.nombres.split(" ")[0] ?? "";
  const recientes = movimientos.slice(0, 4);
  const pendiente = movimientos.find((m) => m.estado === "pendiente");
  const pasajes = tarjeta ? pasajesEquivalentes(tarjeta.saldo, tarjeta.tarifa) : 0;

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

  const mes = useMemo(() => {
    const ahora = new Date();
    const delMes = movimientos.filter((m) => {
      const fecha = new Date(m.at);
      return (
        fecha.getMonth() === ahora.getMonth() &&
        fecha.getFullYear() === ahora.getFullYear() &&
        m.estado === "aprobado"
      );
    });
    return {
      viajes: delMes.filter((m) => m.tipo === "viaje").length,
      recargado: delMes
        .filter((m) => m.tipo === "recarga")
        .reduce((total, m) => total + m.monto, 0),
    };
  }, [movimientos]);

  return (
    <div className="vista vista--inicio">
      <header className="cabecera">
        <div>
          <span className="cabecera__saludo">{saludo()}</span>
          <h1 className="cabecera__titulo">{nombre}</h1>
        </div>
        <button
          type="button"
          className="avatar"
          onClick={alVerPerfil}
          aria-label={`Perfil de ${nombreCompleto(cuenta.nombres, cuenta.apellidos)}`}
        >
          {iniciales(nombreCompleto(cuenta.nombres, cuenta.apellidos))}
        </button>
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
            tabIndex={0}
            role="group"
            aria-label={`Tarjeta ${indice + 1} de ${tarjetas.length}`}
          >
            {tarjetas.map((item) => (
              <div className="billetera__slide" key={item.serial}>
                <TarjetaVirtual
                  tarjeta={item}
                  saldoOculto={saldoOculto}
                  alAlternarSaldo={alAlternarSaldo}
                />
              </div>
            ))}
          </div>

          <div className="billetera__controles">
            {tarjetas.length > 1 && (
              <div className="billetera__puntos" role="tablist" aria-label="Elegir tarjeta">
                {tarjetas.map((item, posicion) => (
                  <button
                    key={item.serial}
                    type="button"
                    role="tab"
                    aria-selected={posicion === indice}
                    aria-label={`Tarjeta ${item.serial}`}
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
        <>
          <div className="acciones" role="group" aria-label="Acciones de la tarjeta">
            <button type="button" className="accion accion--principal" onClick={alRecargar}>
              <span className="accion__icono">
                <Icon name="recargar" />
              </span>
              <span>Recargar</span>
            </button>
            <button type="button" className="accion" onClick={alVerMovimientos}>
              <span className="accion__icono">
                <Icon name="movimientos" />
              </span>
              <span>Movimientos</span>
            </button>
            <button type="button" className="accion" onClick={alAbrirPagoMovil}>
              <span className="accion__icono">
                <Icon name="banco" />
              </span>
              <span>Pago Móvil</span>
            </button>
            <button type="button" className="accion" onClick={alVerPerfil}>
              <span className="accion__icono">
                <Icon name="escudo" />
              </span>
              <span>Mi cuenta</span>
            </button>
          </div>

          <div className="tiles">
            <div className="tile">
              <span className="tile__etiqueta">Viajes este mes</span>
              <strong className="tile__valor">{mes.viajes}</strong>
              <span className="tile__pie">{formatearBs(tarjeta.tarifa)} por pasaje</span>
            </div>
            <div className="tile">
              <span className="tile__etiqueta">Recargado este mes</span>
              <strong className="tile__valor">{formatearEntero(mes.recargado)}</strong>
              <span className="tile__pie">bolívares acreditados</span>
            </div>
          </div>

          <section className="seccion">
            <div className="seccion__cabecera">
              <h2 className="seccion__titulo">Últimos movimientos</h2>
              <button type="button" className="seccion__enlace" onClick={alVerMovimientos}>
                Ver todos
              </button>
            </div>
            <p className="seccion__sub mono">{tarjeta.serial}</p>
            {recientes.length > 0 ? (
              <ul className="lista-movimientos">
                {recientes.map((movimiento) => (
                  <MovimientoFila
                    key={movimiento.id}
                    movimiento={movimiento}
                    seleccionado={movimiento.id === seleccionadoId}
                    alSeleccionar={
                      alSeleccionarMovimiento
                        ? () => alSeleccionarMovimiento(movimiento)
                        : undefined
                    }
                  />
                ))}
              </ul>
            ) : (
              <p className="vacio">Todavía no hay movimientos en esta tarjeta.</p>
            )}
          </section>

          {pasajes <= 2 && tarjeta.estado === "activa" && (
            <section className="aviso-tarjeta">
              <div className="aviso-tarjeta__texto">
                <Icon name="rayo" />
                <div>
                  <strong>
                    {pasajes === 0 ? "Te quedaste sin saldo" : "Te queda poco saldo"}
                  </strong>
                  <p>
                    {pasajes === 0
                      ? "Recarga ahora y sigue viajando sin bajar de la unidad."
                      : `Con ${formatearBs(tarjeta.saldo)} te alcanza para ${pasajes} ${
                          pasajes === 1 ? "pasaje" : "pasajes"
                        }.`}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="boton boton--secundario boton--compacto"
                onClick={alRecargar}
              >
                Recargar
              </button>
            </section>
          )}
        </>
      )}

      <p className="pie-marca">
        BLINK TARJETA · {tarjetas.length} {tarjetas.length === 1 ? "tarjeta" : "tarjetas"} en tu
        cuenta
      </p>
    </div>
  );
}
