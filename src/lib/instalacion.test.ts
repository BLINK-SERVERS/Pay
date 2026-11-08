import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Escucha = (evento: unknown) => void;

function montarEntorno({ ua = "Mozilla/5.0 (X11; Linux x86_64) Chrome/130", standalone = false } = {}) {
  const escuchas = new Map<string, Escucha[]>();
  const almacen = new Map<string, string>();
  vi.stubGlobal("window", {
    addEventListener(tipo: string, fn: Escucha) {
      escuchas.set(tipo, [...(escuchas.get(tipo) ?? []), fn]);
    },
    matchMedia: () => ({ matches: standalone }),
  });
  vi.stubGlobal("navigator", {
    userAgent: ua,
    platform: "Linux x86_64",
    maxTouchPoints: 0,
  });
  vi.stubGlobal("localStorage", {
    getItem: (clave: string) => almacen.get(clave) ?? null,
    setItem: (clave: string, valor: string) => void almacen.set(clave, valor),
    removeItem: (clave: string) => void almacen.delete(clave),
  });
  return {
    almacen,
    emitir(tipo: string, evento: unknown) {
      for (const fn of escuchas.get(tipo) ?? []) fn(evento);
    },
  };
}

async function cargar() {
  vi.resetModules();
  return import("./instalacion");
}

function eventoInstalacion(outcome: "accepted" | "dismissed") {
  return {
    preventDefault: vi.fn(),
    prompt: vi.fn(async () => undefined),
    userChoice: Promise.resolve({ outcome }),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-08T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("instalación de la app", () => {
  it("cancela el aviso del navegador y lo deja disponible", async () => {
    const entorno = montarEntorno();
    const { prepararInstalacion, modoInstalacion } = await cargar();
    prepararInstalacion();

    const evento = eventoInstalacion("accepted");
    entorno.emitir("beforeinstallprompt", evento);

    expect(evento.preventDefault).toHaveBeenCalledTimes(1);
    expect(modoInstalacion()).toBe("nativo");
  });

  it("avisa a los suscriptores y los suelta al desuscribirse", async () => {
    const entorno = montarEntorno();
    const { prepararInstalacion, suscribirInstalacion } = await cargar();
    prepararInstalacion();

    const oyente = vi.fn();
    const salir = suscribirInstalacion(oyente);
    entorno.emitir("beforeinstallprompt", eventoInstalacion("accepted"));
    expect(oyente).toHaveBeenCalledTimes(1);

    salir();
    entorno.emitir("beforeinstallprompt", eventoInstalacion("accepted"));
    expect(oyente).toHaveBeenCalledTimes(1);
  });

  it("instala cuando el sistema acepta", async () => {
    const entorno = montarEntorno();
    const { prepararInstalacion, instalar, avisoDescartado } = await cargar();
    prepararInstalacion();

    const evento = eventoInstalacion("accepted");
    entorno.emitir("beforeinstallprompt", evento);

    await expect(instalar()).resolves.toBe(true);
    expect(evento.prompt).toHaveBeenCalledTimes(1);
    expect(avisoDescartado()).toBe(false);
  });

  it("recuerda el descarte cuando el sistema lo rechaza", async () => {
    const entorno = montarEntorno();
    const { prepararInstalacion, instalar, avisoDescartado } = await cargar();
    prepararInstalacion();

    entorno.emitir("beforeinstallprompt", eventoInstalacion("dismissed"));

    await expect(instalar()).resolves.toBe(false);
    expect(avisoDescartado()).toBe(true);
  });

  it("no ofrece nada en un equipo sin diálogo y pide los pasos en iOS", async () => {
    const escritorio = montarEntorno();
    const modEscritorio = await cargar();
    modEscritorio.prepararInstalacion();
    expect(modEscritorio.modoInstalacion()).toBeNull();

    montarEntorno({ ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X)" });
    const modIOS = await cargar();
    modIOS.prepararInstalacion();
    expect(modIOS.modoInstalacion()).toBe("ios");
    expect(escritorio.almacen.size).toBe(0);
  });

  it("no ofrece nada si la app ya corre instalada", async () => {
    montarEntorno({ standalone: true });
    const { prepararInstalacion, modoInstalacion } = await cargar();
    prepararInstalacion();
    expect(modoInstalacion()).toBeNull();
  });

  it("vuelve a ofrecerse al mes de decir «Ahora no»", async () => {
    montarEntorno();
    const { descartarAviso, avisoDescartado } = await cargar();

    descartarAviso();
    expect(avisoDescartado()).toBe(true);

    vi.setSystemTime(new Date("2026-12-20T12:00:00Z"));
    expect(avisoDescartado()).toBe(false);
  });
});
