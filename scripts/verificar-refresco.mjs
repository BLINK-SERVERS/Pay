import { chromium } from "playwright-core";

/**
 * Verificación del hallazgo #159: el refresco forzado no puede servir una
 * lectura que nació antes del dinero que acaba de moverse.
 *
 * La carrera es real y aparece sin buscarla: `refrescar()` viaja cuando se toca
 * una pestaña fuera de la ventana de vigencia o cuando la app vuelve a primer
 * plano, y mientras esa respuesta va por la red el pasajero alcanza a terminar
 * una transferencia. `refrescar(true)` devolvía la tarea en vuelo —el fotograma
 * anterior a la escritura— y el `await` de la pantalla se daba por satisfecho:
 * la tarjeta seguía mostrando el saldo de siempre.
 *
 * El arnés fabrica la colisión: intercepta `bt_sesion` y `bt_movimientos`,
 * reenvía la lectura al servidor al instante pero **retiene la respuesta**, así
 * que lo que aterriza en el portal es un estado caduco por construcción. Con el
 * arreglo el portal espera a que cierre la lectura vieja y vuelve a leer; con el
 * código de HEAD se queda con el saldo viejo y la prueba revienta en «el portal
 * volvió a leer después de escribir» (control negativo).
 *
 * Requiere el portal contra la simulación:
 *   cd simulacion && ./arrancar.sh && node flujo.mjs && ./portal.sh
 *   BLINK_URL=http://127.0.0.1:5175/ node scripts/verificar-refresco.mjs
 *
 * Deja una transferencia de prueba en la base (Ana → su segunda tarjeta); para
 * volver al estado inicial, `simulacion/arrancar.sh`.
 */

const BASE = process.env.BLINK_URL ?? "http://127.0.0.1:5175/";
const CEDULA = process.env.BLINK_CEDULA ?? "20123456";
const PIN = process.env.BLINK_PIN ?? "258036";
const MONTO = Number(process.env.BLINK_MONTO ?? 100);
const LECTURAS = ["/rpc/bt_sesion", "/rpc/bt_movimientos"];
// Espejo de VIGENCIA_REFRESCO (src/App.tsx): hay que dejarla vencer para que
// tocar una pestaña dispare de verdad la lectura que se quiere tomar en vuelo.
const VIGENCIA = 10_000;

const navegador = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

function revisar(etiqueta, valor, correcto) {
  if (!correcto) throw new Error(`✗ ${etiqueta}: ${JSON.stringify(valor)}`);
  console.log(`  ✓ ${etiqueta} = ${JSON.stringify(valor)}`);
}

/** «Bs 9.000,50» → 900050 centavos; `null` si el texto no trae cifra. */
function aCentavos(texto) {
  const m = /Bs\s*([\d.]+(?:,\d{1,2})?)/.exec(texto ?? "");
  return m ? Math.round(Number(m[1].replace(/\./g, "").replace(",", ".")) * 100) : null;
}

/** Cabeceras reenviables: caen las de transporte, que pone Node solo. */
function cabeceras(peticion) {
  const saltan = new Set([
    "host",
    "content-length",
    "connection",
    "accept-encoding",
    "cookie",
  ]);
  return Object.fromEntries(
    Object.entries(peticion.headers()).filter(([nombre]) => !saltan.has(nombre))
  );
}

const registro = [];
const enRetencion = [];
let retener = false;

async function interceptar(ruta) {
  const peticion = ruta.request();
  const url = peticion.url();
  if (peticion.method() !== "POST" || !LECTURAS.some((final) => url.endsWith(final))) {
    return ruta.continue();
  }
  const entrada = {
    rpc: url.slice(url.lastIndexOf("/") + 1),
    salida: Date.now(),
    retenida: retener,
    entregada: null,
  };
  registro.push(entrada);
  if (!retener) return ruta.continue();
  // Se reenvía ahora y se entrega tarde: la respuesta es el estado del momento
  // de la salida, que es lo que hace que llegue caduca.
  const reenvio = fetch(url, {
    method: "POST",
    headers: cabeceras(peticion),
    body: peticion.postData(),
  });
  enRetencion.push({ ruta, reenvio, entrada });
}

const contexto = await navegador.newContext({
  viewport: { width: 393, height: 852 },
  colorScheme: "light",
  hasTouch: true,
});
const pagina = await contexto.newPage();
await pagina.route("**/rest/v1/rpc/**", (ruta) => interceptar(ruta));

const saldoEnTarjeta = () =>
  pagina.locator(".tarjeta__saldo").first().textContent().then(aCentavos);

async function esperar(condicion, ms, etiqueta) {
  const fin = Date.now() + ms;
  while (Date.now() < fin) {
    if (await condicion()) return;
    await pagina.waitForTimeout(100);
  }
  throw new Error(`no se cumplió: ${etiqueta} (${JSON.stringify(registro)})`);
}

