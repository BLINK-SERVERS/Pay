import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CLAVE_BIOMETRIA,
  guardarLlaveBiometria,
  leerRegistroBiometria,
  marcarOfrecimiento,
  ofrecimientoHecho,
  olvidarBiometria,
  registroDesbloqueable,
  type RegistroBiometria,
} from "./biometria";

class Memoria {
  datos = new Map<string, string>();
  getItem = (clave: string) => this.datos.get(clave) ?? null;
  setItem = (clave: string, valor: string) => void this.datos.set(clave, valor);
  removeItem = (clave: string) => void this.datos.delete(clave);
}

function registro(extra: Partial<RegistroBiometria> = {}): RegistroBiometria {
  return {
    cedula: "12345678",
    nombre: "María Fernanda Pérez",
    credencial: "ZGVtby1jcmVkZW5jaWFs",
    llave: "bGxhdmUtZGVsLXRlbGVmb25v",
    alta: Date.now(),
    ...extra,
  };
}

function guardado(deposito: Memoria, valor: unknown) {
  deposito.setItem(CLAVE_BIOMETRIA, JSON.stringify(valor));
}

let almacen: Memoria;
const comoStorage = () => almacen as unknown as Storage;

beforeEach(() => {
  almacen = new Memoria();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-03T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("registro biométrico local", () => {
  it("guarda y devuelve la credencial con su llave", () => {
    guardado(almacen, registro());
    const leido = leerRegistroBiometria(comoStorage());
    expect(leido?.credencial).toBe("ZGVtby1jcmVkZW5jaWFs");
    expect(leido?.llave).toBe("bGxhdmUtZGVsLXRlbGVmb25v");
    expect(registroDesbloqueable(leido)).toBe(true);
  });

  it("no depende de una sesión con fecha: sigue activo días después", () => {
    guardado(almacen, registro());
    vi.advanceTimersByTime(90 * 24 * 60 * 60 * 1000);
    const leido = leerRegistroBiometria(comoStorage());
    expect(registroDesbloqueable(leido)).toBe(true);
  });

  it("descarta un JSON corrupto y lo borra", () => {
    almacen.setItem(CLAVE_BIOMETRIA, "{no es json");
    expect(leerRegistroBiometria(comoStorage())).toBeNull();
    expect(almacen.getItem(CLAVE_BIOMETRIA)).toBeNull();
  });

  it("descarta un identificador que no es base64url", () => {
    guardado(almacen, registro({ credencial: "no vale/==" }));
    expect(leerRegistroBiometria(comoStorage())).toBeNull();
    expect(almacen.getItem(CLAVE_BIOMETRIA)).toBeNull();
  });

  it("conserva un registro anterior sin llave para reactivarlo con PIN", () => {
    guardado(almacen, {
      cedula: "12345678",
      nombre: "María Fernanda Pérez",
      credencial: "ZGVtby1jcmVkZW5jaWFs",
      token: "tok-viejo",
      expira: Date.now() + 1000,
      alta: Date.now(),
    });
    const leido = leerRegistroBiometria(comoStorage());
    expect(leido?.credencial).toBe("ZGVtby1jcmVkZW5jaWFs");
    expect(leido?.llave).toBe("");
    expect(registroDesbloqueable(leido)).toBe(false);
  });

  it("enlaza la llave del dispositivo al registro existente", () => {
    guardado(almacen, registro({ llave: "" }));
    const actualizado = guardarLlaveBiometria("bnVldmEtbGxhdmU", comoStorage());
    expect(actualizado?.llave).toBe("bnVldmEtbGxhdmU");
    expect(leerRegistroBiometria(comoStorage())?.llave).toBe("bnVldmEtbGxhdmU");

    olvidarBiometria(comoStorage());
    expect(guardarLlaveBiometria("YQ", comoStorage())).toBeNull();
  });

  it("descarta un alta fechada en el futuro", () => {
    guardado(almacen, registro({ alta: Date.now() + 6 * 60 * 1000 }));
    expect(leerRegistroBiometria(comoStorage())).toBeNull();
  });

  it("guarda la cédula solo con dígitos", () => {
    guardado(almacen, registro({ cedula: "V-12345678" }));
    expect(leerRegistroBiometria(comoStorage())?.cedula).toBe("12345678");
  });

  it("borra la vinculación completa al desactivarla", () => {
    guardado(almacen, registro());
    olvidarBiometria(comoStorage());
    expect(almacen.getItem(CLAVE_BIOMETRIA)).toBeNull();
  });

  it("recuerda que ya se ofreció la biometría para una cédula", () => {
    expect(ofrecimientoHecho("12345678", comoStorage())).toBe(false);
    marcarOfrecimiento("12345678", comoStorage());
    expect(ofrecimientoHecho("12345678", comoStorage())).toBe(true);
    expect(ofrecimientoHecho("87654321", comoStorage())).toBe(false);
  });
});
