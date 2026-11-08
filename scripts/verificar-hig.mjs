import { chromium } from "playwright-core";
import { mkdir } from "node:fs/promises";

/**
 * Verificación visual y estructural del rediseño HIG.
 *
 * Usa el Chromium del sistema (no descarga navegadores) y comprueba,
 * en 393×852 y 1440×900, con apariencia clara y oscura:
 *   · que no haya desbordamiento horizontal ni saltos de maqueta,
 *   · que la landing de `/` no desborde, respete los 44 pt y abra el acceso,
 *   · que el acceso pida solo dígitos y no muestre la tarjeta,
 *   · que el frente de la tarjeta solo lleve saldo, pasajes y titular,
 *   · que todos los iconos sean SF Symbols,
 *   · la pila tipográfica y las cifras tabulares,
 *   · los objetivos táctiles de 44 pt y el material translúcido,
 *   · la disposición iPhone (pestañas) o macOS (barra lateral/inspector).
 */

const BASE = process.env.BLINK_URL ?? "http://127.0.0.1:5175/";
const SALIDA = process.env.BLINK_CAPTURAS ?? "/tmp/blink-hig";
const PIN_DEMO = "194628";
const CEDULA_DEMO = "12345678";

const CLS = `
  window.__cls = 0;
  new PerformanceObserver((lista) => {
    for (const entrada of lista.getEntries()) {
      if (!entrada.hadRecentInput) window.__cls += entrada.value;
    }
  }).observe({ type: "layout-shift", buffered: true });
`;

await mkdir(SALIDA, { recursive: true });

const navegador = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

// La raíz ya no es el acceso: es la landing de pay.blink.com.ve. Entrar
// siempre pasa por ella, así que las medidas del acceso se toman después
// de pulsar «Ya tengo cuenta», que es el camino real del usuario.
async function abrirAcceso(pagina) {
  await pagina.waitForSelector(".lp-hero__cta", { timeout: 20000 });
  await pagina.locator(".lp-hero__cta .lp-boton--fantasma").click();
  await pagina.waitForSelector(".acceso__panel", { timeout: 20000 });
}

async function iniciarSesion() {
  const contexto = await navegador.newContext({
    viewport: { width: 393, height: 852 },
    colorScheme: "light",
    hasTouch: true,
  });
  const pagina = await contexto.newPage();
  await pagina.goto(BASE, { waitUntil: "networkidle" });
  await abrirAcceso(pagina);
  await pagina.fill("#cedula", CEDULA_DEMO);
  await pagina.fill('input[aria-label="PIN de acceso"]', PIN_DEMO);
  await pagina.waitForSelector(".app__main", { timeout: 20000 });
  const estado = await contexto.storageState();
  await contexto.close();
  return estado;
}

function revisar(etiqueta, valor, correcto) {
  if (!correcto) throw new Error(`${etiqueta}: ${JSON.stringify(valor)}`);
  console.log(`  ✓ ${etiqueta}`);
}

