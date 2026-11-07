import { chromium } from "playwright-core";

/**
 * Verificación de los dos cargadores de marca descritos en
 * `docs/documento-maestro-estetica.md` (§8.2 y §8.3).
 *
 * Blink Pay se comprueba sobre el contrato CSS del cargador: el marcado real
 * de `brand/blink-pay.svg` montado con las clases del componente. En modo
 * local la sesión se restaura en un microtask y el cargador no llega a
 * pintarse, así que esperar a verlo sería no determinista.
 *
 * Blink POS se comprueba de verdad: se retrasa el trozo diferido de
 * `AppInterna` para que el `Suspense` muestre su cargador y se leen las
 * animaciones en curso con `getAnimations()`.
 */

const BASE = process.env.BLINK_URL ?? "http://127.0.0.1:5175/";
const POS = process.env.BLINK_POS_URL ?? "http://127.0.0.1:5173/";

const navegador = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

function revisar(etiqueta, valor, correcto) {
  if (!correcto) throw new Error(`${etiqueta}: ${JSON.stringify(valor)}`);
  console.log(`  ✓ ${etiqueta}`);
}

const cerca = (a, b, margen = 0.5) => Math.abs(a - b) <= margen;
const mismos = (a, b, margen = 0.0001) =>
  a.length === b.length && a.every((valor, i) => Math.abs(valor - b[i]) <= margen);

async function nuevaPagina(opciones = {}) {
  const contexto = await navegador.newContext({
    viewport: { width: 393, height: 852 },
    colorScheme: "light",
    hasTouch: true,
    ...opciones,
  });
  return { contexto, pagina: await contexto.newPage() };
}

function leerAnimaciones(pagina, nombre) {
  return pagina.evaluate(
    (nombre) =>
      document
        .getAnimations()
        .filter((a) => a.animationName === nombre)
        .map((a) => ({ id: a.effect.target?.id, timing: a.effect.getTiming(), claves: a.effect.getKeyframes() })),
    nombre
  );
}

/** Monta el cargador real de Pay con el SVG que sirve la app. */
async function montarCargadorPay(pagina) {
  await pagina.waitForSelector(".acceso__panel");
  await pagina.evaluate(async () => {
    const url = new URL("brand/blink-pay.svg", document.baseURI);
    const svg = await (await fetch(url)).text();
    const host = document.createElement("div");
    host.className = "pay-loader";
    host.innerHTML = `<div class="pay-loader__marca">${svg}</div>`;
    document.body.append(host);
  });
  await pagina.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))));
}

// --- Blink Pay · cascada NFC -------------------------------------------
console.log(`\nPay ${BASE} · cargador de ondas`);
{
  const { contexto, pagina } = await nuevaPagina();
  await pagina.goto(BASE, { waitUntil: "networkidle" });
  await montarCargadorPay(pagina);

  const ondas = await leerAnimaciones(pagina, "onda-nfc");
  const retardos = { "nfc-1": 0, "nfc-2": 180, "nfc-3": 360 };

  revisar(
    "tres ondas: nfc-1, nfc-2 y nfc-3",
    ondas.map((o) => o.id).sort(),
    JSON.stringify(ondas.map((o) => o.id).sort()) === JSON.stringify(["nfc-1", "nfc-2", "nfc-3"])
  );
  revisar(
    "1,8 s · infinita · both · retardos 0/180/360 ms",
    ondas.map((o) => o.timing),
    ondas.every(
      (o) =>
        o.timing.duration === 1800 &&
        o.timing.iterations === Infinity &&
        o.timing.fill === "both" &&
        cerca(o.timing.delay, retardos[o.id])
    )
  );
  revisar(
    "claves de opacidad 0,2 → 1 (30 %) → 0,2 (65 %)",
    ondas[0].claves,
    ondas.every(
      (o) =>
        mismos(o.claves.map((c) => c.offset), [0, 0.3, 0.65, 1]) &&
        JSON.stringify(o.claves.map((c) => c.opacity)) === JSON.stringify(["0.2", "1", "0.2", "0.2"])
    )
  );

  await contexto.close();
}

