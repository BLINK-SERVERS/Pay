import { useEffect, useState } from "react";
import {
  aplicarActualizacion,
  descartarActualizacion,
  recargarEstaPestana,
  suscribirActualizacion,
  type EstadoActualizacion,
} from "../lib/actualizacion";
import { Icon } from "./Icon";

/** Aviso flotante de versión nueva, al estilo de una app instalada. */
export function AvisoActualizacion() {
  const [estado, setEstado] = useState<EstadoActualizacion>("ninguno");

  useEffect(() => suscribirActualizacion(setEstado), []);

  if (estado === "ninguno") return null;

  const pendiente = estado === "pendiente";

  return (
    <div
      className="actualizacion"
      role="status"
      aria-live="polite"
      aria-label="Actualización disponible"
    >
      <div className="actualizacion__cabecera">
        <span className="actualizacion__icono" aria-hidden="true">
          <Icon name="actualizar" />
        </span>
        <div className="actualizacion__texto">
          {pendiente ? (
            <>
              <strong>Ya hay una versión nueva activa</strong>
              <span>
                Otra pestaña actualizó Blink Pay. Esta sigue con la versión
                anterior; recárgala cuando no estés a mitad de un trámite.
              </span>
            </>
          ) : (
            <>
              <strong>Actualización disponible</strong>
              <span>Hay una versión nueva de Blink Pay. Actualiza para recibir las mejoras.</span>
            </>
          )}
        </div>
      </div>
      <div className="actualizacion__acciones">
        <button
          type="button"
          className="boton boton--fantasma boton--compacto"
          onClick={descartarActualizacion}
        >
          Ahora no
        </button>
        <button
          type="button"
          className="boton boton--primario boton--compacto"
          onClick={pendiente ? recargarEstaPestana : aplicarActualizacion}
        >
          <Icon name="actualizar" />
          {pendiente ? "Actualizar esta pestaña" : "Actualizar"}
        </button>
      </div>
    </div>
  );
}
