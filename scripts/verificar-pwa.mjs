import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { extname, normalize, resolve } from "node:path";

/**
 * Verificación en Chromium de la actualización de la PWA (#156 y #157).
 *
 * Sirve `dist/` en un servidor propio —no `vite preview`, que añade
 * `Vary: Origin` a los assets y falsea las consultas de caché— y publica una
 * versión nueva cambiándole el número de caché a `dist/sw.js`, que es lo que
 * hace un despliegue real. El servidor se apaga de verdad para simular la
 * pérdida de conexión: `context.setOffline()` no corta el tráfico contra
 * 127.0.0.1.
 *
 * Orden (importa, porque es el caso que fallaba):
 *  1. primera apertura → ningún aviso;
 *  2. se publica v(n+1) → avisa a las dos pestañas y queda en espera;
 *  3. con el worker aún en espera, su caché nueva ya trae los chunks con hash
 *     que referencia el index (lo que `cache.addAll` del armazón no hacía);
 *  4. SE CORTA LA RED y entonces se pulsa «Actualizar»: la pestaña que pidió
 *     se recarga y sigue dibujada; la otra no se recarga y queda «pendiente»,
 *     y al pulsar su propio botón también arranca;
 *  5. si aun así falta un chunk, el límite de error ofrece «Volver a
 *     intentarlo» en lugar de dejar la pantalla en blanco.
 */

const RAIZ_DIST = resolve(new URL("../dist/", import.meta.url).pathname);
const SW_LOCAL = new URL("../dist/sw.js", import.meta.url);
const SALIDA = process.env.BLINK_CAPTURAS ?? "/tmp/blink-pwa";
const ESPERA_RUTA = process.env.BLINK_PWA_ESPERA ?? "Landing-*.js";

const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".txt": "text/plain; charset=utf-8",
};

const servidor = createServer(async (peticion, respuesta) => {
  const camino = decodeURIComponent((peticion.url ?? "/").split("?")[0]);
  const seguro = normalize(camino).replace(/^(\.\.[/\\])+/g, "");
  let archivo = resolve(RAIZ_DIST, "." + (seguro === "/" ? "/index.html" : seguro));
  try {
    const info = await stat(archivo);
    if (info.isDirectory()) archivo = resolve(archivo, "index.html");
  } catch {
    respuesta.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    respuesta.end("404");
    return;
  }
  const cuerpo = await readFile(archivo);
  respuesta.writeHead(200, {
    "content-type": TIPOS[extname(archivo)] ?? "application/octet-stream",
    "content-length": cuerpo.byteLength,
    "cache-control": "no-store",
  });
  respuesta.end(peticion.method === "HEAD" ? undefined : cuerpo);
});

await new Promise((alta) => servidor.listen(0, "127.0.0.1", alta));
const puerto = servidor.address().port;
const BASE = `http://127.0.0.1:${puerto}/`;
const ORIGEN = `http://127.0.0.1:${puerto}`;

const apagar = () => new Promise((cerrado) => servidor.close(cerrado));

const fallos = [];
function exigir(condicion, mensaje) {
  if (condicion) console.log(`  ok · ${mensaje}`);
  else {
    console.log(`  FALLA · ${mensaje}`);
    fallos.push(mensaje);
  }
}

const navegador = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const contexto = await navegador.newContext({
  viewport: { width: 393, height: 852 },
  hasTouch: true,
});

const errores = [];
function vigilar(pagina, nombre) {
  pagina.on("pageerror", (error) => errores.push(`${nombre} · ${error.message}`));
  pagina.on("console", (mensaje) => {
    if (mensaje.type() === "error") errores.push(`${nombre} · ${mensaje.text()}`);
  });
}

const original = await readFile(SW_LOCAL, "utf8");
const numero = Number((original.match(/PREFIJO \+ "v(\d+)"/) ?? [])[1]);
if (!Number.isFinite(numero)) throw new Error("No leí el número de caché de dist/sw.js.");

const archivos = await readdir(resolve(RAIZ_DIST, "assets"));
const regexChunk = new RegExp(`^${ESPERA_RUTA.replace(/\*/g, ".*")}$`);
const perezoso = archivos.find((n) => regexChunk.test(n));
if (!perezoso) throw new Error(`No encontré el chunk «${ESPERA_RUTA}» en dist/assets.`);

