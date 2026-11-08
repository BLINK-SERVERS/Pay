import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function montarAlmacen(inicial: Record<string, string> = {}) {
  const datos = new Map(Object.entries(inicial));
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (clave: string) => datos.get(clave) ?? null,
      setItem: (clave: string, valor: string) => void datos.set(clave, valor),
      removeItem: (clave: string) => void datos.delete(clave),
    },
  });
  return datos;
}

async function cargar() {
  vi.resetModules();
  return import("./cookies");
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-08T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("consentimiento de cookies", () => {
  it("pide el aviso mientras no haya decisión", async () => {
    montarAlmacen();
    const { faltaConsentimiento, leerConsentimiento } = await cargar();
    expect(faltaConsentimiento()).toBe(true);
    expect(leerConsentimiento()).toBeNull();
  });

  it("guarda la decisión con su fecha y deja de pedir el aviso", async () => {
    const datos = montarAlmacen();
    const { faltaConsentimiento, guardarConsentimiento, leerConsentimiento } = await cargar();

    guardarConsentimiento("necesarias");

    expect(faltaConsentimiento()).toBe(false);
    expect(leerConsentimiento()).toEqual({
      decision: "necesarias",
      fecha: "2026-11-08T12:00:00.000Z",
    });
    expect(JSON.parse(datos.get("blink.pay.cookies")!)).toMatchObject({ version: 1 });
  });

  it("acepta las tres respuestas de la landing", async () => {
    montarAlmacen();
    const { guardarConsentimiento, leerConsentimiento } = await cargar();

    for (const decision of ["todas", "necesarias", "rechazado"] as const) {
      guardarConsentimiento(decision);
      expect(leerConsentimiento()?.decision).toBe(decision);
    }
  });

  it("vuelve a preguntar si el registro está corrupto o es de otra versión", async () => {
    montarAlmacen({ "blink.pay.cookies": "{roto" });
    const { faltaConsentimiento } = await cargar();
    expect(faltaConsentimiento()).toBe(true);

    montarAlmacen({
      "blink.pay.cookies": JSON.stringify({
        decision: "todas",
        fecha: "2026-01-01T00:00:00.000Z",
        version: 0,
      }),
    });
    const otro = await cargar();
    expect(otro.faltaConsentimiento()).toBe(true);
  });

  it("no se rompe si el navegador bloquea el almacenamiento", async () => {
    vi.stubGlobal("window", {
      get localStorage(): Storage {
        throw new Error("bloqueado");
      },
    });
    const { faltaConsentimiento, guardarConsentimiento } = await cargar();
    expect(() => guardarConsentimiento("todas")).not.toThrow();
    expect(faltaConsentimiento()).toBe(true);
  });
});
