import { describe, expect, it, vi } from "vitest";
import {
  aplicarActualizacion,
  descartarActualizacion,
  suscribirActualizacion,
} from "./actualizacion";

describe("aviso de actualización", () => {
  it("al suscribirse entrega el estado actual", () => {
    const oyente = vi.fn();
    const salir = suscribirActualizacion(oyente);
    expect(oyente).toHaveBeenCalledWith("ninguno");
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
    expect(oyente).toHaveBeenLastCalledWith("ninguno");
    salir();
  });

  it("aplicar sin worker en espera no avisa nada pendiente", () => {
    // Sin registro no hay versión que activar: el aviso vuelve a ocultarse y
    // el intento de actualizar no deja la pestaña colgada.
    const oyente = vi.fn();
    const salir = suscribirActualizacion(oyente);
    expect(() => aplicarActualizacion()).not.toThrow();
    expect(oyente).toHaveBeenLastCalledWith("ninguno");
    salir();
  });
});
