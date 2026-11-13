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
const CACHE = PREFIJO + "v16";
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
//
// `cache.addAll` era todo o nada: si un solo archivo del armazón fallaba (un
// 404 de Pages mientras se sube el despliegue, o la red cortada a medias),
// la instalación se abortaba, el worker nunca quedaba en espera y el aviso de
// actualización no volvía hasta la próxima apertura. Ahora cada archivo se
// guarda por separado y lo que falta se pide al navegar.
self.addEventListener("install", (evento) => {
  evento.waitUntil(instalar());
});

async function guardar(cache, url) {
  try {
    // `reload`: al instalar la versión nueva hay que leer la que acaba de
    // subir Pages, no la que quedó en la caché HTTP del navegador.
    const respuesta = await fetch(url, { cache: "reload" });
    if (respuesta && respuesta.ok) await cache.put(url, respuesta);
  } catch {
    // Seguir con el resto: una falta parcial es mejor que ninguna instalación.
  }
}

function referenciasDe(html) {
  const urls = new Set();
  for (const coincidencia of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    try {
      const url = new URL(coincidencia[1], RAIZ);
      if (cacheable(url)) urls.add(url.href);
    } catch {
      // Un href relativo raro no puede tumbar la instalación.
    }
  }
  return urls;
}

// Vite escribe el grafo de dependencias dentro del propio arranque, como
// cadenas `assets/Nombre-hash.js`: las pestañas de carga perezosa y sus hojas
// no aparecen en el index.html. Si solo se guarda lo que enumera el index,
// «Actualizar» y perder la red deja la ruta sin su chunk.
function referenciasInternas(texto) {
  const urls = new Set();
  const tokens = texto.matchAll(/["'(](\/?assets\/[^"'\s)]+?\.(?:js|css|woff2))["')]/g);
  for (const coincidencia of tokens) {
    try {
      const url = new URL(coincidencia[1].replace(/^\//, ""), RAIZ);
      if (cacheable(url)) urls.add(url.href);
    } catch {
      // Un literal parecido a una ruta pero inservible se ignora.
    }
  }
  return urls;
}

async function leer(cache, url) {
  try {
    const respuesta = await cache.match(url);
    return respuesta ? await respuesta.text() : "";
  } catch {
    return "";
  }
}

async function instalar() {
  const cache = await caches.open(CACHE);
  await Promise.all(ARMAZON.map((url) => guardar(cache, url)));

  const html = await leer(cache, RAIZ + "index.html");
  let nuevas = referenciasDe(html);

  // Se repite hasta agotar el grafo: de las tres rondas reales suele sobrar
  // la primera, y el tope evita que un bucle de importaciones congele la
  // instalación del worker.
  for (let ronda = 0; ronda < 3 && nuevas.size > 0; ronda += 1) {
    await Promise.all([...nuevas].map((url) => guardar(cache, url)));
    const siguientes = new Set();
    for (const url of nuevas) {
      if (!url.endsWith(".js")) continue;
      for (const referencia of referenciasInternas(await leer(cache, url))) {
        if (!(await cache.match(referencia))) siguientes.add(referencia);
      }
    }
    nuevas = siguientes;
  }
}

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
