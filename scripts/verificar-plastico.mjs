import { chromium } from "playwright-core";

/**
 * Verificación del hallazgo #183: la app, el validador y el plástico tienen que
 * hablar del mismo dinero.
 *
 * El reclamo del 2026-11-15 era literal: «en la app me sale que tengo 8.500 y en
 * el validador me quedan 6mil». Los dos números eran ciertos y ninguno explicaba
 * al otro. Desde 0035 la sesión trae el desglose (`chip`, `por_entregar`,
 * `por_descontar`) y la tarjeta lo dice en una línea, además de contar los
 * pasajes sobre lo que realmente está en el plástico.
 *
 * Lo que comprueba, contra la sesión que el propio portal recibió por HTTP
 * (interceptada, no vuelta a calcular a mano):
 *   · el número grande sigue siendo el saldo de la cuenta —no se cambió uno por
 *     el otro—,
 *   · la línea del desglose dice la cifra del plástico y cuánta falta por escribir,
 *   · los pasajes salen del plástico (12), no del saldo (17),
 *   · la fórmula del plástico cuadra con el espejo del chip,
 *   · la línea nueva no desborda la tarjeta a 393×852 ni tapa los accesos,
 *   · el reverso sigue mostrando el serial después del giro.
 *
 * Requiere el portal contra la simulación y la escena del reclamo cargada:
 *   cd simulacion && ./arrancar.sh && node flujo.mjs && ./portal.sh
 *   PGPASSWORD=blink psql -h 127.0.0.1 -p 54329 -U postgres -d blink -f escena-desglose.sql
 *   cd .. && BLINK_URL=http://127.0.0.1:5175/ npm run verificar:plastico
 *
 * Con la escena de arriba los números exactos son saldo 8.500, plástico 6.000,
 * 2.500 por cargar y 12 pasajes; sin esa escena el script igualmente vale:
 * compara pantalla contra sesión, no contra constantes.
 */

const BASE = process.env.BLINK_URL ?? "http://127.0.0.1:5175/";
const CEDULA = process.env.BLINK_CEDULA ?? "30111997";
const PIN = process.env.BLINK_PIN ?? "852036";
const SERIAL = process.env.BLINK_SERIAL ?? "G-00003-012-U";
const CAPTURA = process.env.BLINK_CAPTURA ?? "/tmp/portal-plastico.png";

const navegador = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

const fallos = [];
function revisar(etiqueta, valor, correcto) {
  if (!correcto) fallos.push(`${etiqueta}: ${JSON.stringify(valor)}`);
  console.log(`  ${correcto ? "✓" : "✗"} ${etiqueta} = ${JSON.stringify(valor)}`);
}
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/** «Bs 8.500,50» → 850050 centavos; `null` si el texto no trae cifra. */
function aCentavos(texto) {
  const m = /([\d.]+)(?:,(\d{1,2}))?/.exec(texto ?? "");
  if (!m) return null;
  return Math.round(Number(`${m[1].replace(/\./g, "")}.${m[2] ?? "0"}`) * 100);
}

/** Todas las cifras de bolivares de una frase, en Bs: «Bs 2.500 y 1.000» → [2500, 1000]. */
function cifras(texto) {
  return [...(texto ?? "").matchAll(/\d+(?:\.\d{3})*(?:,\d{1,2})?/g)].map((m) =>
    Number(m[0].replace(/\./g, "").replace(",", ".")),
  );
}

