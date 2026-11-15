// Genera `simbolos.h` del validador ESP32: los glifos del menú de desarrollo.
//
// La geometría no se dibuja a mano ni se copia de una fuente: se toma de
// `sf-symbols-lib` (los SF Symbols oficiales empaquetados como SVG, los mismos
// que consume la web a través de `src/components/ui/BlinkSymbol.tsx`) y se
// rasteriza con supersampling al tamaño del panel. Así el datáfono y el portal
// muestran el mismo trazo, no dos interpretaciones.
//
// Licencia: Apple restringe SF Symbols a sus plataformas; el riesgo está
// aceptado y documentado en ISO-HIG-BLINK-001 (R-26). El menú solo existe con
// MODO_DEV, que se borra antes de la comercialización.
//
// Uso: CHROMIUM_PATH=/usr/bin/chromium node scripts/build-firmware-simbolos.mjs [salida.h]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const ICONOS = fileURLToPath(
  new URL("../node_modules/sf-symbols-lib/dist/monochrome/icons", import.meta.url)
);
const SALIDA =
  process.argv[2] || "/home/prodz/BLINK/firmware/validador/simbolos.h";

// Lado del recuadro final, en píxeles del panel. Cada glifo se centra dentro.
const LADO = 14;
const AUMENTO = 3; // supersampling: se rasteriza a 42 y se promedia a 14

// Nombre del C → símbolo de SF Symbols. Un solo listado: si aquí está, existe
// en el encabezado generado.
const TABLA = [
  ["SIM_ESTADO", "SFInfoCircleFill"],
  ["SIM_BILLETE", "SFBanknoteFill"],
  ["SIM_QR", "SFQrcode"],
  ["SIM_WIFI", "SFWifi"],
  ["SIM_TECLADO", "SFKeyboard"],
  ["SIM_MUNDO", "SFGlobe"],
  ["SIM_GIRO", "SFArrowTrianglehead2Clockwise"],
  ["SIM_BAJADA", "SFArrowDownCircle"],
  ["SIM_DOCUMENTO", "SFTextDocument"],
  ["SIM_BASURA", "SFXmarkBin"],
  ["SIM_CERRAR", "SFXmarkCircle"],
  ["SIM_LUNA", "SFMoonFill"],
  ["SIM_SOL", "SFSunMaxFill"],
  ["SIM_POWER", "SFPower"],
  ["SIM_ATRAS", "SFChevronLeft"],
  ["SIM_AVANCE", "SFChevronRight"],
  ["SIM_LLAVE", "SFKeyFill"],
  ["SIM_CANDADO", "SFLockFill"],
  ["SIM_NUMEROS", "SFNumbers"],
  ["SIM_LETRAS", "SFCharacter"],
  ["SIM_SIGNOS", "SFTextformat"],
  ["SIM_ESPACIO", "SFSpace"],
  ["SIM_BORRAR", "SFDeleteLeft"],
  ["SIM_VACIAR", "SFDeleteLeftFill"],
  ["SIM_LISTO", "SFCheckmarkCircle"],
  ["SIM_RELOJ", "SFClockFill"],
  ["SIM_ANTENA", "SFWifiRouter"],
];

const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}
);
const page = await browser.newPage();

// Saca de el módulo React el `<g>` con los trazos y su caja de viewBox.
function extraer(nombre) {
  const fuente = fs.readFileSync(path.join(ICONOS, `${nombre}.js`), "utf8");
  const g = fuente.match(/'(<g>[\s\S]*?<\/g>)'/);
  const caja = fuente.match(/"(0 0 [\d.]+ [\d.]+)"/);
  if (!g || !caja) throw new Error(`${nombre}: no se encontró el SVG`);
  return {
    svg: g[1].replaceAll("currentColor", "#FFFFFF").replaceAll(/ fill-opacity="[\d.]+"/g, ""),
    caja: caja[1],
  };
}

