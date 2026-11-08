// Genera `assets.h` del validador ESP32 (RGB565 en flash) desde los maestros
// SVG de `marca/` y la referencia autorizada del símbolo sin contacto de Apple
// (`referencias/apple-contactless.jpg`): elipse y mano se vectorizan con
// potrace y los cuatro crecientes se sustituyen por las tres ondas de marca.
//
// Uso: CHROMIUM_PATH=/usr/bin/chromium node scripts/build-firmware-assets.mjs [salida.h]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { chromium } from "playwright-core";

const require = createRequire(import.meta.url);
const potrace = require("potrace");

const MARCA = fileURLToPath(new URL("../marca", import.meta.url));
const SALIDA = process.argv[2] || "/home/prodz/Arduino/BLINK_Validador/assets.h";

const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}
);
const page = await browser.newPage();

// Rasteriza un SVG (o imagen) en un lienzo de la página y devuelve RGBA + PNG.
async function rasterizar(svg, w, h, fondo) {
  const url = "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64");
  return page.evaluate(
    async ({ url, w, h, fondo }) => {
      const img = new Image();
      img.src = url;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d");
      ctx.fillStyle = fondo;
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      const datos = ctx.getImageData(0, 0, w, h).data;
      return { rgba: Array.from(datos), png: c.toDataURL("image/png") };
    },
    { url, w, h, fondo }
  );
}

function rgb565(rgba) {
  const n = rgba.length / 4;
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const r = rgba[i * 4] >> 3;
    const g = rgba[i * 4 + 1] >> 2;
    const b = rgba[i * 4 + 2] >> 3;
    out[i] = (r << 11) | (g << 5) | b;
  }
  return out;
}

function guardarPreview(nombre, png) {
  fs.writeFileSync(`/tmp/prev-${nombre}.png`, Buffer.from(png.split(",")[1], "base64"));
}

// --- Símbolo sin contacto: elipse + mano de la referencia, ondas de marca ---
const refJpg = fs.readFileSync(path.join(MARCA, "referencias", "apple-contactless.jpg"));
const refUrl = "data:image/jpeg;base64," + refJpg.toString("base64");
const ref = await page.evaluate(async (url) => {
  const img = new Image();
  img.src = url;
  await img.decode();
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext("2d");
  ctx.drawImage(img, 0, 0);
  return { w: c.width, h: c.height, rgba: Array.from(ctx.getImageData(0, 0, c.width, c.height).data) };
}, refUrl);

