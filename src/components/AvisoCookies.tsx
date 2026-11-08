import { useState } from "react";
import {
  faltaConsentimiento,
  guardarConsentimiento,
  type DecisionCookies,
} from "../lib/cookies";

interface Props {
  /** Abre la política de privacidad, donde se detalla qué se guarda. */
  alPrivacidad: () => void;
}

const OPCIONES: { decision: DecisionCookies; etiqueta: string; clase: string }[] = [
  { decision: "rechazado", etiqueta: "Rechazar", clase: "boton--fantasma" },
  { decision: "necesarias", etiqueta: "Solo las necesarias", clase: "boton--secundario" },
  { decision: "todas", etiqueta: "Aceptar todas", clase: "boton--primario" },
];

/**
 * Aviso de cookies de la landing pública.
 *
 * Se queda hasta que la persona elija una de las tres respuestas; la decisión
 * se guarda en `lib/cookies.ts` y no vuelve a preguntarse. La tarjeta sigue el
 * material de la hoja del sistema, igual que el aviso de instalación.
 */
export function AvisoCookies({ alPrivacidad }: Props) {
  const [visible, setVisible] = useState(faltaConsentimiento);
  if (!visible) return null;

  function decidir(decision: DecisionCookies) {
    guardarConsentimiento(decision);
    setVisible(false);
  }

  return (
    <aside className="cookies" aria-labelledby="cookies-titulo">
      <h2 className="cookies__titulo" id="cookies-titulo">
        Cookies y almacenamiento local
      </h2>
      <p className="cookies__texto">
        Usamos lo necesario para que Blink Pay funcione: recordar tus preferencias y
        mantener tu sesión segura. Nada de publicidad ni seguimiento de terceros.{" "}
        <button type="button" className="cookies__enlace" onClick={alPrivacidad}>
          Política de privacidad
        </button>
      </p>
      <div className="cookies__acciones">
        {OPCIONES.map((opcion) => (
          <button
            key={opcion.decision}
            type="button"
            className={`boton boton--compacto ${opcion.clase}`}
            onClick={() => decidir(opcion.decision)}
          >
            {opcion.etiqueta}
          </button>
        ))}
      </div>
    </aside>
  );
}