console.log(`\nPay ${BASE} · cargador con movimiento reducido`);
{
  const { contexto, pagina } = await nuevaPagina({ reducedMotion: "reduce" });
  await pagina.goto(BASE, { waitUntil: "networkidle" });
  await montarCargadorPay(pagina);

  const ondas = await leerAnimaciones(pagina, "onda-nfc");
  const opacidades = await pagina.evaluate(() =>
    ["nfc-1", "nfc-2", "nfc-3"].map((id) => Number(getComputedStyle(document.getElementById(id)).opacity))
  );
  revisar("sin animación", ondas.length, ondas.length === 0);
  revisar("ondas a opacidad 1", opacidades, opacidades.every((valor) => cerca(valor, 1, 0.01)));

  await contexto.close();
}

let posDisponible = true;
try {
  await fetch(POS, { signal: AbortSignal.timeout(2500) });
} catch {
  posDisponible = false;
}

if (!posDisponible) {
  console.log(`\nPOS ${POS} no responde: se omite el cargador de POS; el de Pay ya está verificado.`);
  await navegador.close();
  process.exit(0);
}

// --- Blink POS · reensamblado del isotipo ------------------------------
async function abrirCargadorPos(pagina) {
  // Retrasar el trozo perezoso hace determinista el fallback de Suspense.
  await pagina.route(/AppInterna/, async (ruta) => {
    await new Promise((ok) => setTimeout(ok, 1500));
    await ruta.continue();
  });
  await pagina.goto(`${POS}app/inicio`, { waitUntil: "commit" });
  await pagina.waitForSelector(".brand-loader", { timeout: 15000 });
  await pagina.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))));
}

const PIEZAS = {
  "ojo-guino": { x: "-56px", y: "-48px", giro: "-360deg" },
  "ojo-abierto": { x: "40px", y: "-56px", giro: "360deg" },
  boca: { x: "-12px", y: "58px", giro: "360deg" },
};

console.log(`\nPOS ${POS} · cargador de reensamblado`);
{
  const { contexto, pagina } = await nuevaPagina();
  await abrirCargadorPos(pagina);

  const piezas = await leerAnimaciones(pagina, "brand-reassemble");
  revisar(
    "tres piezas: ojo que guiña, ojo abierto y boca",
    piezas.map((p) => p.id).sort(),
    JSON.stringify(piezas.map((p) => p.id).sort()) === JSON.stringify(Object.keys(PIEZAS).sort())
  );
  revisar(
    "2,8 s infinita en las tres",
    piezas.map((p) => p.timing),
    piezas.every((p) => p.timing.duration === 2800 && p.timing.iterations === Infinity)
  );
  revisar(
    "claves 0 · 12 · 32 · 64 · 84 · 100 %",
    piezas[0].claves.map((c) => c.offset),
    piezas.every((p) => mismos(p.claves.map((c) => c.offset), [0, 0.12, 0.32, 0.64, 0.84, 1]))
  );
  revisar(
    "separación en 32 % y giro en 64 % por pieza",
    piezas.map((p) => p.claves.map((c) => c.transform)),
    piezas.every((p) => {
      const { x, y, giro } = PIEZAS[p.id];
      return (
        p.claves[2].transform.includes(`translate(${x}, ${y})`) &&
        p.claves[2].transform.includes("rotate(0deg)") &&
        p.claves[3].transform.includes(`translate(${x}, ${y})`) &&
        p.claves[3].transform.includes(`rotate(${giro})`)
      );
    })
  );

  const ejes = await pagina.evaluate(() =>
    ["ojo-guino", "ojo-abierto", "boca"].map((id) => {
      const estilo = getComputedStyle(document.getElementById(id));
      return { caja: estilo.transformBox, origen: estilo.transformOrigin };
    })
  );
  revisar(
    "cada pieza gira sobre su propio centro",
    ejes,
    ejes.every((e) => e.caja === "fill-box" && !["0px 0px", "0% 0%"].includes(e.origen))
  );

  await contexto.close();
}

console.log(`\nPOS ${POS} · cargador con movimiento reducido`);
{
  const { contexto, pagina } = await nuevaPagina({ reducedMotion: "reduce" });
  await abrirCargadorPos(pagina);

  const piezas = await leerAnimaciones(pagina, "brand-reassemble");
  const transformaciones = await pagina.evaluate(() =>
    ["ojo-guino", "ojo-abierto", "boca"].map((id) => getComputedStyle(document.getElementById(id)).transform)
  );
  revisar("sin animación", piezas.length, piezas.length === 0);
  revisar("piezas sin transformar", transformaciones, transformaciones.every((valor) => valor === "none"));

  await contexto.close();
}

await navegador.close();
console.log("\nMovimiento verificado.");
