import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CLAVE_BIOMETRIA,
  guardarSesionBiometria,
  leerRegistroBiometria,
  marcarOfrecimiento,
  ofrecimientoHecho,
  olvidarBiometria,
  olvidarTokenBiometria,
  registroDesbloqueable,
  type RegistroBiometria,
} from "./biometria";
import type { Sesion } from "./tipos";

class Memoria {
  datos = new Map<string, string>();
  getItem = (clave: string) => this.datos.get(clave) ?? null;
  setItem = (clave: string, valor: string) => void this.datos.set(clave, valor);
  removeItem = (clave: string) => void this.datos.delete(clave);
}

const CUENTA = {
  nombres: "María Fernanda",
  apellidos: "Pérez",
  cedula: "V-12345678",
  telefono: "04141234567",
  correo: "maria@ejemplo.com",
  datosPago: { propio: true, banco: "Banesco", telefono: "04141234567", cedula: "V-12345678" },
};

const TARJETA = {
  serial: "23-1-000001-9",
  uid: "058151954F3400",
  titular: { nombre: "María Pérez", cedula: "V-12345678", telefono: "04141234567" },
  saldo: 1500,
  estado: "activa" as const,
  emitida: "2026-01-01",
  vence: "2030-01-01",
  tarifa: 15,
};

const SESION: Sesion = { token: "tok-1", cuenta: CUENTA, tarjetas: [TARJETA] };
const VIGENCIA = 12 * 60 * 60 * 1000;

function registro(extra: Partial<RegistroBiometria> = {}): RegistroBiometria {
  return {
    cedula: "V-12345678",
    nombre: "María Fernanda Pérez",
    credencial: "ZGVtby1jcmVkZW5jaWFs",
    token: "tok-1",
    expira: Date.now() + VIGENCIA,
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
  it("guarda y devuelve una credencial válida", () => {
    guardado(almacen, registro());
    const leido = leerRegistroBiometria(comoStorage());
    expect(leido?.credencial).toBe("ZGVtby1jcmVkZW5jaWFs");
    expect(leido?.token).toBe("tok-1");
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

  it("conserva la credencial pero invalida el token vencido", () => {
    guardado(almacen, registro());
    vi.advanceTimersByTime(VIGENCIA + 1000);
    const leido = leerRegistroBiometria(comoStorage());
    expect(leido?.credencial).toBe("ZGVtby1jcmVkZW5jaWFs");
    expect(leido?.token).toBe("");
    expect(leido?.expira).toBe(0);
    expect(registroDesbloqueable(leido)).toBe(false);
  });

  it("invalida un token fechado más allá de la vigencia", () => {
    guardado(almacen, registro({ expira: Date.now() + VIGENCIA + 6 * 60 * 1000 }));
    const leido = leerRegistroBiometria(comoStorage());
    expect(leido?.token).toBe("");
    expect(registroDesbloqueable(leido)).toBe(false);
  });

  it("descarta un alta fechada en el futuro", () => {
    guardado(almacen, registro({ alta: Date.now() + 6 * 60 * 1000 }));
    expect(leerRegistroBiometria(comoStorage())).toBeNull();
  });

  it("enlaza un token nuevo solo a la misma cédula", () => {
    guardado(almacen, registro());
    const actualizado = guardarSesionBiometria(
      { ...SESION, token: "tok-2" },
      comoStorage()
    );
    expect(actualizado?.token).toBe("tok-2");
    expect(leerRegistroBiometria(comoStorage())?.token).toBe("tok-2");

    const otra = guardarSesionBiometria(
      { ...SESION, token: "tok-3", cuenta: { ...CUENTA, cedula: "V-87654321" } },
      comoStorage()
    );
    expect(otra).toBeNull();
    expect(leerRegistroBiometria(comoStorage())?.token).toBe("tok-2");
  });

  it("olvida el token al cerrar sesión sin borrar la credencial", () => {
    guardado(almacen, registro());
    olvidarTokenBiometria(comoStorage());
    const leido = leerRegistroBiometria(comoStorage());
    expect(leido?.credencial).toBe("ZGVtby1jcmVkZW5jaWFs");
    expect(registroDesbloqueable(leido)).toBe(false);
  });

  it("borra la vinculación completa al desactivarla", () => {
    guardado(almacen, registro());
    olvidarBiometria(comoStorage());
    expect(almacen.getItem(CLAVE_BIOMETRIA)).toBeNull();
  });

  it("recuerda que ya se ofreció la biometría para una cédula", () => {
    expect(ofrecimientoHecho("V-12345678", comoStorage())).toBe(false);
    marcarOfrecimiento("V-12345678", comoStorage());
    expect(ofrecimientoHecho("V-12345678", comoStorage())).toBe(true);
    expect(ofrecimientoHecho("V-87654321", comoStorage())).toBe(false);
  });
});