// Landing: la puerta de entrada. Se mide entera, no solo el primer pliegue.
for (const ancho of [393, 1440]) {
  for (const esquema of ["light", "dark"]) {
    const movil = ancho < 768;
    const contexto = await navegador.newContext({
      viewport: { width: ancho, height: movil ? 852 : 900 },
      colorScheme: esquema,
      hasTouch: movil,
    });
    await contexto.addInitScript(CLS);
    const pagina = await contexto.newPage();
    await pagina.goto(BASE, { waitUntil: "networkidle" });
    await pagina.waitForSelector(".lp-hero__marca svg");
    await pagina.waitForTimeout(400);
    console.log(`\nlanding ${ancho}px · ${esquema}`);

    const datos = await pagina.evaluate(() => {
      const selectores = [
        ".lp-boton",
        ".lp-enlace",
        ".lp-acordeon__boton",
        ".lp-nav__enlaces a",
        ".lp-nav__titulo",
      ];
      const objetivos = selectores.flatMap((selector) =>
        [...document.querySelectorAll(selector)]
          .filter((el) => el.getBoundingClientRect().width > 0)
          .map((el) => ({ selector, alto: Math.round(el.getBoundingClientRect().height) }))
      );
      const iconos = [...document.querySelectorAll("svg.icon")];
      // Se recorre la página entera: el desbordamiento puede estar al final.
      const pasos = [0, 0.25, 0.5, 0.75, 1].map((fraccion) => {
        window.scrollTo(0, (document.documentElement.scrollHeight - window.innerHeight) * fraccion);
        return document.documentElement.scrollWidth - window.innerWidth;
      });
      window.scrollTo(0, 0);
      return {
        desborde: Math.max(...pasos),
        cls: window.__cls,
        objetivos,
        iconos: iconos.length,
        sf: iconos.filter((svg) => svg.hasAttribute("data-variante")).length,
        fuente: getComputedStyle(document.querySelector(".lp")).fontFamily,
        marca: Boolean(document.querySelector(".lp-hero__marca svg")),
        ondas: document.querySelectorAll(".lp-onda").length,
        beneficios: document.querySelectorAll(".lp-beneficio").length,
        preguntas: document.querySelectorAll(".lp-acordeon__item").length,
        notas: document.querySelectorAll(".lp-notas__lista li").length,
        dominios: document.body.innerText.includes("pay.blink.com.ve"),
        maracaibo: document.body.innerText.includes("Maracaibo"),
      };
    });

    revisar("sin desbordamiento en toda la página", datos.desborde, datos.desborde <= 1);
    revisar("sin saltos de maqueta (CLS < 0,02)", datos.cls, datos.cls < 0.02);
    revisar(
      "objetivos táctiles ≥ 44 px",
      datos.objetivos.filter((o) => o.alto < 44),
      datos.objetivos.length > 0 && datos.objetivos.every((o) => o.alto >= 44)
    );
    revisar(
      "todos los iconos son SF Symbols",
      `${datos.sf}/${datos.iconos}`,
      datos.iconos > 0 && datos.sf === datos.iconos
    );
    revisar("pila tipográfica SF Pro/Inter", datos.fuente, /SF Pro|Inter/.test(datos.fuente));
    revisar("lockup aprobado en el hero", datos.marca, datos.marca);
    revisar("tres ondas de marca en el glifo inline", datos.ondas, datos.ondas >= 3);
    revisar("cuatro beneficios como la referencia", datos.beneficios, datos.beneficios === 4);
    revisar("acordeón de preguntas presente", datos.preguntas, datos.preguntas >= 6);
    revisar("notas al pie numeradas", datos.notas, datos.notas === 5);
    revisar("el copy nombra el dominio", datos.dominios, datos.dominios);
    revisar("el copy nombra Maracaibo", datos.maracaibo, datos.maracaibo);

    await pagina.screenshot({ path: `${SALIDA}/landing-${ancho}-${esquema}.png`, fullPage: true });

    // El acordeón abre una sola pregunta y la cierra al volver a pulsar.
    const primera = pagina.locator(".lp-acordeon__boton").first();
    await primera.scrollIntoViewIfNeeded();
    await primera.click();
    await pagina.waitForTimeout(400);
    const acordeon = await pagina.evaluate(() => {
      const abiertos = [...document.querySelectorAll(".lp-acordeon__boton")].filter(
        (boton) => boton.getAttribute("aria-expanded") === "true"
      );
      const bandeja = document.querySelector(".lp-acordeon__item--abierto .lp-acordeon__bandeja");
      return {
        abiertos: abiertos.length,
        alto: Math.round(bandeja?.getBoundingClientRect().height ?? 0),
        region: bandeja?.getAttribute("role"),
      };
    });
    revisar("el acordeón abre una sola pregunta", acordeon.abiertos, acordeon.abiertos === 1);
    revisar("la bandeja abierta tiene altura", acordeon.alto, acordeon.alto > 40);
    revisar("la bandeja es una región etiquetada", acordeon.region, acordeon.region === "region");
    await pagina.screenshot({
      path: `${SALIDA}/landing-preguntas-${ancho}-${esquema}.png`,
      fullPage: false,
    });
    await primera.click();
    await pagina.waitForTimeout(400);
    const cerradas = await pagina.locator(".lp-acordeon__item--abierto").count();
    revisar("el acordeón se cierra al volver a pulsar", cerradas, cerradas === 0);

    // «Ya tengo cuenta» lleva al acceso y deja la página arriba.
    await pagina.locator(".lp-hero__cta .lp-boton--fantasma").click();
    await pagina.waitForSelector(".acceso__panel");
    await pagina.waitForTimeout(350);
    const salto = await pagina.evaluate(() => ({
      hash: window.location.hash,
      arriba: window.scrollY,
      cedula: Boolean(document.querySelector("#cedula")),
      landing: Boolean(document.querySelector(".lp")),
    }));
    revisar("el CTA abre el acceso en #entrar", salto.hash, salto.hash === "#entrar");
    revisar("el acceso arranca arriba", salto.arriba, salto.arriba === 0);
    revisar("el formulario de cédula está presente", salto.cedula, salto.cedula);
    revisar("la landing se desmonta", salto.landing, !salto.landing);

    // «Volver» devuelve a la puerta de entrada y limpia la URL.
    await pagina.locator(".acceso__volver").click();
    await pagina.waitForSelector(".lp-hero__marca svg");
    await pagina.waitForTimeout(300);
    const vuelta = await pagina.evaluate(() => ({
      hash: window.location.hash,
      landing: Boolean(document.querySelector(".lp")),
      acceso: Boolean(document.querySelector(".acceso__panel")),
    }));
    revisar("volver deja la URL en la raíz", vuelta.hash, vuelta.hash === "");
    revisar("volver pinta la landing", vuelta.landing, vuelta.landing);
    revisar("volver desmonta el acceso", vuelta.acceso, !vuelta.acceso);

    // «Configura tu tarjeta» abre el alta, no el login.
    await pagina.locator(".lp-hero__cta .lp-boton--primario").click();
    await pagina.waitForSelector(".acceso__panel");
    await pagina.waitForTimeout(300);
    const alta = await pagina.evaluate(() => ({
      hash: window.location.hash,
      crear: document.querySelector('.segmentado__opcion[aria-selected="true"]')?.textContent ?? "",
    }));
    revisar("configurar abre #registro", alta.hash, alta.hash === "#registro");
    revisar("configurar selecciona Crear cuenta", alta.crear.trim(), alta.crear.trim() === "Crear cuenta");
    await pagina.screenshot({
      path: `${SALIDA}/landing-registro-${ancho}-${esquema}.png`,
      fullPage: false,
    });

    await contexto.close();
  }
}

