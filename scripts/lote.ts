/*
 * Genera un lote de tarjetas de Blink Pay.
 *
 *   npm run lote -- --cantidad 500 --lote 7 --patrocinante "Comercial, C.A."
 *
 * Escribe dos archivos en `lotes/`:
 *   lote-NNN.csv   seriales y códigos de barras para la estación de enrolado
 *   lote-NNN.html  hoja A4 lista para imprimir (Code 128 + QR del portal)
 *
 * El HTML se imprime desde el navegador: Ctrl+P → Guardar como PDF o
 * directamente a la impresora de tarjetas.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import bwipjs from "bwip-js/node";
import { csvLote, generarLote } from "../src/lib/lote.ts";
import type { LoteGenerado, TarjetaLote } from "../src/lib/lote.ts";

const PORTAL_POR_DEFECTO = "https://pay.blink.com.ve/";
const SALIDA_POR_DEFECTO = "lotes";
const TARJETAS_POR_HOJA = 8;

const AYUDA = `Blink Pay · generador de lotes

  npm run lote -- [opciones]

Opciones
  --cantidad N        tarjetas del lote, 1–20000 (por defecto 10)
  --desde N           secuencial inicial de la serie (por defecto 1)
  --lote N            número de lote impreso en la hoja (por defecto 1)
  --patrocinante TXT  marca que financia el lote (opcional)
  --tarifa 1|2        1 = general, 2 = estudiante (por defecto 1)
  --estado NN         código de entidad federal, 23 = Zulia (por defecto 23)
  --url URL           dirección que abre el QR (por defecto el portal)
  --salida CARPETA    dónde escribir los archivos (por defecto lotes)
  --ayuda             muestra esta ayuda

Ejemplo
  npm run lote -- --cantidad 500 --lote 7 --patrocinante "Comercial, C.A."
`;

interface OpcionesCli {
  cantidad: number;
  desde: number;
  estado: number;
  tarifa: 1 | 2;
  lote: number;
  patrocinante: string;
  url: string;
  salida: string;
}

function entero(valor: string | undefined, nombre: string, porDefecto: number): number {
  if (valor === undefined) return porDefecto;
  const numero = Number(valor);
  if (!Number.isInteger(numero)) throw new Error(`--${nombre} debe ser un número entero.`);
  return numero;
}

function leerOpciones(argv: string[]): { ayuda: boolean; opciones: OpcionesCli } {
  const valores = new Map<string, string>();

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) throw new Error(`Argumento inesperado: ${arg}`);

    const igual = arg.indexOf("=");
    if (igual > 0) {
      valores.set(arg.slice(2, igual), arg.slice(igual + 1));
      continue;
    }

    const clave = arg.slice(2);
    if (clave === "ayuda" || clave === "help") {
      valores.set("ayuda", "1");
      continue;
    }

    const siguiente = argv[i + 1];
    if (siguiente === undefined || siguiente.startsWith("--")) {
      throw new Error(`--${clave} necesita un valor.`);
    }
    valores.set(clave, siguiente);
    i++;
  }

  const conocidas = [
    "ayuda",
    "cantidad",
    "desde",
    "estado",
    "tarifa",
    "lote",
    "patrocinante",
    "url",
    "salida",
  ];
  for (const clave of valores.keys()) {
    if (!conocidas.includes(clave)) throw new Error(`Opción desconocida: --${clave}.`);
  }

  const tarifa = entero(valores.get("tarifa"), "tarifa", 1);
  if (tarifa !== 1 && tarifa !== 2) {
    throw new Error("--tarifa debe ser 1 (general) o 2 (estudiante).");
  }

  const url = valores.get("url") ?? PORTAL_POR_DEFECTO;
  try {
    new URL(url);
  } catch {
    throw new Error("--url debe ser una dirección web completa (https://…).");
  }

  return {
    ayuda: valores.has("ayuda"),
    opciones: {
      cantidad: entero(valores.get("cantidad"), "cantidad", 10),
      desde: entero(valores.get("desde"), "desde", 1),
      estado: entero(valores.get("estado"), "estado", 23),
      tarifa,
      lote: entero(valores.get("lote"), "lote", 1),
      patrocinante: valores.get("patrocinante") ?? "",
      url,
      salida: valores.get("salida") ?? SALIDA_POR_DEFECTO,
    },
  };
}

function escaparHtml(texto: string): string {
  return texto.replace(
    /[&<>"]/g,
    (caracter) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[caracter] as string
  );
}

function svgBarras(codigo: string): string {
  return bwipjs.toSVG({
    bcid: "code128",
    text: codigo,
    scale: 2,
    height: 8,
    includetext: false,
    rotate: "R",
    paddingwidth: 4,
    paddingheight: 2,
  });
}

function svgQr(url: string): string {
  return bwipjs.toSVG({
    bcid: "qrcode",
    text: url,
    scale: 2,
    paddingwidth: 2,
    paddingheight: 2,
  });
}

function tarjetaHtml(lote: LoteGenerado, tarjeta: TarjetaLote, qr: string): string {
  const patrocinante = lote.patrocinante || "Edición institucional";
  const etiquetaTarifa = lote.tarifa === 2 ? "Estudiante" : "General";

  return `
        <article class="tarjeta">
          <div class="filo"></div>
          <div class="cuerpo">
            <div class="marca"><span class="logo">BLINK</span><span class="descriptor">TARJETA</span></div>
            <div class="serial">${tarjeta.serial}</div>
            <div class="meta"><span>Lote ${lote.numero}</span><span>Tarifa ${etiquetaTarifa}</span></div>
            <div class="patrocinante">${escaparHtml(patrocinante)}</div>
            <div class="uid">UID<span class="linea"></span></div>
          </div>
          <div class="qr">${qr}</div>
          <div class="barras">${svgBarras(tarjeta.barcode)}</div>
        </article>`;
}

const ESTILOS = `
  @page { size: A4; margin: 10mm; }
  * { box-sizing: border-box; }
  html { color-scheme: light; }
  body {
    margin: 0;
    padding: 10mm 0;
    background: #e9edf3;
    color: #101a2b;
    font-family: "Segoe UI", system-ui, -apple-system, Roboto, Arial, sans-serif;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .hoja {
    width: 190mm;
    margin: 0 auto 10mm;
    display: flex;
    flex-direction: column;
    gap: 3mm;
    break-after: page;
  }
  .hoja:last-child { break-after: auto; }
  .hoja-cabecera {
    width: 175.2mm;
    margin-inline: auto;
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 4mm;
    padding-bottom: 1mm;
    border-bottom: 0.3mm solid #0a4e93;
    font-size: 7.5pt;
    letter-spacing: 0.04em;
    color: #3a4a61;
  }
  .hoja-cabecera strong { color: #0a4e93; letter-spacing: 0.12em; }
  .hoja-cabecera .rango {
    font-family: ui-monospace, "DejaVu Sans Mono", "Courier New", monospace;
    font-size: 7.5pt;
  }
  .rejilla {
    display: grid;
    grid-template-columns: repeat(2, 85.6mm);
    gap: 3mm 4mm;
    justify-content: center;
  }
  .tarjeta {
    position: relative;
    width: 85.6mm;
    height: 53.98mm;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 13.5mm 13mm;
    gap: 2mm;
    padding: 3.2mm 3mm 2.6mm;
    background: #ffffff;
    outline: 0.2mm dashed #b9c4d4;
    overflow: hidden;
    break-inside: avoid;
  }
  .filo {
    position: absolute;
    inset: 0 0 auto 0;
    height: 2.4mm;
    background: linear-gradient(90deg, #0a4e93, #0b6fd4);
  }
  .cuerpo {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    min-width: 0;
  }
  .marca { display: flex; align-items: baseline; gap: 1.6mm; }
  .logo {
    font-size: 10pt;
    font-weight: 800;
    font-style: italic;
    letter-spacing: 0.06em;
    color: #0a4e93;
  }
  .descriptor {
    font-size: 6pt;
    font-weight: 600;
    letter-spacing: 0.34em;
    color: #5b6b82;
  }
  .serial {
    font-family: ui-monospace, "DejaVu Sans Mono", "Courier New", monospace;
    font-size: 12pt;
    font-weight: 700;
    letter-spacing: 0.03em;
    color: #101a2b;
    white-space: nowrap;
  }
  .meta {
    display: flex;
    gap: 2mm;
    font-size: 6pt;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #5b6b82;
  }
  .patrocinante {
    padding-top: 0.8mm;
    border-top: 0.2mm solid #dde3ec;
    font-size: 5.8pt;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #5b6b82;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .uid {
    display: flex;
    align-items: baseline;
    gap: 1.5mm;
    font-size: 5.4pt;
    letter-spacing: 0.12em;
    color: #8493a8;
  }
  .uid .linea {
    flex: 1;
    height: 3mm;
    border-bottom: 0.25mm solid #9aa8bb;
  }
  .qr { align-self: end; width: 13.5mm; height: 13.5mm; }
  .qr svg { width: 100%; height: 100%; display: block; }
  .barras { display: flex; align-items: center; justify-content: center; }
  .barras svg { height: 100%; width: auto; display: block; }
  .hoja-pie {
    width: 175.2mm;
    margin-inline: auto;
    display: flex;
    justify-content: space-between;
    gap: 4mm;
    font-size: 6.5pt;
    color: #6b7a90;
  }
  @media print {
    body { padding: 0; background: #ffffff; }
    .hoja { width: auto; margin: 0; }
    .tarjeta { outline-color: #c9d2df; }
  }
`;

function documento(lote: LoteGenerado, url: string): string {
  const qr = svgQr(url);
  const paginas = Math.ceil(lote.tarjetas.length / TARJETAS_POR_HOJA);
  const primero = lote.tarjetas[0].serial;
  const ultimo = lote.tarjetas[lote.tarjetas.length - 1].serial;
  const fecha = new Date().toISOString().slice(0, 10);

  const hojas: string[] = [];
  for (let pagina = 0; pagina < paginas; pagina++) {
    const trozo = lote.tarjetas.slice(
      pagina * TARJETAS_POR_HOJA,
      (pagina + 1) * TARJETAS_POR_HOJA
    );

    hojas.push(`
    <section class="hoja">
      <header class="hoja-cabecera">
        <span><strong>Blink Pay</strong> · datos variables del reverso</span>
        <span class="rango">${primero} → ${ultimo}</span>
        <span>Lote ${lote.numero} · ${lote.cantidad} tarjetas · hoja ${pagina + 1} de ${paginas}</span>
      </header>
      <div class="rejilla">${trozo.map((t) => tarjetaHtml(lote, t, qr)).join("")}
      </div>
      <footer class="hoja-pie">
        <span>Generado el ${fecha} · recorta por las guías punteadas.</span>
        <span>Valida el Code 128 con el lector antes de laminar.</span>
      </footer>
    </section>`);
  }

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>BLINK · Lote ${lote.numero} · ${lote.cantidad} tarjetas</title>
  <style>${ESTILOS}</style>
</head>
<body>
${hojas.join("\n")}
</body>
</html>
`;
}

function main(): void {
  let leidas: { ayuda: boolean; opciones: OpcionesCli };
  let lote: LoteGenerado;

  try {
    leidas = leerOpciones(process.argv.slice(2));
    if (leidas.ayuda) {
      console.log(AYUDA);
      return;
    }
    lote = generarLote(leidas.opciones);
  } catch (error) {
    console.error(`Error: ${(error as Error).message}\n`);
    console.error(AYUDA);
    process.exitCode = 1;
    return;
  }

  const carpeta = resolve(leidas.opciones.salida);
  mkdirSync(carpeta, { recursive: true });

  const base = `lote-${String(lote.numero).padStart(3, "0")}`;
  const rutaCsv = join(carpeta, `${base}.csv`);
  const rutaHtml = join(carpeta, `${base}.html`);

  writeFileSync(rutaCsv, csvLote(lote), "utf8");
  writeFileSync(rutaHtml, documento(lote, leidas.opciones.url), "utf8");

  const primero = lote.tarjetas[0].serial;
  const ultimo = lote.tarjetas[lote.tarjetas.length - 1].serial;
  const paginas = Math.ceil(lote.cantidad / TARJETAS_POR_HOJA);

  console.log(`Lote ${lote.numero}: ${lote.cantidad} tarjetas (${primero} → ${ultimo})`);
  console.log(`  CSV   ${rutaCsv}`);
  console.log(`  Hoja  ${rutaHtml} · ${paginas} página${paginas === 1 ? "" : "s"} A4`);
  console.log("Abre la hoja en el navegador y usa Ctrl+P para imprimir o guardar como PDF.");
}

main();
