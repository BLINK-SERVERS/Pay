// Rasteriza los iconos de Pay desde sus SVG maestros en `marca/`.
// Usa Chromium de Playwright para que el PNG coincida con el render del SVG.
// Si el navegador de Playwright no está descargado, se puede apuntar a uno
// del sistema con CHROMIUM_PATH=/usr/bin/chromium.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const MARCA = fileURLToPath(new URL("../marca", import.meta.url));
const PUB = fileURLToPath(new URL("../public", import.meta.url));

const JOBS = [
  { src: "blink-pay-icono-app.svg", out: "icon.png", size: 512 },
  { src: "blink-pay-icono-app.svg", out: "icon-192.png", size: 192 },
  { src: "blink-pay-icono-app.svg", out: "apple-touch-icon.png", size: 180 },
  { src: "blink-pay-icono-maskable.svg", out: "maskable-512.png", size: 512 },
  { src: "blink-pay-favicon.svg", out: "favicon.png", size: 32, transparent: true },
];

const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}
);
const page = await browser.newPage();

for (const job of JOBS) {
  const svg = fs.readFileSync(path.join(MARCA, job.src), "utf8");
  const fondo = job.transparent ? "transparent" : "#007AFF";
  const html = `<!doctype html><meta charset="utf-8">
<style>html,body{margin:0;padding:0;background:${fondo}}
svg{display:block;width:${job.size}px;height:${job.size}px}</style>${svg}`;
  await page.setViewportSize({ width: job.size, height: job.size });
  await page.setContent(html, { waitUntil: "load" });
  const dest = path.join(PUB, job.out);
  await page.screenshot({ path: dest, omitBackground: !!job.transparent });
  console.log(job.out, fs.statSync(dest).size, "bytes");
}

await browser.close();