// Pantalla de acceso, sin sesión: debe respirar igual en iPhone y macOS.
for (const ancho of [393, 1440]) {
  for (const esquema of ["light", "dark"]) {
    const movil = ancho < 768;
    const contexto = await navegador.newContext({
      viewport: { width: ancho, height: movil ? 852 : 900 },
      colorScheme: esquema,
      hasTouch: movil,
    });
    await contexto.addInitScript(CLS);
    const pagina = await contexto.newPage();
    await pagina.goto(new URL("#entrar", BASE).href, { waitUntil: "networkidle" });
    // El enlace profundo monta el acceso sin pintar la landing: así el CLS
    // mide esta pantalla y no la navegación entre las dos.
    // En producción el paquete compilado puede montar un fotograma después;
    // esperar al panel evita medir una pantalla todavía vacía.
    await pagina.waitForSelector(".acceso__panel");
    await pagina.waitForFunction(
      () => (document.querySelector(".acceso__panel")?.getBoundingClientRect().width ?? 0) > 0
    );
    await pagina.waitForTimeout(300);
    console.log(`\nacceso ${ancho}px · ${esquema}`);
    const datos = await pagina.evaluate(() => {
      const panel = document.querySelector(".acceso__panel");
      const fondo = document.querySelector(".acceso__fondo");
      const cedula = document.querySelector("#cedula");
      return {
        desborde: document.documentElement.scrollWidth - window.innerWidth,
        cls: window.__cls,
        panel: panel ? Math.round(panel.getBoundingClientRect().width) : 0,
        fondo: fondo ? Math.round(fondo.getBoundingClientRect().width) : 0,
        tarjetaEnAcceso: Boolean(document.querySelector(".acceso img")),
        teclado: cedula?.getAttribute("inputmode"),
        maxCedula: cedula?.getAttribute("maxlength"),
        prefijo: Boolean(document.querySelector(".entrada--tipo")),
      };
    });
    revisar("sin desbordamiento horizontal", datos.desborde, datos.desborde <= 1);
    revisar("sin saltos de maqueta (CLS < 0,02)", datos.cls, datos.cls < 0.02);
    revisar("panel de acceso presente", datos.panel, datos.panel > 280);
    revisar("fondo a todo el ancho", datos.fondo, datos.fondo === ancho);
    revisar("sin tarjeta en el acceso", datos.tarjetaEnAcceso, !datos.tarjetaEnAcceso);
    revisar("cédula con teclado numérico", datos.teclado, datos.teclado === "numeric");
    revisar("cédula de hasta 8 dígitos", datos.maxCedula, datos.maxCedula === "8");
    revisar("sin selector V/E", datos.prefijo, !datos.prefijo);
    await pagina.screenshot({ path: `${SALIDA}/acceso-${ancho}-${esquema}.png` });
    await contexto.close();
  }
}

