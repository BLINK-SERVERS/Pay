import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CLAVE_OFFLINE,
  VIGENCIA_COPIA_MS,
  copiaDe,
  guardarCopia,
  guardarMovimientos,
  leerCopia,
  movimientosDe,
  olvidarCopia,
} from "./offline";
import type { Movimiento, Sesion } from "./tipos";

class Memoria {
  datos = new Map<string, string>();
  getItem = (clave: string) => this.datos.get(clave) ?? null;
  setItem = (clave: string, valor: string) => void this.datos.set(clave, valor);
  removeItem = (clave: string) => void this.datos.delete(clave);
}

const CUENTA = {
  nombres: "María Fernanda",
  apellidos: "Pérez",
  cedula: "12345678",
  telefono: "04141234567",
  correo: "maria@ejemplo.com",
  datosPago: { propio: true, banco: "Banesco", telefono: "04141234567", cedula: "12345678" },
};

const TARJETA = {
  serial: "23-1-000001-9",
  uid: "058151954F3400",
  titular: { nombre: "María Pérez", cedula: "12345678", telefono: "04141234567" },
  saldo: 1500,
  estado: "activa" as const,
  emitida: "2026-01-01",
  vence: "2030-01-01",
  tarifa: 15,
};

const SESION: Sesion = { token: "tok-1", cuenta: CUENTA, tarjetas: [TARJETA] };

const MOVIMIENTO: Movimiento = {
  id: "m-1",
  serial: TARJETA.serial,
  tipo: "recarga",
  monto: 500,
  saldoDespues: 1500,
  at: "2026-10-31T10:00:00Z",
  detalle: "Recarga",
  estado: "aprobado",
};

let almacen: Memoria;

beforeEach(() => {
  almacen = new Memoria();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-31T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("copia sin conexión", () => {
  it("guarda la billetera y la devuelve con su fecha", () => {
    guardarCopia(SESION, almacen as unknown as Storage);
    const copia = leerCopia(almacen as unknown as Storage);
    expect(copia?.token).toBe("tok-1");
    expect(copia?.cuenta.nombres).toBe("María Fernanda");
    expect(copia?.tarjetas).toHaveLength(1);
    expect(copia?.guardado).toBe(Date.now());
    expect(copiaDe("tok-1", almacen as unknown as Storage)?.tarjetas[0].saldo).toBe(1500);
  });

  it("descarta y borra la copia pasadas 12 horas", () => {
    guardarCopia(SESION, almacen as unknown as Storage);
    vi.advanceTimersByTime(VIGENCIA_COPIA_MS + 1000);
    expect(leerCopia(almacen as unknown as Storage)).toBeNull();
    expect(almacen.getItem(CLAVE_OFFLINE)).toBeNull();
  });

  it("descarta una copia fechada en el futuro por más de 5 minutos", () => {
    almacen.setItem(
      CLAVE_OFFLINE,
      JSON.stringify({ ...SESION, movimientos: {}, guardado: Date.now() + 6 * 60 * 1000 })
    );
    expect(leerCopia(almacen as unknown as Storage)).toBeNull();
    expect(almacen.getItem(CLAVE_OFFLINE)).toBeNull();
  });

  it("descarta una copia del formato anterior, sin fecha", () => {
    almacen.setItem(CLAVE_OFFLINE, JSON.stringify({ ...SESION, movimientos: {} }));
    expect(leerCopia(almacen as unknown as Storage)).toBeNull();
  });

  it("descarta un JSON corrupto", () => {
    almacen.setItem(CLAVE_OFFLINE, "{no es json");
    expect(leerCopia(almacen as unknown as Storage)).toBeNull();
    expect(almacen.getItem(CLAVE_OFFLINE)).toBeNull();
  });

  it("no entrega la copia a un token distinto", () => {
    guardarCopia(SESION, almacen as unknown as Storage);
    expect(copiaDe("tok-2", almacen as unknown as Storage)).toBeNull();
  });

  it("conserva los movimientos solo para la misma sesión", () => {
    guardarCopia(SESION, almacen as unknown as Storage);
    guardarMovimientos("tok-1", TARJETA.serial, [MOVIMIENTO], almacen as unknown as Storage);
    expect(movimientosDe("tok-1", TARJETA.serial, almacen as unknown as Storage)).toHaveLength(1);

    guardarCopia({ ...SESION, token: "tok-2" }, almacen as unknown as Storage);
    expect(movimientosDe("tok-2", TARJETA.serial, almacen as unknown as Storage)).toBeNull();
  });

  it("renueva la fecha al guardar movimientos", () => {
    guardarCopia(SESION, almacen as unknown as Storage);
    vi.advanceTimersByTime(VIGENCIA_COPIA_MS - 60 * 1000);
    guardarMovimientos("tok-1", TARJETA.serial, [MOVIMIENTO], almacen as unknown as Storage);
    vi.advanceTimersByTime(2 * 60 * 1000);
    expect(leerCopia(almacen as unknown as Storage)).not.toBeNull();
  });

  it("olvida solo la copia de la sesión indicada", () => {
    guardarCopia(SESION, almacen as unknown as Storage);
    olvidarCopia("tok-2", almacen as unknown as Storage);
    expect(leerCopia(almacen as unknown as Storage)).not.toBeNull();
    olvidarCopia("tok-1", almacen as unknown as Storage);
    expect(leerCopia(almacen as unknown as Storage)).toBeNull();
  });

  it("tolera un almacenamiento que lanza al escribir", () => {
    const roto = {
      getItem: () => null,
      setItem: () => {
        throw new Error("lleno");
      },
      removeItem: () => {},
    };
    expect(() => guardarCopia(SESION, roto as unknown as Storage)).not.toThrow();
  });
});
