// Rasteriza la imagen OG (1200×630) desde `marca/blink-pay-og.svg`.
// Mismo pipeline que build-icons.mjs: Chromium de Playwright (o el del
// sistema con CHROMIUM_PATH) para que el PNG coincida con el render del SVG.
//
// Antes de rasterizar comprueba que la geometría de marca viaje TAL CUAL:
// cada path `d` del lockup maestro y del arte de la tarjeta debe aparecer
// idéntico en la composición OG. Y audita G2 en la única curva nueva (el
// círculo de «Listo», dos arcos del mismo radio): κ coincide en el empalme.
//
// El texto auxiliar usa la pila de la app; como SF Pro no se distribuye,
// aquí se inyecta Inter (SIL OFL, el respaldo declarado en fonts.css) para
// que el PNG salga con la misma voz que ve un equipo sin SF Pro instalada.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const RAIZ = fileURLToPath(new URL("..", import.meta.url));
const MARCA = path.join(RAIZ, "marca");
const PUB = path.join(RAIZ, "public");
const ANCHO = 1200;
const ALTO = 630;

const svg = fs.readFileSync(path.join(MARCA, "blink-pay-og.svg"), "utf8");

// --- Fidelidad de la geometría aprobada ---
const pathsDe = (texto) => [...texto.matchAll(/\bd="([^"]+)"/g)].map((m) => m[1]);
const lockup = fs.readFileSync(path.join(MARCA, "blink-pay.svg"), "utf8");
const tarjeta = fs.readFileSync(path.join(PUB, "brand", "blink-pay-tarjeta.svg"), "utf8");
const og = new Set(pathsDe(svg));
for (const [nombre, fuente] of [
  ["lockup", lockup],
  ["tarjeta", tarjeta],
]) {
  const esperados = pathsDe(fuente);
  const faltan = esperados.filter((d) => !og.has(d));
  if (faltan.length) {
    console.error(`✗ ${nombre}: ${faltan.length} paths no viajan tal cual`);
    process.exit(1);
  }
  console.log(`✓ ${nombre}: ${esperados.length} paths idénticos al maestro`);
}

// --- G2 en el círculo de «Listo» (única curva nueva) ---
// Dos arcos A 22 22 … unidos en (622,520) y (578,520): misma circunferencia,
// luego κ = 1/r a ambos lados del empalme. Se mide sobre el propio path.
const circulo = svg.match(/id="circulo-listo" d="([^"]+)"/)[1];
const radios = [...circulo.matchAll(/A\s+([\d.]+)\s+([\d.]+)\s+0\s+[01]\s+[01]\s+(-?[\d.]+)\s+(-?[\d.]+)/g)];
const k = radios.map((m) => 1 / Number(m[1]));
const delta = Math.abs(k[0] - k[1]);
console.log(`✓ G2 círculo «Listo»: κ1=${k[0].toFixed(8)} κ2=${k[1].toFixed(8)} |Δκ|=${delta}`);
if (delta > 1e-9) process.exit(1);

// --- Raster ---
const inter = fs.readFileSync(path.join(RAIZ, "src", "assets", "fonts", "inter-latin.woff2"));
const fuente = `@font-face{font-family:"Inter";font-style:normal;font-weight:100 900;src:url(data:font/woff2;base64,${inter.toString("base64")}) format("woff2")}`;
const html = `<!doctype html><meta charset="utf-8"><style>${fuente}
html,body{margin:0;padding:0;background:#007AFF}
svg{display:block;width:${ANCHO}px;height:${ALTO}px}</style>${svg}`;

const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}
);
const page = await browser.newPage({ viewport: { width: ANCHO, height: ALTO } });
await page.setContent(html, { waitUntil: "load" });
await page.evaluate(() => document.fonts.ready);
const dest = path.join(PUB, "og.png");
await page.screenshot({ path: dest });
await browser.close();

const png = fs.readFileSync(dest);
const w = png.readUInt32BE(16);
const h = png.readUInt32BE(20);
console.log(`og.png ${w}×${h}, ${png.length} bytes`);
if (w !== ANCHO || h !== ALTO) process.exit(1);