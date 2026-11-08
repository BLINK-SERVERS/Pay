// Instalación de la PWA con aviso propio.
//
// El navegador dispara `beforeinstallprompt` cuando la app se puede instalar.
// Si ese evento no se intercepta, Chrome enseña su propio cartel; aquí se
// cancela (`preventDefault`) y se guarda el evento para ofrecerlo cuando la
// app decida: solo en la pantalla de inicio y con la sesión abierta.

export type EventoInstalacion = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/** `nativo`: hay diálogo del sistema. `ios`/`android`: pasos manuales. */
export type ModoInstalacion = "nativo" | "ios" | "android";

const CLAVE = "blink.pay.instalacion";
/** Si dice «Ahora no», no se vuelve a ofrecer hasta pasado este tiempo. */
const ESPERA = 30 * 24 * 60 * 60 * 1000;

let diferido: EventoInstalacion | null = null;
const oyentes = new Set<() => void>();

function avisar() {
  for (const oyente of oyentes) oyente();
}

/** Se llama al arrancar, antes de montar React, para que el aviso del
 *  navegador no llegue a mostrarse nunca. */
export function prepararInstalacion(): void {
  if (typeof window === "undefined") return;
  window.addEventListener("beforeinstallprompt", (evento) => {
    evento.preventDefault();
    diferido = evento as EventoInstalacion;
    avisar();
  });
  window.addEventListener("appinstalled", () => {
    diferido = null;
    olvidarDescarte();
    avisar();
  });
}

export function suscribirInstalacion(oyente: () => void): () => void {
  oyentes.add(oyente);
  return () => {
    oyentes.delete(oyente);
  };
}

/** Abierta como app instalada: ya no hay nada que ofrecer. */
export function enAppInstalada(): boolean {
  if (typeof window === "undefined") return false;
  const navegador = (typeof navigator === "undefined" ? null : navigator) as
    | (Navigator & { standalone?: boolean })
    | null;
  if (navegador?.standalone === true) return true;
  return window.matchMedia?.("(display-mode: standalone)").matches === true;
}

function esIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  if (/iPad|iPhone|iPod/.test(navigator.userAgent)) return true;
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
}

function esAndroid(): boolean {
  return typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);
}

export function modoInstalacion(): ModoInstalacion | null {
  if (typeof window === "undefined" || enAppInstalada()) return null;
  if (diferido) return "nativo";
  if (esIOS()) return "ios";
  if (esAndroid()) return "android";
  // Escritorio sin diálogo: el menú del navegador ya ofrece la instalación.
  return null;
}

export function avisoDescartado(): boolean {
  try {
    const crudo = localStorage.getItem(CLAVE);
    if (!crudo) return false;
    const fecha = Number(crudo);
    return Number.isFinite(fecha) && Date.now() - fecha < ESPERA;
  } catch {
    return false;
  }
}

function olvidarDescarte() {
  try {
    localStorage.removeItem(CLAVE);
  } catch {
    /* sin almacenamiento: el aviso vuelve a ofrecerse la próxima vez */
  }
}

export function descartarAviso(): void {
  try {
    localStorage.setItem(CLAVE, String(Date.now()));
  } catch {
    /* sin almacenamiento: no se recuerda el descarte */
  }
}

/** Abre el diálogo del sistema. Devuelve `true` si la app quedó instalada. */
export async function instalar(): Promise<boolean> {
  const evento = diferido;
  if (!evento) return false;
  diferido = null;
  try {
    await evento.prompt();
    const eleccion = await evento.userChoice;
    if (eleccion.outcome === "accepted") {
      olvidarDescarte();
      return true;
    }
    descartarAviso();
    return false;
  } catch {
    descartarAviso();
    return false;
  } finally {
    avisar();
  }
}
