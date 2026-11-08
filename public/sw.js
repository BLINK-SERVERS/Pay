/* Blink Pay — capa offline.
   El primer arranque en línea cachea el armazón y, tras tomar el control,
   los recursos con hash. Las llamadas a Supabase son de otro origen y no
   pasan por aquí. Al cambiar la lógica, subir CACHE para borrar la vieja.

   Este origen es compartido con el resto de publicaciones de BLINK
   (`blink-servers.github.io`), así que: se borran solo las cachés propias,
   se guardan solo recursos estáticos del alcance del worker y nunca se
   cachean respuestas de API ni de otros orígenes. */
const PREFIJO = "blink-pay-";
// Las cachés de la etapa «Blink Tarjeta» se borran una vez al activar esta
// versión; sin esto quedarían huérfanas al cambiar el prefijo.
const PREFIJO_LEGADO = "blink-tarjeta-";
const CACHE = PREFIJO + "v10";
const RAIZ = new URL("./", self.location).href;
const ARMAZON = [
  RAIZ,
  RAIZ + "index.html",
  RAIZ + "manifest.webmanifest",
  RAIZ + "icon.png",
  RAIZ + "favicon.svg",
  RAIZ + "qr-portal.svg",
];

const ESTATICAS = /\.(?:js|mjs|css|woff2?|ttf|otf|png|jpe?g|svg|webp|ico|webmanifest)$/i;

function enAlcance(url) {
  return url.origin === self.location.origin && url.href.startsWith(self.registration.scope);
}

// El armazón y los archivos estáticos se guardan; una respuesta de API
// (JSON, RPC, cualquier otra extensión) queda fuera de la caché.
function cacheable(url) {
  return (
    enAlcance(url) &&
    (url.href === RAIZ || url.href === RAIZ + "index.html" || ESTATICAS.test(url.pathname))
  );
}

// La versión nueva se instala pero NO toma el control: queda en espera
// hasta que la página pida activarla. Así el aviso de actualización puede
// aparecer sin recargar la app en medio de una recarga o de un cobro.
self.addEventListener("install", (evento) => {
  evento.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ARMAZON)));
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((claves) =>
        Promise.all(
          claves
            .filter(
              (clave) =>
                (clave.startsWith(PREFIJO) || clave.startsWith(PREFIJO_LEGADO)) &&
                clave !== CACHE
            )
            .map((clave) => caches.delete(clave))
        )
      )
      .then(() => self.clients.claim())
  );
});

// La primera visita carga los recursos antes de que el worker controle la
// página; desde `main.tsx` se envían las URLs vistas para guardarlas aquí.
self.addEventListener("message", (evento) => {
  if (evento.origin !== self.location.origin) return;
  const datos = evento.data;
  if (datos && datos.tipo === "activar") {
    evento.waitUntil(self.skipWaiting());
    return;
  }
  if (!datos || datos.tipo !== "cachear" || !Array.isArray(datos.urls)) return;
  const urls = datos.urls.filter((valor) => {
    if (typeof valor !== "string") return false;
    try {
      return cacheable(new URL(valor));
    } catch {
      return false;
    }
  });
  if (urls.length === 0) return;
  evento.waitUntil(
    caches.open(CACHE).then((cache) =>
      Promise.all(urls.map((url) => cache.add(url).catch(() => {})))
    )
  );
});

async function redPrimero(peticion) {
  const cache = await caches.open(CACHE);
  try {
    const respuesta = await fetch(peticion);
    if (respuesta && respuesta.ok) await cache.put(peticion, respuesta.clone());
    return respuesta;
  } catch {
    return (
      (await cache.match(peticion)) ||
      (await cache.match(RAIZ + "index.html")) ||
      Response.error()
    );
  }
}

self.addEventListener("fetch", (evento) => {
  const peticion = evento.request;
  if (peticion.method !== "GET") return;
  if (!enAlcance(new URL(peticion.url))) return;

  if (peticion.mode === "navigate") {
    evento.respondWith(redPrimero(peticion));
    return;
  }

  // Solo se interceptan recursos estáticos; el resto de peticiones del
  // mismo origen (API, datos) sigue su curso normal y no se guarda.
  if (!cacheable(new URL(peticion.url))) return;

  evento.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const guardada = await cache.match(peticion);
      if (guardada) return guardada;
      try {
        const respuesta = await fetch(peticion);
        if (respuesta && respuesta.ok && respuesta.type === "basic") {
          await cache.put(peticion, respuesta.clone());
        }
        return respuesta;
      } catch {
        return Response.error();
      }
    })
  );
});
