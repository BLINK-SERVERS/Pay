import { chromium } from "playwright-core";
import { mkdir } from "node:fs/promises";

/**
 * Verificación visual y estructural del rediseño HIG.
 *
 * Usa el Chromium del sistema (no descarga navegadores) y comprueba,
 * en 393×852 y 1440×900, con apariencia clara y oscura:
 *   · que no haya desbordamiento horizontal,
 *   · que todos los iconos sean SF Symbols,
 *   · la pila tipográfica y las cifras tabulares,
 *   · los objetivos táctiles de 44 pt y el material translúcido,
 *   · la disposición iPhone (pestañas) o macOS (barra lateral/inspector).
 */

const BASE = process.env.BLINK_URL ?? "http://127.0.0.1:5175/";
const SALIDA = process.env.BLINK_CAPTURAS ?? "/tmp/blink-hig";
const PIN_DEMO = "194628";
const CEDULA_DEMO = "V-12345678";

await mkdir(SALIDA, { recursive: true });

const navegador = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

async function iniciarSesion() {
  const contexto = await navegador.newContext({
    viewport: { width: 393, height: 852 },
    colorScheme: "light",
    hasTouch: true,
  });
  const pagina = await contexto.newPage();
  await pagina.goto(BASE, { waitUntil: "networkidle" });
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

// Pantalla de acceso, sin sesión: debe respirar igual en iPhone y macOS.
for (const ancho of [393, 1440]) {
  for (const esquema of ["light", "dark"]) {
    const movil = ancho < 768;
    const contexto = await navegador.newContext({
      viewport: { width: ancho, height: movil ? 852 : 900 },
      colorScheme: esquema,
      hasTouch: movil,
    });
    const pagina = await contexto.newPage();
    await pagina.goto(BASE, { waitUntil: "networkidle" });
    // En producción el paquete compilado puede montar un fotograma después;
    // esperar al panel evita medir una pantalla todavía vacía.
    await pagina.waitForSelector(".acceso__panel");
    await pagina.waitForFunction(
      () => (document.querySelector(".acceso__panel")?.getBoundingClientRect().width ?? 0) > 0
    );
    await pagina.waitForTimeout(250);
    console.log(`\nacceso ${ancho}px · ${esquema}`);
    const datos = await pagina.evaluate(() => {
      const panel = document.querySelector(".acceso__panel");
      const fondo = document.querySelector(".acceso__fondo");
      return {
        desborde: document.documentElement.scrollWidth - window.innerWidth,
        panel: panel ? Math.round(panel.getBoundingClientRect().width) : 0,
        fondo: fondo ? Math.round(fondo.getBoundingClientRect().width) : 0,
      };
    });
    revisar("sin desbordamiento horizontal", datos.desborde, datos.desborde <= 1);
    revisar("panel de acceso presente", datos.panel, datos.panel > 280);
    revisar("fondo a todo el ancho", datos.fondo, datos.fondo === ancho);
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
    const pagina = await contexto.newPage();
    await pagina.goto(BASE, { waitUntil: "networkidle" });
    await pagina.waitForSelector(".app__main");
    await pagina.waitForTimeout(350);

    console.log(`\n${ancho}px · ${esquema}`);

    const datos = await pagina.evaluate(() => {
      const visible = (selector) => {
        const el = document.querySelector(selector);
        return Boolean(el && el.getBoundingClientRect().width > 0);
      };
      const iconos = [...document.querySelectorAll("svg.icon")];
      const sf = iconos.filter((svg) => svg.hasAttribute("data-variante"));
      const monto = document.querySelector(".tarjeta__monto strong");
      const tabs = document.querySelector(".tabs");
      return {
        desborde: document.documentElement.scrollWidth - window.innerWidth,
        iconos: iconos.length,
        sf: sf.length,
        fuente: getComputedStyle(document.body).fontFamily,
        tabular: monto ? getComputedStyle(monto).fontVariantNumeric : "",
        tabulares: [".tile__valor", ".movimiento__monto--sale", ".inspector__saldo"]
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
      };
    });

    revisar("sin desbordamiento horizontal", datos.desborde, datos.desborde <= 1);
    revisar("todos los iconos son SF Symbols", `${datos.sf}/${datos.iconos}`, datos.iconos > 0 && datos.sf === datos.iconos);
    revisar("pila tipográfica SF Pro/Inter", datos.fuente, /SF Pro|Inter/.test(datos.fuente));
    revisar("cifras tabulares en el saldo", datos.tabular, datos.tabular.includes("tabular-nums"));
    revisar(
      "cifras tabulares en importes y totales",
      datos.tabulares,
      datos.tabulares.length > 0 && datos.tabulares.every((valor) => valor.includes("tabular-nums"))
    );
    revisar("material translúcido en la barra", datos.material, /blur\(24px\)/.test(datos.material));

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

    await pagina.screenshot({
      path: `${SALIDA}/inicio-${ancho}-${esquema}.png`,
      fullPage: false,
    });

    if (movil) {
      await pagina.evaluate(() => window.scrollTo({ top: 320 }));
      // La barra entra con una transición de 0,2 s; esperar a que el material
      // y el título terminen evita leer un fotograma intermedio.
      await pagina.waitForFunction(
        () => {
          const barra = document.querySelector(".barra-sup");
          if (!barra?.classList.contains("barra-sup--compacta")) return false;
          const titulo = document.querySelector(".barra-sup__titulo");
          return (
            /blur\(24px\)/.test(getComputedStyle(barra).backdropFilter) &&
            Number(getComputedStyle(titulo).opacity) > 0.98
          );
        },
        { timeout: 5000 }
      );
      await pagina.waitForTimeout(120);
      const barra = await pagina.evaluate(() => {
        const bar = document.querySelector(".barra-sup");
        const titulo = document.querySelector(".barra-sup__titulo");
        const senal = document.querySelector(".barra-sup__senal");
        return {
          compacta: bar.classList.contains("barra-sup--compacta"),
          material: getComputedStyle(bar).backdropFilter,
          titulo: titulo ? getComputedStyle(titulo).opacity : "0",
          senal: senal ? getComputedStyle(senal).opacity : "0",
        };
      });
      revisar("barra compacta al desplazar", barra.compacta, barra.compacta);
      revisar("barra compacta translúcida", barra.material, /blur\(24px\)/.test(barra.material));
      revisar("título visible al desplazar", barra.titulo, Number(barra.titulo) > 0.9);
      revisar("indicador en línea visible al desplazar", barra.senal, Number(barra.senal) > 0.9);
      await pagina.screenshot({
        path: `${SALIDA}/inicio-desplazado-${ancho}-${esquema}.png`,
        fullPage: false,
      });
      await pagina.evaluate(() => window.scrollTo({ top: 0 }));
      await pagina.waitForTimeout(200);
    }

    const selectorPestana = movil ? ".tabs__item" : ".barra-lateral__item";
    const pestanas = await pagina.locator(selectorPestana).count();
    for (let i = 0; i < pestanas; i += 1) {
      await pagina.locator(selectorPestana).nth(i).click();
      await pagina.waitForTimeout(220);
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
            await pagina.waitForTimeout(280);
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
