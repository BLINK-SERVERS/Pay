// Aviso de versión nueva de la PWA. El service worker recién instalado
// queda en espera: no toma el control ni recarga la app hasta que el
// pasajero toca «Actualizar». Así una recarga o un cobro no se cortan a
// mitad de camino y el cambio de versión se siente como en una app nativa.

type Oyente = (disponible: boolean) => void;

const MIN_ENTRE_COMPROBACIONES = 60 * 1000;
const CADA_CUANTO_MS = 30 * 60 * 1000;

const oyentes = new Set<Oyente>();
let registro: ServiceWorkerRegistration | null = null;
let conControl: boolean | null = null;
let disponible = false;
let recargando = false;
let comprobando = false;
let ultimaComprobacion = 0;

function avisar(valor: boolean): void {
  disponible = valor;
  for (const oyente of oyentes) oyente(valor);
}

export function suscribirActualizacion(oyente: Oyente): () => void {
  oyentes.add(oyente);
  oyente(disponible);
  return () => {
    oyentes.delete(oyente);
  };
}

/** Deja el aviso oculto; el worker nuevo sigue esperando para la próxima. */
export function descartarActualizacion(): void {
  avisar(false);
}

/**
 * Pide al worker en espera que active la versión nueva. El recargado lo
 * dispara `controllerchange`, una sola vez, para no entrar en un bucle.
 */
export function aplicarActualizacion(): void {
  const espera = registro?.waiting;
  if (!espera) {
    avisar(false);
    void comprobar(true);
    return;
  }
  espera.postMessage({ tipo: "activar" });
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
    if (nuevo.state === "installed" && conControl) avisar(true);
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
    if (actual.waiting && conControl) avisar(true);
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
    recargando = true;
    window.location.reload();
  });
}