const estado = await iniciarSesion();

for (const ancho of [393, 1440]) {
  for (const esquema of ["light", "dark"]) {
    const movil = ancho < 768;
    const contexto = await navegador.newContext({
      viewport: { width: ancho, height: movil ? 852 : 900 },
      colorScheme: esquema,
      hasTouch: movil,
      storageState: estado,
    });
    await contexto.addInitScript(CLS);
    const pagina = await contexto.newPage();
    await pagina.goto(BASE, { waitUntil: "networkidle" });
    await pagina.waitForSelector(".app__main");
    // La tarjeta vive en un trozo diferido: esperarla evita medir un inicio
    // todavía sin plástico (el saldo saldría vacío y tabular-nums también).
    await pagina.waitForSelector(".tarjeta__saldo", { timeout: 20000 });
    await pagina.waitForTimeout(400);

    console.log(`\n${ancho}px · ${esquema}`);

    const datos = await pagina.evaluate(() => {
      const visible = (selector) => {
        const el = document.querySelector(selector);
        return Boolean(el && el.getBoundingClientRect().width > 0);
      };
      const iconos = [...document.querySelectorAll("svg.icon")];
      const sf = iconos.filter((svg) => svg.hasAttribute("data-variante"));
      const saldo = document.querySelector(".tarjeta__saldo");
      const anverso = document.querySelector(".tarjeta__cara--anverso");
      const tabs = document.querySelector(".tabs");
      return {
        desborde: document.documentElement.scrollWidth - window.innerWidth,
        cls: window.__cls,
        iconos: iconos.length,
        sf: sf.length,
        fuente: getComputedStyle(document.body).fontFamily,
        tabular: saldo ? getComputedStyle(saldo).fontVariantNumeric : "",
        tabulares: [".tarjeta__saldo", ".movimiento__monto--entra", ".inspector__saldo"]
          .map((sel) => document.querySelector(sel))
          .filter(Boolean)
          .map((el) => getComputedStyle(el).fontVariantNumeric),
        material: tabs ? getComputedStyle(tabs).backdropFilter : "",
        tabsVisibles: visible(".tabs"),
        lateralVisible: visible(".barra-lateral"),
        inspectorVisible: visible(".inspector"),
        objetivos: [...document.querySelectorAll(".tabs__item")].map(
          (el) => Math.round(el.getBoundingClientRect().height)
        ),
        barraSuperior: Boolean(document.querySelector(".barra-sup")),
        mosaicos: document.querySelectorAll(".tile, .accion, .pie-marca").length,
        frente: anverso?.innerText ?? "",
        serialEnFrente: Boolean(anverso?.querySelector(".tarjeta__serial")),
        serialEnInspector: Boolean(document.querySelector(".inspector")?.innerText.includes("G-")),
      };
    });

    revisar("sin desbordamiento horizontal", datos.desborde, datos.desborde <= 1);
    revisar("sin saltos de maqueta (CLS < 0,02)", datos.cls, datos.cls < 0.02);
    revisar("todos los iconos son SF Symbols", `${datos.sf}/${datos.iconos}`, datos.iconos > 0 && datos.sf === datos.iconos);
    revisar("pila tipográfica SF Pro/Inter", datos.fuente, /SF Pro|Inter/.test(datos.fuente));
    revisar("cifras tabulares en el saldo", datos.tabular, datos.tabular.includes("tabular-nums"));
    revisar(
      "cifras tabulares en importes y totales",
      datos.tabulares,
      datos.tabulares.length > 0 && datos.tabulares.every((valor) => valor.includes("tabular-nums"))
    );
    revisar("material translúcido en la barra", datos.material, /blur\(24px\)/.test(datos.material));
    revisar("sin barra superior flotante", datos.barraSuperior, !datos.barraSuperior);
    revisar("sin mosaicos ni pie de marca", datos.mosaicos, datos.mosaicos === 0);
    revisar(
      "frente de la tarjeta: saldo, pasajes y titular",
      datos.frente,
      /^Bs/.test(datos.frente) && /pasaje/.test(datos.frente) && /[A-ZÁÉÍÓÚÑ]/.test(datos.frente)
    );
    revisar("serial solo al reverso", datos.serialEnFrente, !datos.serialEnFrente);
    revisar("serial fuera del inspector", datos.serialEnInspector, !datos.serialEnInspector);

    if (movil) {
      revisar("pestañas visibles en iPhone", datos.tabsVisibles, datos.tabsVisibles);
      revisar("sin barra lateral en iPhone", datos.lateralVisible, !datos.lateralVisible);
      revisar("sin inspector en iPhone", datos.inspectorVisible, !datos.inspectorVisible);
      revisar("objetivos táctiles ≥ 44 px", datos.objetivos, datos.objetivos.every((alto) => alto >= 44));
    } else {
      revisar("barra lateral visible en macOS", datos.lateralVisible, datos.lateralVisible);
      revisar("pestañas ocultas en macOS", datos.tabsVisibles, !datos.tabsVisibles);
      if (ancho >= 1080) {
        revisar("inspector visible en macOS", datos.inspectorVisible, datos.inspectorVisible);
      }
    }

    // Reverso: el serial es el único contenido y el botón vuelve al frente.
    const voltear = pagina.locator(".tarjeta__voltear").first();
    await voltear.click();
    await pagina.waitForTimeout(450);
    const reverso = await pagina.evaluate(() => {
      const cara = document.querySelector('.tarjeta__cara--reverso');
      const boton = document.querySelector(".tarjeta__voltear");
      return {
        texto: cara?.innerText.trim() ?? "",
        ancho: Math.round(boton?.getBoundingClientRect().width ?? 0),
      };
    });
    revisar("reverso: solo el serial", reverso.texto, /^G-\d{5}-\d{3}-[A-Z]$/.test(reverso.texto));
    revisar("botón de giro de ancho fijo", reverso.ancho, reverso.ancho === 148);
    await pagina.screenshot({
      path: `${SALIDA}/reverso-${ancho}-${esquema}.png`,
      fullPage: false,
    });
    await voltear.click();
    await pagina.waitForTimeout(350);

    await pagina.screenshot({
      path: `${SALIDA}/inicio-${ancho}-${esquema}.png`,
      fullPage: false,
    });

    const selectorPestana = movil ? ".tabs__item" : ".barra-lateral__item";
    const pestanas = await pagina.locator(selectorPestana).count();
    for (let i = 0; i < pestanas; i += 1) {
      await pagina.locator(selectorPestana).nth(i).click();
      await pagina.waitForTimeout(260);
      const desborde = await pagina.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth
      );
      revisar(`pestaña ${i + 1} sin desbordamiento`, desborde, desborde <= 1);
      await pagina.screenshot({
        path: `${SALIDA}/pestana-${i + 1}-${ancho}-${esquema}.png`,
        fullPage: false,
      });
      if (i === 1) {
        await pagina.screenshot({
          path: `${SALIDA}/movimientos-${ancho}-${esquema}.png`,
          fullPage: false,
        });
        if (!movil) {
          const fila = pagina.locator(".movimiento--accion").first();
          if ((await fila.count()) > 0) {
            await fila.click();
            await pagina.waitForTimeout(300);
            const detalle = await pagina.evaluate(() => {
              const inspector = document.querySelector(".inspector");
              return {
                texto: inspector?.textContent ?? "",
                ancho: inspector?.getBoundingClientRect().width ?? 0,
              };
            });
            revisar(
              "inspector muestra el movimiento elegido",
              detalle.texto.slice(0, 60),
              detalle.ancho >= 280 && detalle.texto.includes("Detalle del movimiento")
            );
            await pagina.screenshot({
              path: `${SALIDA}/detalle-${ancho}-${esquema}.png`,
              fullPage: false,
            });
          }
        }
      }
      if (i === 2 && !movil) {
        const tituloInspector = await pagina.evaluate(
          () => document.querySelector(".inspector__cabecera h2")?.textContent ?? ""
        );
        revisar(
          "el inspector vuelve al resumen al cambiar de sección",
          tituloInspector,
          tituloInspector === "Resumen"
        );
      }
    }

    await contexto.close();
  }
}

await navegador.close();
console.log(`\nCapturas en ${SALIDA}`);
