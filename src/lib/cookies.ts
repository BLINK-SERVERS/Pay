// Consentimiento de cookies.
//
// Solo la landing pública pregunta; la app con sesión abierta no muestra el
// aviso. La decisión se guarda en `localStorage` y se respeta en las visitas
// siguientes. Blink Pay no usa cookies publicitarias ni de seguimiento: lo que
// se guarda es lo necesario para la sesión y las preferencias, así que las tres
// respuestas dejan activo el mismo conjunto. El registro conserva cuál eligió
// la persona para poder rendir cuentas del consentimiento.

export type DecisionCookies = "todas" | "necesarias" | "rechazado";

export interface RegistroCookies {
  decision: DecisionCookies;
  /** Momento de la decisión, en ISO 8601. */
  fecha: string;
}

const CLAVE = "blink.pay.cookies";
/** Cambiar la versión vuelve a preguntar (nueva redacción o nuevos fines). */
const VERSION = 1;

interface Almacenado extends RegistroCookies {
  version: number;
}

function decidido(valor: unknown): valor is DecisionCookies {
  return valor === "todas" || valor === "necesarias" || valor === "rechazado";
}

function almacen(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    // Safari en navegación privada puede lanzar al tocar localStorage.
    return null;
  }
}

export function leerConsentimiento(): RegistroCookies | null {
  const crudo = almacen()?.getItem(CLAVE);
  if (!crudo) return null;
  try {
    const datos = JSON.parse(crudo) as Almacenado;
    if (datos.version !== VERSION || !decidido(datos.decision)) return null;
    return { decision: datos.decision, fecha: datos.fecha };
  } catch {
    return null;
  }
}

export function guardarConsentimiento(decision: DecisionCookies): void {
  const registro: Almacenado = {
    decision,
    fecha: new Date().toISOString(),
    version: VERSION,
  };
  try {
    almacen()?.setItem(CLAVE, JSON.stringify(registro));
  } catch {
    // Sin almacenamiento el aviso se cierra igual: la decisión vale para
    // esta visita.
  }
}

/** ¿Hay que enseñar el aviso? Solo hasta que la persona elija. */
export function faltaConsentimiento(): boolean {
  return leerConsentimiento() === null;
}