// Rasteriza a LADO×AUMENTO y promedia por celda: a 14 px el antialiasing
// nativo del navegador deja trazos de una décima de cobertura y el glifo se
// ve fantasma; con el promedio la tinta se reparte de verdad.
async function mosaico(nombre) {
  const { svg, caja } = extraer(nombre);
  const [x0, y0, w0, h0] = caja.split(" ").map(Number);
  const grande = LADO * AUMENTO;
  const doc = `<svg xmlns="http://www.w3.org/2000/svg" width="${grande}" height="${grande}"` +
    ` viewBox="0 0 ${w0} ${h0}" preserveAspectRatio="xMidYMid meet">` +
    `<rect x="0" y="0" width="${w0}" height="${h0}" fill="#000000"/>${svg}</svg>`;
  const datos = await page.evaluate(
    async ({ src, lado }) => {
      const img = new Image();
      img.src = "data:image/svg+xml;base64," + btoa(src);
      await img.decode();
      const c = document.createElement("canvas");
      c.width = lado;
      c.height = lado;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, lado, lado);
      ctx.drawImage(img, 0, 0, lado, lado);
      return Array.from(ctx.getImageData(0, 0, lado, lado).data);
    },
    { src: doc, lado: grande }
  );

  const paso = (LADO + 1) >> 1;
  const salida = new Uint8Array(paso * LADO);
  for (let y = 0; y < LADO; y++) {
    for (let x = 0; x < LADO; x++) {
      let suma = 0;
      for (let dy = 0; dy < AUMENTO; dy++) {
        for (let dx = 0; dx < AUMENTO; dx++) {
          const i = ((y * AUMENTO + dy) * grande + (x * AUMENTO + dx)) * 4;
          suma += datos[i]; // canal rojo: negro 0, blanco 255
        }
      }
      const cobertura = Math.min(15, Math.round(suma / (AUMENTO * AUMENTO * 17)));
      const k = y * paso + (x >> 1);
      if ((x & 1) === 0) salida[k] = cobertura << 4;
      else salida[k] |= cobertura;
    }
  }
  return { bytes: salida, paso };
}

function ascii({ bytes, paso }) {
  const filas = [];
  for (let y = 0; y < LADO; y++) {
    let linea = "";
    for (let x = 0; x < LADO; x++) {
      const nib = (bytes[y * paso + (x >> 1)] >> ((x & 1) ? 0 : 4)) & 0x0f;
      linea += " .:-=+*#%@"[Math.min(9, Math.round((nib * 9) / 15))];
    }
    filas.push(linea);
  }
  return filas.join("\n");
}

const glifos = [];
const enum_ = [];
let bytes = 0;
for (const [nombre, simbolo] of TABLA) {
  const m = await mosaico(simbolo);
  if (bytes === 0) bytes = m.bytes.length;
  else if (m.bytes.length !== bytes)
    throw new Error(`${simbolo}: ${m.bytes.length} B, se esperaba ${bytes} B`);
  const hex = Array.from(m.bytes)
    .map((b) => "0x" + b.toString(16).padStart(2, "0"))
    .join(", ");
  glifos.push(`  { ${hex} },  // ${nombre}  ${simbolo}`);
  enum_.push(`  ${nombre},  // ${simbolo}`);
  console.log(`${nombre.padEnd(12)} ${String(m.bytes.length).padStart(3)} B  ${simbolo}\n${ascii(m)}`);
}

const encabezado = `#pragma once
#include <Arduino.h>

// Generado por Pay/scripts/build-firmware-simbolos.mjs desde sf-symbols-lib.
// No editar a mano: regenerar con
//   CHROMIUM_PATH=/usr/bin/chromium node scripts/build-firmware-simbolos.mjs
//
// Cobertura de 4 bits por pixel (2 px por byte, filas padreadas a byte), del
// mismo modo que assets.h: 0 = el color del chip, 15 = el blanco de marca.
// Cada glifo cuadro de ${LADO}x${LADO} px, ya centrado dentro del recuadro, y
// supersampled 3:1 para que un trazo de 1 px no salga con huecos.
//
// Un solo arreglo bidimensional indexado por el enum: los nombres SIM_* son el
// enum, así que no pueden ser también el nombre de un arreglo (colisionaban y
// el encabezado no compilaba). Todos los glifos miden lo mismo porque el recuadro
// es fijo; si uno cambiara de tamaño, el generador lo rechaza arriba.
//
// Licencia: Apple restringe SF Symbols a sus plataformas (ISO-HIG-BLINK-001,
// riesgo R-26). Solo se usan en el menú de desarrollo, que sale del firmware
// comercial con MODO_DEV = false.

constexpr int16_t SIM_LADO = ${LADO};
constexpr int16_t SIM_PASO = ${(LADO + 1) >> 1};
constexpr uint8_t SIM_BYTES = ${bytes};
constexpr uint8_t SIM_TOTAL = ${TABLA.length};

enum Simbolo : uint8_t {
${enum_.join("\n")}
  SIM_NINGUNO = 0xFF,  // fila sin chip
};

const uint8_t SIM_GLOSO[SIM_TOTAL][SIM_BYTES] PROGMEM = {
${glifos.join("\n")}
};
`;

fs.writeFileSync(SALIDA, encabezado);
console.log(`\n${SALIDA}: ${TABLA.length} glifos, ${encabezado.length} B de encabezado`);
await browser.close();