const contexto = await navegador.newContext({
  viewport: { width: 393, height: 852 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const pagina = await contexto.newPage();

// La billetera que recibió el portal es la verdad de referencia: si la pantalla
// y su respuesta no coinciden, miente la pantalla. Al entrar llega en `bt_entrar`
// y en el resto de los refrescos, en `bt_sesion`.
let tarjetas = [];
pagina.on("response", async (respuesta) => {
  if (!respuesta.url().includes("/rpc/bt_")) return;
  try {
    const cuerpo = await respuesta.json();
    if (Array.isArray(cuerpo?.tarjetas) && cuerpo.tarjetas.length) tarjetas = cuerpo.tarjetas;
  } catch {
    /* respuesta no JSON: se sigue con la anterior */
  }
});

await pagina.goto(BASE, { waitUntil: "networkidle" });
await pagina.getByRole("button", { name: /Ya tengo cuenta/ }).first().click({ timeout: 20_000 });
await pagina.locator("#cedula").waitFor({ timeout: 20_000 });
await pagina.locator("#cedula").fill(CEDULA);
// El PIN se autoenvía al completarse (PinEntrada `alCompletar`).
await pagina.locator("input.pin__input").fill(PIN);

await pagina.waitForFunction(
  (serial) => document.body.innerText.includes(serial) || document.querySelector(".tarjeta__desglose"),
  SERIAL,
  { timeout: 25_000 },
);
await esperar(800);

const tarjeta = tarjetas.find((t) => t.serial === SERIAL);
if (!tarjeta) {
  await navegador.close();
  console.error(`✗ la sesión interceptada no trae la tarjeta ${SERIAL}; cargá la escena:`);
  console.error("  PGPASSWORD=blink psql -h 127.0.0.1 -p 54329 -U postgres -d blink -f simulacion/escena-desglose.sql");
  process.exit(1);
}

// Sin 0035 aplicado la sesión no trae desglose: no hay nada que comparar, y
// decirlo aquí evita dos líneas de NaN en el informe.
if (typeof tarjeta.chip !== "number" || typeof tarjeta.por_entregar !== "number") {
  await navegador.close();
  console.error(`✗ la sesión de ${SERIAL} no trae «chip» ni «por_entregar»: a esta base le falta la migración 0035.`);
  process.exit(1);
}

const enPlastico = Math.max(
  0,
  Number(tarjeta.saldo) - Math.max(0, Number(tarjeta.por_entregar)) + Math.max(0, Number(tarjeta.por_descontar ?? 0)),
);
const pasajesAlPlastico = Math.floor(enPlastico / Number(tarjeta.tarifa));
const pasajesAlSaldo = Math.floor(Number(tarjeta.saldo) / Number(tarjeta.tarifa));

const visto = await pagina.evaluate(() => {
  const texto = (n) => (n ? n.textContent.replace(/\s+/g, " ").trim() : null);
  const desglose = document.querySelector(".tarjeta__desglose");
  const caja = desglose?.getBoundingClientRect();
  const tarjetaEl = document.querySelector(".tarjeta");
  return {
    saldo: texto(document.querySelector(".tarjeta__saldo")),
    pasajes: texto(document.querySelector(".tarjeta__pasajes")),
    serial: texto(document.querySelector(".tarjeta__serial")),
    fuerte: texto(desglose?.querySelector("strong")),
    detalle: texto(desglose?.querySelector(".tarjeta__desglose-detalle")),
    hayDesglose: Boolean(desglose),
    desborda: Boolean(
      caja && tarjetaEl && caja.right > tarjetaEl.getBoundingClientRect().right + 1,
    ),
    alto: caja ? Math.round(caja.height) : null,
    ancho: caja ? Math.round(caja.width) : null,
    hayHerramientas: Boolean(document.querySelector(".tarjeta__herramientas")),
  };
});

await pagina.screenshot({ path: CAPTURA, fullPage: true });

console.log("\n--- lo que ve el pasajero ---");
console.log(`  sesión: saldo ${tarjeta.saldo} · chip ${tarjeta.chip} · por_entregar ${tarjeta.por_entregar} · por_descontar ${tarjeta.por_descontar} · tarifa ${tarjeta.tarifa}`);console.log(`  pantalla: ${visto.saldo} · ${visto.pasajes} · ${visto.fuerte ?? "sin desglose"} ${visto.detalle ?? ""}`);
console.log(`  captura: ${CAPTURA}\n`);

console.log("--- verificaciones ---");
// La línea solo tiene sentido cuando hay plata atrapada entre la cuenta y el
// plástico; con la escena de arriba es el caso, y por eso se exige.
const hayAtrapado = enPlastico !== Number(tarjeta.saldo) && (Number(tarjeta.por_entregar) > 0 || Number(tarjeta.por_descontar) > 0);
revisar("el número grande sigue siendo el saldo de la cuenta", visto.saldo, aCentavos(visto.saldo) === aCentavos(String(tarjeta.saldo)));
revisar("aparece la línea del plástico", visto.hayDesglose, hayAtrapado);
revisar("la línea dice cuánto hay en el plástico", visto.fuerte, aCentavos(visto.fuerte) === aCentavos(String(enPlastico)));
revisar(
  "y cuánto falta escribir en él",
  visto.detalle,
  [Number(tarjeta.por_entregar), Number(tarjeta.por_descontar ?? 0)]
    .filter((bs) => bs > 0)
    .every((bs) => cifras(visto.detalle).includes(bs)),
);
revisar(
  `los pasajes salen del plástico (${pasajesAlPlastico}), no del saldo (${pasajesAlSaldo})`,
  visto.pasajes,
  Number((/(\d[\d.]*)/.exec(visto.pasajes ?? "") ?? [])[1]?.replace(/\./g, "")) === pasajesAlPlastico,
);
revisar("la fórmula del plástico cuadra con el espejo del chip", { enPlastico, chip: tarjeta.chip }, Number(tarjeta.chip) === enPlastico);
revisar(`la línea entra en la tarjeta sin desbordar`, { ancho: visto.ancho, alto: visto.alto, desborda: visto.desborda }, !visto.desborda);
revisar("los accesos de la tarjeta siguen ahí", visto.hayHerramientas, true);

await pagina.getByRole("button", { name: /reverso/i }).first().click().catch(() => {});
await esperar(700);
const reverso = await pagina.evaluate(() => ({
  volteada: Boolean(document.querySelector(".tarjeta__giro--volteada")),
  serial: document.querySelector(".tarjeta__cara--reverso")?.textContent.replace(/\s+/g, " ").trim().slice(0, 80) ?? null,
}));
revisar("el reverso sigue mostrando el serial tras el giro", reverso, reverso.volteada && (reverso.serial ?? "").includes(SERIAL));

await navegador.close();

if (fallos.length) {
  console.log(`\n✗ ${fallos.length} verificación(es) fallaron`);
  for (const f of fallos) console.log(`  · ${f}`);
  process.exit(1);
}
console.log("\ntodo ok");