// Componentes conexos del trazo gris: los cuatro crecientes viven dentro de
// x[35,135]; la elipse y la mano salen de esa caja y se conservan intactas.
const mascara = new Uint8Array(ref.w * ref.h);
for (let i = 0; i < mascara.length; i++) {
  const l = 0.2126 * ref.rgba[i * 4] + 0.7152 * ref.rgba[i * 4 + 1] + 0.0722 * ref.rgba[i * 4 + 2];
  mascara[i] = l < 210 ? 1 : 0;
}
const visto = new Uint8Array(mascara.length);
const componentes = [];
for (let i = 0; i < mascara.length; i++) {
  if (!mascara[i] || visto[i]) continue;
  const pila = [i];
  visto[i] = 1;
  let x0 = ref.w, x1 = 0, y0 = ref.h, y1 = 0, n = 0;
  while (pila.length) {
    const q = pila.pop();
    const x = q % ref.w, y = (q / ref.w) | 0;
    n++;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= ref.w || ny >= ref.h) continue;
      const r = ny * ref.w + nx;
      if (mascara[r] && !visto[r]) {
        visto[r] = 1;
        pila.push(r);
      }
    }
  }
  componentes.push({ x0, x1, y0, y1, n });
}
const crecientes = componentes.filter((c) => c.x0 >= 35 && c.x1 <= 135 && c.n > 20);
console.log("componentes:", componentes.map((c) => `[${c.x0},${c.y0}..${c.x1},${c.y1}] n=${c.n}`).join(" "));
console.log("crecientes eliminados:", crecientes.length);
for (const c of crecientes) {
  for (let y = c.y0; y <= c.y1; y++) {
    for (let x = c.x0; x <= c.x1; x++) {
      const i = y * ref.w + x;
      if (mascara[i]) mascara[i] = 0;
    }
  }
}
// El creciente eliminado se borra por caja: si la elipse cruzara esa caja se
// habría llevado un trozo; las cajas medidas no la tocan (ver log anterior).
const limpio = await page.evaluate(
  ({ w, h, mascara }) => {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    const img = ctx.createImageData(w, h);
    for (let i = 0; i < w * h; i++) {
      const v = mascara[i] ? 0 : 255;
      img.data[i * 4] = v;
      img.data[i * 4 + 1] = v;
      img.data[i * 4 + 2] = v;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return c.toDataURL("image/png");
  },
  { w: ref.w, h: ref.h, mascara: Array.from(mascara) }
);
const svgTrazado = await new Promise((resolver, rechazar) => {
  potrace.trace(Buffer.from(limpio.split(",")[1], "base64"), {
    threshold: 128,
    turdSize: 2,
    optiCurve: true,
    color: "#FFFEFB",
  }, (err, svg) => (err ? rechazar(err) : resolver(svg)));
});
const grupoTrazado = svgTrazado.match(/<path[\s\S]*\/>/)[0];

const svgSinContacto = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="236" height="142" viewBox="0 0 236 142" version="1.1" shape-rendering="geometricPrecision" fill="none">
  <title>Blink Pay — pago sin contacto</title>
  <desc>Composición del símbolo sin contacto de Apple (elipse y mano con tarjeta, vectorizadas de la referencia autorizada) con los cuatro crecientes sustituidos por las tres ondas de la marca.</desc>
  <g inkscape:groupmode="layer" inkscape:label="Elipse y mano" id="capa-simbolo">
    ${grupoTrazado}
  </g>
  <g inkscape:groupmode="layer" inkscape:label="Ondas de marca" id="capa-ondas">
    <g id="ondas" transform="translate(48 33) scale(0.42) translate(-887.73 0)" fill="none" stroke="#007AFF" stroke-width="24.4" stroke-linecap="round">
      <path id="nfc-1" d="M 960.93 166.9 A 61 61 0 0 0 899.93 105.9"/>
      <path id="nfc-2" d="M 1008.03 166.9 A 108.1 108.1 0 0 0 899.93 58.8"/>
      <path id="nfc-3" d="M 1054.63 166.9 A 154.7 154.7 0 0 0 899.93 12.2"/>
    </g>
  </g>
</svg>
`;
fs.writeFileSync(path.join(MARCA, "blink-pay-sin-contacto.svg"), svgSinContacto);

// --- Assets RGB565 ----------------------------------------------------------
const sinContacto = await rasterizar(svgSinContacto, 200, 120, "#000000");
guardarPreview("sin-contacto", sinContacto.png);

const isotipoSvg = fs.readFileSync(path.join(MARCA, "blink-isotipo.svg"), "utf8")
  .replaceAll("currentColor", "#FFFEFB");
const isotipo = await rasterizar(isotipoSvg, 132, 104, "#000000");
guardarPreview("isotipo", isotipo.png);

// Splash: lockup maestro sin la capa de ondas + ondas parciales por etapa.
const maestro = fs.readFileSync(path.join(MARCA, "blink-pay-blanco.svg"), "utf8");
const inicioOndas = maestro.lastIndexOf("<g", maestro.indexOf('inkscape:label="Ondas NFC"'));
const finOndas = maestro.indexOf("</svg>", inicioOndas);
const base = maestro.slice(0, inicioOndas) + maestro.slice(finOndas);
const finRaiz = base.indexOf(">", base.indexOf("<svg"));
const conFondo =
  base.slice(0, finRaiz + 1) +
  `<rect x="0" y="0" width="1121" height="321" fill="#007AFF"/>` +
  base.slice(finRaiz + 1);

function ondasParciales(etapa) {
  if (etapa === 0) return "";
  const radios = [61, 108.1, 154.7];
  let paths = "";
  for (let i = 0; i < 3; i++) {
    const f = i <= etapa - 2 ? 1 : i === etapa - 1 ? 0.55 : 0;
    if (f === 0) continue;
    const r = radios[i];
    const th = (-90 * f * Math.PI) / 180;
    const ex = (953.75 + r * Math.cos(th)).toFixed(2);
    const ey = (-111 + r * Math.sin(th)).toFixed(2);
    paths += `<path d="M ${(953.75 + r).toFixed(2)} -111 A ${r} ${r} 0 0 0 ${ex} ${ey}"/>`;
  }
  return `<g transform="translate(0 277.9)" fill="none" stroke="#FFFEFB" stroke-width="24.4" stroke-linecap="round">${paths}</g>`;
}

const etapas = [];
for (let e = 0; e <= 4; e++) {
  const svg = conFondo.replace("</svg>", ondasParciales(e) + "</svg>");
  const r = await rasterizar(svg, 232, 66, "#007AFF");
  etapas.push(rgb565(r.rgba));
  if (e === 4) guardarPreview("splash", r.png);
}

// --- Cabecera C -------------------------------------------------------------
function arreglo(nombre, valores) {
  let s = `const uint16_t ${nombre}[${valores.length}] PROGMEM = {\n`;
  for (let i = 0; i < valores.length; i += 12) {
    s += "  " + valores.slice(i, i + 12).map((v) => "0x" + v.toString(16).padStart(4, "0")).join(", ") + ",\n";
  }
  return s + "};\n";
}

let h = `#pragma once
#include <Arduino.h>

// Generado por Pay/scripts/build-firmware-assets.mjs desde los maestros SVG
// de marca/. No editar a mano: regenerar tras cualquier cambio de marca.
// RGB565 listo para memcpy al lienzo de pantalla.

constexpr int16_t SIN_CONTACTO_W = 200;
constexpr int16_t SIN_CONTACTO_H = 120;
constexpr int16_t ISOTIPO_W = 132;
constexpr int16_t ISOTIPO_H = 104;
constexpr int16_t SPLASH_W = 232;
constexpr int16_t SPLASH_H = 66;
constexpr uint8_t SPLASH_ETAPAS = 5;

`;
h += arreglo("SIN_CONTACTO", rgb565(sinContacto.rgba)) + "\n";
h += arreglo("ISOTIPO", rgb565(isotipo.rgba)) + "\n";
h += `const uint16_t SPLASH[SPLASH_ETAPAS][SPLASH_W * SPLASH_H] PROGMEM = {\n`;
for (const e of etapas) {
  h += "  {\n";
  for (let i = 0; i < e.length; i += 12) {
    h += "    " + e.slice(i, i + 12).map((v) => "0x" + v.toString(16).padStart(4, "0")).join(", ") + ",\n";
  }
  h += "  },\n";
}
h += "};\n";
fs.writeFileSync(SALIDA, h);
console.log("assets.h:", SALIDA, fs.statSync(SALIDA).size, "bytes");

await browser.close();