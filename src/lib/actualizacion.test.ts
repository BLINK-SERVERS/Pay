import { describe, expect, it, vi } from "vitest";
import {
  descartarActualizacion,
  suscribirActualizacion,
} from "./actualizacion";

describe("aviso de actualización", () => {
  it("al suscribirse entrega el estado actual", () => {
    const oyente = vi.fn();
    const salir = suscribirActualizacion(oyente);
    expect(oyente).toHaveBeenCalledWith(false);
    salir();
  });

  it("deja de notificar tras desuscribirse", () => {
    const oyente = vi.fn();
    const salir = suscribirActualizacion(oyente);
    oyente.mockClear();
    salir();
    descartarActualizacion();
    expect(oyente).not.toHaveBeenCalled();
  });

  it("descartar no falla sin oyentes y mantiene el aviso oculto", () => {
    expect(() => descartarActualizacion()).not.toThrow();
    const oyente = vi.fn();
    const salir = suscribirActualizacion(oyente);
    expect(oyente).toHaveBeenLastCalledWith(false);
    salir();
  });
});
