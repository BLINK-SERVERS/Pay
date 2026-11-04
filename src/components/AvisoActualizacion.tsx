import { useEffect, useState } from "react";
import {
  aplicarActualizacion,
  descartarActualizacion,
  suscribirActualizacion,
} from "../lib/actualizacion";
import { Icon } from "./Icon";

/** Aviso flotante de versión nueva, al estilo de una app instalada. */
export function AvisoActualizacion() {
  const [disponible, setDisponible] = useState(false);

  useEffect(() => suscribirActualizacion(setDisponible), []);

  if (!disponible) return null;

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
          <strong>Actualización disponible</strong>
          <span>Hay una versión nueva de BLINK TARJETA. Actualiza para recibir las mejoras.</span>
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
          onClick={aplicarActualizacion}
        >
          <Icon name="actualizar" />
          Actualizar
        </button>
      </div>
    </div>
  );
}