// Lee la caché de una versión concreta desde la página (CacheStorage es
// común a todas las pestañas del origen).
const sondear = (pagina, nombreCaché) =>
  pagina.evaluate(
    async ({ origen, nombreChunk, nombreCaché }) => {
      const claves = await caches.keys();
      const caché = await caches.open(nombreCaché);
      const documento = await caché.match(`${origen}/index.html`);
      if (!documento) return { existe: false, claves, refs: [], faltan: [], hayRaiz: false, perezoso: false, total: 0 };
      const html = await documento.text();
      const refs = [
        ...new Set(
          [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
            .map((m) => new URL(m[1], origen).href)
            .filter((u) => u.startsWith(origen) && /assets\//.test(u))
        ),
      ];
      const faltan = [];
      for (const referencia of refs) if (!(await caché.match(referencia))) faltan.push(referencia);
      const raiz = await (await caché.match(`${origen}/`))?.text();
      const entradas = (await caché.keys()).map((r) => r.url);
      return {
        existe: true,
        claves,
        refs,
        faltan,
        hayRaiz: raiz === html,
        perezoso: entradas.some((u) => u.endsWith(nombreChunk)),
        total: entradas.length,
      };
    },
    { origen: ORIGEN, nombreChunk: perezoso, nombreCaché }
  );

const NUEVA = `blink-pay-v${numero + 1}`;

try {
  await mkdir(SALIDA, { recursive: true });

  console.log(`1 · primera apertura en ${BASE}`);
  const pagina = await contexto.newPage();
  vigilar(pagina, "A");
  await pagina.goto(BASE, { waitUntil: "networkidle" });
  await pagina.evaluate(() => navigator.serviceWorker.ready);
  await pagina.reload({ waitUntil: "networkidle" });
  await pagina.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  exigir(
    (await pagina.locator(".actualizacion").count()) === 0,
    "quien entra por primera vez no ve aviso de actualización"
  );

  console.log(`2 · se publica v${numero + 1} y queda en espera en las dos pestañas`);
  await writeFile(
    SW_LOCAL,
    original.replace(`PREFIJO + "v${numero}"`, `PREFIJO + "v${numero + 1}"`)
  );
  await pagina.evaluate(() =>
    navigator.serviceWorker.getRegistration().then((r) => r?.update())
  );
  await pagina.waitForSelector(".actualizacion", { timeout: 30_000 });
  const aviso = await pagina.locator(".actualizacion").innerText();
  exigir(/Actualización disponible/.test(aviso), "la versión nueva avisó sin recargar nada");
  await pagina.screenshot({ path: `${SALIDA}/aviso-disponible.png` });

  const otra = await contexto.newPage();
  vigilar(otra, "B");
  await otra.goto(BASE, { waitUntil: "networkidle" });
  await otra.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await otra.waitForSelector(".actualizacion", { timeout: 15_000 });
  exigir(true, "la pestaña que se abre después también ve la versión en espera");

  console.log(`3 · la caché v${numero + 1} se llenó con los chunks, aún en espera`);
  const informe = await sondear(pagina, NUEVA);
  exigir(informe.existe === true, `existe la caché ${NUEVA}`);
  exigir(
    informe.faltan.length === 0 && informe.refs.length > 0,
    `los ${informe.refs.length} archivos con hash del index nuevo ya están guardados (${informe.total} entradas)`
  );
  exigir(informe.hayRaiz, "la raíz cacheada es idéntica al index nuevo");
  exigir(
    informe.perezoso === true,
    `el chunk de carga perezosa (${perezoso}) también quedó guardado en la instalación`
  );

  console.log("4 · se pierde la conexión y ENTONCES se pulsa «Actualizar»");
  await apagar();
  await otra.evaluate(() => {
    window.__marca = "escrito-a-mano";
  });
  await pagina.evaluate(() => {
    window.__marca = "esta sí se recarga";
  });
  await pagina.locator(".actualizacion__acciones .boton--primario").click();
  const recargoA = await pagina
    .waitForFunction(() => window.__marca === undefined, { timeout: 15_000 })
    .then(
      () => true,
      () => false
    );
  exigir(recargoA, "la pestaña que pidió actualizar se recargó");
  await pagina.waitForTimeout(800);
  exigir(
    (await pagina.evaluate(() => document.getElementById("root")?.childElementCount ?? 0)) > 0,
    "sin servidor, la pestaña actualizada se dibujó (antes quedaba en blanco)"
  );
  exigir(
    (await pagina.locator(".lp-hero__cta").count()) > 0,
    "la portada es legible con la conexión cortada"
  );
  await pagina.screenshot({ path: `${SALIDA}/offline-tras-actualizar.png` });
  exigir(
    (await otra.evaluate(() => window.__marca)) === "escrito-a-mano",
    "la otra pestaña NO se recargó al actualizar ésta"
  );
  const pasoPendiente = await otra
    .waitForFunction(
      () => /Actualizar esta pestaña/.test(document.querySelector(".actualizacion")?.innerText ?? ""),
      { timeout: 10_000 }
    )
    .then(
      () => true,
      () => false
    );
  exigir(
    pasoPendiente &&
      /Ya hay una versión nueva activa/.test(await otra.locator(".actualizacion").innerText()),
    "la otra pestaña quedó en estado pendiente, con su propia acción"
  );
  if (pasoPendiente) {
    await otra.locator(".actualizacion__acciones .boton--primario").click();
    const seRecargo = await otra
      .waitForFunction(() => window.__marca === undefined, { timeout: 15_000 })
      .then(
        () => true,
        () => false
      );
    await otra.waitForTimeout(600);
    exigir(
      seRecargo &&
        (await otra.evaluate(() => document.getElementById("root")?.childElementCount ?? 0)) > 0,
      "la segunda pestaña arrancó al pulsar su «Actualizar esta pestaña», sin conexión"
    );
    await otra.screenshot({ path: `${SALIDA}/pestana-dos-offline.png` });
  }

  const inesperados = errores.filter(
    (e) => !/favicon|ERR_CONNECTION_REFUSED|ERR_INTERNET_DISCONNECTED|Failed to load resource|net::ERR_FAILED/i.test(e)
  );
  exigir(
    inesperados.length === 0,
    `sin errores de consola inesperados (${errores.length} avisos, ${inesperados.length} inesperados)`
  );
  for (const e of inesperados.slice(0, 5)) console.log(`    · ${e}`);

  console.log("5 · si aun así falta un chunk, la app no queda en blanco");
  // Quedarse sin caché para una ruta perezosa era el peor caso posible:
  // importación fallida y pantalla vacía sin manera de salir.
  await pagina.evaluate(
    async ({ prefijo, nombreChunk }) => {
      for (const clave of (await caches.keys()).filter((k) => k.startsWith(prefijo))) {
        const caché = await caches.open(clave);
        for (const entrada of await caché.keys()) {
          if (entrada.url.endsWith(nombreChunk)) await caché.delete(entrada.url);
        }
      }
    },
    { prefijo: "blink-", nombreChunk: perezoso }
  );
  errores.length = 0;
  await pagina.reload({ waitUntil: "load" });
  await pagina.waitForTimeout(1200);
  exigir(
    (await pagina.locator(".aviso--peligro[role='alert']").count()) === 1,
    "el límite de error pintó su aviso en vez de dejar la pantalla vacía"
  );
  const botones = await pagina.locator(".aviso--peligro button").allInnerTexts();
  exigir(
    botones.some((t) => /Volver a intentarlo/.test(t)),
    `el aviso ofrece una salida clara: ${JSON.stringify(botones)}`
  );
  await pagina.screenshot({ path: `${SALIDA}/chunk-faltante.png` });
} finally {
  await writeFile(SW_LOCAL, original);
  await navegador.close();
}

console.log("");
if (fallos.length > 0) {
  console.log(`FALLAN ${fallos.length} comprobaciones:`);
  for (const fallo of fallos) console.log(` · ${fallo}`);
  process.exit(1);
}
console.log("En verde: la versión nueva se cachea entera, sin red la app sigue en pie y las demás pestañas no se recargan.");
