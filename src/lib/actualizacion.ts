// Aviso de versión nueva de la PWA. El service worker recién instalado
// queda en espera: no toma el control ni recarga la app hasta que el
// pasajero toca «Actualizar». Así una recarga o un cobro no se cortan a
// mitad de camino y el cambio de versión se siente como en una app nativa.
//
// `skipWaiting` es global: cuando el pasajero actualiza una pestaña, las
// demás también cambian de controlador. Recargarlas a todas era el fallo
// (#157) —una segunda ventana a mitad de un Pago Móvil reportado perdía el
// comprobante—. Solo se recarga la pestaña que lo pidió; las otras reciben
// el aviso en estado `pendiente` y eligen su momento.

export type EstadoActualizacion = "ninguno" | "disponible" | "pendiente";

type Oyente = (estado: EstadoActualizacion) => void;

const MIN_ENTRE_COMPROBACIONES = 60 * 1000;
const CADA_CUANTO_MS = 30 * 60 * 1000;

const oyentes = new Set<Oyente>();
let registro: ServiceWorkerRegistration | null = null;
let conControl: boolean | null = null;
let estado: EstadoActualizacion = "ninguno";
let recargando = false;
let comprobando = false;
let sePidioActivar = false;
let ultimaComprobacion = 0;

function avisar(valor: EstadoActualizacion): void {
  estado = valor;
  for (const oyente of oyentes) oyente(valor);
}

export function suscribirActualizacion(oyente: Oyente): () => void {
  oyentes.add(oyente);
  oyente(estado);
  return () => {
    oyentes.delete(oyente);
  };
}

/** Deja el aviso oculto; el worker nuevo sigue esperando para la próxima. */
export function descartarActualizacion(): void {
  avisar("ninguno");
}

/**
 * Pide al worker en espera que active la versión nueva. El recargado lo
 * dispara `controllerchange`, una sola vez, para no entrar en un bucle.
 */
export function aplicarActualizacion(): void {
  const espera = registro?.waiting;
  if (!espera) {
    avisar("ninguno");
    void comprobar(true);
    return;
  }
  sePidioActivar = true;
  espera.postMessage({ tipo: "activar" });
}

/** Recarga solo esta pestaña: es la acción del estado `pendiente`. */
export function recargarEstaPestana(): void {
  if (recargando) return;
  recargando = true;
  window.location.reload();
}

async function comprobar(forzar = false): Promise<void> {
  if (!registro || comprobando) return;
  if (document.visibilityState === "hidden" && !forzar) return;
  const ahora = Date.now();
  if (!forzar && ahora - ultimaComprobacion < MIN_ENTRE_COMPROBACIONES) return;
  ultimaComprobacion = ahora;
  comprobando = true;
  try {
    await registro.update();
  } catch {
    // Sin red: se reintenta al volver a la app o en la próxima apertura.
  } finally {
    comprobando = false;
  }
}

function vigilarInstalacion(): void {
  const nuevo = registro?.installing;
  if (!nuevo) return;
  nuevo.addEventListener("statechange", () => {
    // `controller` distingue una actualización de la primera instalación:
    // en la primera visita no hay nada que avisar.
    if (nuevo.state === "installed" && conControl) avisar("disponible");
  });
}

function cachearPrimeraVisita(actual: ServiceWorkerRegistration): void {
  const enviar = () => {
    const urls = Array.from(
      new Set([
        window.location.href,
        ...performance.getEntriesByType("resource").map((entrada) => entrada.name),
      ])
    ).filter((url) => url.startsWith(window.location.origin));
    actual.active?.postMessage({ tipo: "cachear", urls });
  };
  if (document.readyState === "complete") enviar();
  else window.addEventListener("load", enviar, { once: true });
}

async function iniciar(): Promise<void> {
  try {
    const actual = await navigator.serviceWorker.register(
      `${import.meta.env.BASE_URL}sw.js`,
      { updateViaCache: "none" }
    );
    registro = actual;
    conControl = Boolean(navigator.serviceWorker.controller);
    actual.addEventListener("updatefound", vigilarInstalacion);

    await navigator.serviceWorker.ready;
    cachearPrimeraVisita(actual);

    // Un worker pudo quedar esperando antes de esta carga.
    if (actual.waiting && conControl) avisar("disponible");
  } catch {
    // Sin service worker la app sigue funcionando en línea.
  }
}

export function prepararActualizaciones(): void {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;

  void iniciar();

  window.setInterval(() => void comprobar(), CADA_CUANTO_MS);
  window.addEventListener("online", () => void comprobar());
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) void comprobar();
  });

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!conControl || recargando) return;
    // El controlador cambió por culpa de OTRA pestaña que pulsó «Actualizar».
    // Esta no se recarga: puede estar a mitad de un Pago Móvil reportado o de
    // una transferencia revisada. Se avisa y el pasajero elige el momento.
    if (!sePidioActivar) {
      avisar("pendiente");
      return;
    }
    recargando = true;
    window.location.reload();
  });
}