try {
  // ------------------------------------------- 1. entrar y dejar que aterrice todo
  await pagina.goto(BASE, { waitUntil: "networkidle" });
  await pagina.waitForSelector(".lp-hero__cta", { timeout: 20000 });
  await pagina.locator(".lp-hero__cta .lp-boton--fantasma").click();
  await pagina.waitForSelector(".acceso__panel", { timeout: 20000 });
  await pagina.fill("#cedula", CEDULA);
  await pagina.fill('input[aria-label="PIN de acceso"]', PIN);
  await pagina.waitForSelector(".tarjeta__saldo", { timeout: 20000 });
  await pagina.waitForTimeout(400);
  console.log(`  · saldo al entrar: ${(await saldoEnTarjeta()) / 100} Bs`);

  // -------------------------- 2. vencer la vigencia y tomar el refresco en vuelo
  retener = true;
  await pagina.waitForTimeout(VIGENCIA + 800);
  await pagina.locator(".tabs__item", { hasText: /movimientos/i }).click();
  await esperar(() => registro.length >= 2, 8000, "las dos lecturas del refresco");

  // Con la lectura en camino, tocar otra pestaña no dispara una segunda.
  const enVuelo = registro.length;
  await pagina.locator(".tabs__item", { hasText: /transferir/i }).click();
  await pagina.waitForSelector("#tr-monto", { timeout: 20000 });
  revisar(
    "tocar otra pestaña no duplica la lectura en vuelo",
    registro.length,
    registro.length === enVuelo
  );

  // ------------------------------ 3. transferir mientras esa lectura sigue en el aire
  const origenes = pagina.locator('[role="group"][aria-label="Tarjeta de origen"] button');
  const activa = origenes.locator('[aria-pressed="true"]');
  let saldoOrigen = aCentavos(
    await (await activa.count() ? activa.first() : origenes.first()).textContent()
  );
  if (saldoOrigen === null || saldoOrigen < MONTO * 100) {
    let mejor = -1;
    let indice = 0;
    for (let i = 0; i < (await origenes.count()); i += 1) {
      const valor = aCentavos(await origenes.nth(i).textContent());
      if (valor !== null && valor > mejor) {
        mejor = valor;
        indice = i;
      }
    }
    await origenes.nth(indice).click();
    saldoOrigen = mejor;
  }
  await pagina
    .locator('[role="group"][aria-label="Tus otras tarjetas"] button:not([disabled])')
    .first()
    .click();
  await pagina.fill("#tr-monto", String(MONTO));
  await pagina.fill('input[aria-label="PIN de 6 dígitos para transferir"]', PIN);

  await pagina.locator('button[type="submit"]').click();
  await pagina.waitForSelector('button[type="submit"]:has-text("Confirmar")', {
    timeout: 20000,
  });
  const antesDeEscribir = registro.length;
  const esperando = pagina.waitForResponse(
    (r) => r.url().endsWith("/rpc/bt_transferir_saldo"),
    { timeout: 20000 }
  );
  const escritura = Date.now();
  await pagina.locator('button[type="submit"]').click();
  const confirmada = await (await esperando).json();
  revisar("transferencia aceptada por el servidor", confirmada?.transferencia?.monto, MONTO);
  revisar(
    "la escritura encontró el refresco todavía en vuelo",
    { enVuelo, registro: registro.length },
    enVuelo >= 2 && registro.length === antesDeEscribir
  );

  // ------------------------------------------------- 4. soltar el fotograma caduco
  retener = false;
  for (const { ruta, reenvio, entrada } of enRetencion) {
    const respuesta = await reenvio;
    const cuerpo = await respuesta.text();
    entrada.entregada = Date.now();
    await ruta.fulfill({
      status: respuesta.status,
      headers: Object.fromEntries(
        [...respuesta.headers].filter(
          ([nombre]) => !["content-encoding", "content-length"].includes(nombre)
        )
      ),
      body: cuerpo,
    });
  }
  const retenida = registro.find((r) => r.retenida);
  revisar(
    "la lectura retenida salió antes de escribir y llegó después",
    { salida: retenida?.salida, escritura, entregada: retenida?.entregada },
    Boolean(retenida) && retenida.salida < escritura && retenida.entregada >= escritura
  );

  await pagina.waitForTimeout(2500);
  const posteriores = registro.filter((r) => r.salida >= escritura).length;
  revisar("el portal volvió a leer después de escribir", posteriores, posteriores >= 1);
  revisar(
    "una sola lectura extra, sin tormenta",
    registro.length,
    registro.length <= antesDeEscribir + 2
  );

  await pagina.locator(".tabs__item", { hasText: /inicio/i }).click();
  await pagina.waitForSelector(".tarjeta__saldo", { timeout: 20000 });
  const despues = await saldoEnTarjeta();

  revisar(
    "saldo tras la transferencia",
    {
      antes: saldoOrigen / 100,
      pantalla: despues / 100,
      esperado: (saldoOrigen - MONTO * 100) / 100,
    },
    despues === saldoOrigen - MONTO * 100
  );

  console.log("\nRefresco forzado: espera la lectura en vuelo y vuelve a leer.");
} finally {
  await navegador.close().catch(() => {});
}
