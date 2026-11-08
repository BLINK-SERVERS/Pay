import { useEffect, useState } from "react";
import {
  avisoDescartado,
  descartarAviso,
  instalar,
  modoInstalacion,
  suscribirInstalacion,
} from "../lib/instalacion";
import { Icon } from "./Icon";

interface Props {
  /** Solo se ofrece en la pantalla de inicio, con la sesión ya abierta. */
  visible: boolean;
}

/**
 * Aviso propio de instalación, al estilo de una hoja del sistema.
 * Sustituye al cartel que Chrome enseña por su cuenta, que queda cancelado
 * en `lib/instalacion.ts` antes de que llegue a pintarse.
 */
export function AvisoInstalacion({ visible }: Props) {
  const [, refrescar] = useState(0);

  useEffect(() => suscribirInstalacion(() => refrescar((n) => n + 1)), []);

  const modo = modoInstalacion();
  if (!visible || !modo || avisoDescartado()) return null;

  return (
    <aside className="instalacion" aria-label="Instalar Blink Pay">
      <div className="instalacion__cabecera">
        <img
          className="instalacion__icono"
          src={`${import.meta.env.BASE_URL}icon-192.png`}
          width="44"
          height="44"
          alt=""
          draggable={false}
        />
        <div className="instalacion__texto">
          <strong>Lleva Blink Pay contigo</strong>
          {modo === "nativo" ? (
            <span>Abre la app directamente, sin pasar por el navegador.</span>
          ) : modo === "ios" ? (
            <span>
              Toca <Icon name="compartir" className="instalacion__glifo" variante="monocromo" />
              <span className="instalacion__glifo-texto">Compartir</span> y elige «Añadir a
              pantalla de inicio».
            </span>
          ) : (
            <span>
              Abre el menú del navegador y elige «Añadir a pantalla de inicio».
            </span>
          )}
        </div>
      </div>

      <div className="instalacion__acciones">
        {modo === "nativo" ? (
          <>
            <button
              type="button"
              className="boton boton--fantasma boton--compacto"
              onClick={descartarAviso}
            >
              Ahora no
            </button>
            <button
              type="button"
              className="boton boton--primario boton--compacto"
              onClick={() => void instalar()}
            >
              Instalar
            </button>
          </>
        ) : (
          <button
            type="button"
            className="boton boton--primario boton--compacto"
            onClick={descartarAviso}
          >
            Entendido
          </button>
        )}
      </div>
    </aside>
  );
}
