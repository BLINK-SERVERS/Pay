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

// Rasteriza un SVG (o imagen) sobre negro y devuelve la cobertura de cada
// pixel empaquetada en nibbles: 2 px por byte y cada fila padreada a byte
// completo (paso = (ancho + 1) / 2). El arte de marca es siempre un color
// plano sobre el fondo de la escena, así que basta el canal rojo:
// 15 = primer plano, 0 = fondo. El validador pinta el fondo con fillScreen y
// mezcla con una tabla de 16 colores, de modo que el mismo archivo sirve para
// el negro del reposo y el azul del splash. En RGB565 estos tres lienzos
// ocupaban 228 KB de flash; en cobertura ocupan 57 KB.
function cobertura(rgba, w, h) {
  const paso = (w + 1) >> 1;
  const out = new Uint8Array(paso * h);
  for (let i = 0; i < w * h; i++) {
    const a = Math.min(15, Math.round((rgba[i * 4] * 15) / 255));
    const fila = Math.floor(i / w);
    const col = i % w;
    const k = fila * paso + (col >> 1);
    if ((col & 1) === 0) out[k] = a << 4;
    else out[k] |= a;
  }
  return { paso, bytes: Array.from(out) };
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
    <g id="ondas" transform="translate(48 33) scale(0.42) translate(-887.73 0)" fill="none" stroke="#FFFEFB" stroke-width="24.4" stroke-linecap="round">
      <path id="nfc-1" d="M 960.93 166.9 A 61 61 0 0 0 899.93 105.9"/>
      <path id="nfc-2" d="M 1008.03 166.9 A 108.1 108.1 0 0 0 899.93 58.8"/>
      <path id="nfc-3" d="M 1054.63 166.9 A 154.7 154.7 0 0 0 899.93 12.2"/>
    </g>
  </g>
</svg>
`;
fs.writeFileSync(path.join(MARCA, "blink-pay-sin-contacto.svg"), svgSinContacto);

// --- Assets de cobertura ----------------------------------------------------
const rSinContacto = await rasterizar(svgSinContacto, 200, 120, "#000000");
guardarPreview("sin-contacto", rSinContacto.png);
const sinContacto = cobertura(rSinContacto.rgba, 200, 120);

const isotipoSvg = fs.readFileSync(path.join(MARCA, "blink-isotipo.svg"), "utf8")
  .replaceAll("currentColor", "#FFFEFB");
const rIsotipo = await rasterizar(isotipoSvg, 132, 104, "#000000");
guardarPreview("isotipo", rIsotipo.png);
const isotipo = cobertura(rIsotipo.rgba, 132, 104);

// Splash: lockup maestro sin la capa de ondas + ondas parciales por etapa.
const maestro = fs.readFileSync(path.join(MARCA, "blink-pay-blanco.svg"), "utf8");
const inicioOndas = maestro.lastIndexOf("<g", maestro.indexOf('inkscape:label="Ondas NFC"'));
const finOndas = maestro.indexOf("</svg>", inicioOndas);
const base = maestro.slice(0, inicioOndas) + maestro.slice(finOndas);
const finRaiz = base.indexOf(">", base.indexOf("<svg"));
const conFondo =
  base.slice(0, finRaiz + 1) +
  `<rect x="0" y="0" width="1121" height="321" fill="#000000"/>` +
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
  const r = await rasterizar(svg, 232, 66, "#000000");
  etapas.push(cobertura(r.rgba, 232, 66));
  if (e === 4) guardarPreview("splash", r.png);
}

// --- Iconos de la barra de estado -------------------------------------------
// Geometría propia imitando los glifos de estado de un teléfono (señal Wi-Fi
// de tres arcos + punto, batería con cápsula y borne, rayo de carga). No son
// SF Symbols: Apple no licencia esos archivos (R-26 / L-16), así que se dibujan
// desde cero con el mismo lenguaje visual. Se entregan como cobertura, igual
// que el arte de marca, para que el panel los vea alisados.
function arco(cx, cy, r, desde, hasta) {
  const p = (a) => [
    (cx + r * Math.cos((a * Math.PI) / 180)).toFixed(2),
    (cy + r * Math.sin((a * Math.PI) / 180)).toFixed(2),
  ];
  const [x0, y0] = p(desde);
  const [x1, y1] = p(hasta);
  return `M ${x0} ${y0} A ${r} ${r} 0 0 1 ${x1} ${y1}`;
}

// El abanico mide 84° (270° ± 42°): con el radio 9,5 y 130° que usamos antes,
// el extremo del arco caía en x = -0,6 y el glifo se cortaba contra el lienzo.
// El trazo de 1,5 y los radios espaciados 3 px dejan separaciones de 1,5 px
// entre arcos, que es lo mínimo para que los tres se lean redondos en 16 px.
function svgWifi(nivel) {
  const radios = [3, 6, 9];
  const trazos = `<g fill="none" stroke="#FFFEFB" stroke-width="1.5" stroke-linecap="round">` +
    radios
      .slice(0, Math.max(0, nivel))
      .map((r) => `<path d="${arco(8, 10.8, r, 228, 312)}"/>`)
      .join("") +
    `</g><circle cx="8" cy="10.8" r="1.1" fill="#FFFEFB"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="12" viewBox="0 0 16 12">${trazos}</svg>`;
}

// Sólo la cápsula y el borne: el nivel se pinta en el validador con un rect
// interior, así que una sola imagen sirve para cualquier porcentaje.
const svgBateria = `<svg xmlns="http://www.w3.org/2000/svg" width="25" height="12" viewBox="0 0 25 12">
  <rect x="0.9" y="0.9" width="19.6" height="10.2" rx="2.9" fill="none" stroke="#FFFEFB" stroke-width="1.8"/>
  <rect x="22" y="4.2" width="1.6" height="3.6" rx="0.8" fill="#FFFEFB"/>
</svg>`;

const svgRayo = `<svg xmlns="http://www.w3.org/2000/svg" width="9" height="13" viewBox="0 0 9 13">
  <path d="M 5.6 0.5 L 1.4 7.4 L 3.9 7.4 L 3.1 12.5 L 7.6 5.2 L 5 5.2 Z" fill="#FFFEFB"/>
</svg>`;

const iconos = [];
for (let n = 0; n <= 3; n++) {
  const r = await rasterizar(svgWifi(n), 16, 12, "#000000");
  iconos.push(cobertura(r.rgba, 16, 12));
  if (n === 3) guardarPreview("wifi", r.png);
}
const rBateria = await rasterizar(svgBateria, 25, 12, "#000000");
guardarPreview("bateria", rBateria.png);
const bateria = cobertura(rBateria.rgba, 25, 12);
const rRayo = await rasterizar(svgRayo, 9, 13, "#000000");
guardarPreview("rayo", rRayo.png);
const rayo = cobertura(rRayo.rgba, 9, 13);

// --- Cabecera C -------------------------------------------------------------
function arregloCrudo(valores) {
  let s = "";
  for (let i = 0; i < valores.length; i += 16) {
    s += "  " + valores.slice(i, i + 16).map((v) => "0x" + v.toString(16).padStart(2, "0")).join(", ") + ",\n";
  }
  return s;
}

function arreglo(nombre, valores) {
  return `const uint8_t ${nombre}[${valores.length}] PROGMEM = {\n${arregloCrudo(valores)}};\n`;
}

let h = `#pragma once
#include <Arduino.h>

// Generado por Pay/scripts/build-firmware-assets.mjs desde los maestros SVG
// de marca/. No editar a mano: regenerar tras cualquier cambio de marca.
//
// Cobertura de 4 bits por pixel (2 px por byte, filas padreadas a byte):
// 0 = el fondo de la escena, 15 = el blanco de marca. Cada escena pinta su
// fondo con fillScreen y mezcla con una tabla de 16 colores, así que un solo
// archivo sirve sobre negro (reposo, saldo) y sobre azul (splash).
// En RGB565 estos tres lienzos ocupaban 228 576 B; en cobertura ocupan 57 144.

constexpr int16_t SIN_CONTACTO_W = 200;
constexpr int16_t SIN_CONTACTO_H = 120;
constexpr int16_t SIN_CONTACTO_PASO = 100;
constexpr int16_t ISOTIPO_W = 132;
constexpr int16_t ISOTIPO_H = 104;
constexpr int16_t ISOTIPO_PASO = 66;
constexpr int16_t SPLASH_W = 232;
constexpr int16_t SPLASH_H = 66;
constexpr int16_t SPLASH_PASO = 116;
constexpr uint8_t SPLASH_ETAPAS = 5;

`;
h += arreglo("SIN_CONTACTO", sinContacto.bytes) + "\n";
h += arreglo("ISOTIPO", isotipo.bytes) + "\n";
h += `const uint8_t SPLASH[SPLASH_ETAPAS][SPLASH_H * SPLASH_PASO] PROGMEM = {\n`;
for (const e of etapas) {
  h += "  {\n";
  for (let i = 0; i < e.bytes.length; i += 16) {
    h += "    " + e.bytes.slice(i, i + 16).map((v) => "0x" + v.toString(16).padStart(2, "0")).join(", ") + ",\n";
  }
  h += "  },\n";
}
h += "};\n";
h += "\n// Iconos de la barra de estado: señal Wi-Fi por niveles, batería y rayo de carga.\n";
h += `constexpr int16_t WIFI_W = 16;
constexpr int16_t WIFI_H = 12;
constexpr int16_t WIFI_PASO = 8;
constexpr uint8_t WIFI_NIVELES = 4;
constexpr uint16_t WIFI_B = ${iconos[0].bytes.length};
const uint8_t WIFI[WIFI_NIVELES * WIFI_B] PROGMEM = {
`;
h += arregloCrudo(iconos.flatMap((e) => e.bytes));
h += "};\n";
h += `constexpr int16_t BATERIA_W = 25;
constexpr int16_t BATERIA_H = 12;
constexpr int16_t BATERIA_PASO = 13;
`;
h += arreglo("BATERIA", bateria.bytes) + "\n";
h += `constexpr int16_t RAYO_W = 9;
constexpr int16_t RAYO_H = 13;
constexpr int16_t RAYO_PASO = 5;
`;
h += arreglo("RAYO", rayo.bytes) + "\n";
fs.writeFileSync(SALIDA, h);
console.log("assets.h:", SALIDA, fs.statSync(SALIDA).size, "bytes");

await browser.close();