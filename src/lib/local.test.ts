import { beforeEach, describe, expect, it } from "vitest";
import { hashPin, verificarPin } from "./pin";
import { ErrorBlink, repositorioLocal } from "./local";

// localStorage mínimo para probar el modo sin backend en Node.
const memoria = new Map<string, string>();

beforeEach(() => {
  memoria.clear();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (clave: string) => memoria.get(clave) ?? null,
      setItem: (clave: string, valor: string) => void memoria.set(clave, valor),
      removeItem: (clave: string) => void memoria.delete(clave),
    },
  });
});

const DEMO = { cedula: "12345678", pin: "194628" };

describe("PIN", () => {
  it("guarda un hash con sal y lo verifica", async () => {
    const guardado = await hashPin("149205");
    expect(guardado).toMatch(/^pbkdf2\$150000\$/);
    expect(guardado).not.toContain("149205");
    expect(await verificarPin("149205", guardado)).toBe(true);
    expect(await verificarPin("149206", guardado)).toBe(false);
  });

  it("usa una sal distinta cada vez", async () => {
    expect(await hashPin("149205")).not.toBe(await hashPin("149205"));
  });
});

describe("repositorio local", () => {
  it("entra con la cédula y el PIN de demostración", async () => {
    const sesion = await repositorioLocal.entrar(DEMO.cedula, DEMO.pin);
    expect(sesion.cuenta.nombres).toBe("María Fernanda");
    expect(sesion.cuenta.correo).toContain("@");
    expect(sesion.tarjetas).toHaveLength(2);
    expect(sesion.tarjetas[0].serial).toBe("G-00001-001-N");
    expect(sesion.tarjetas[0].saldo).toBe(1500);
  });

  it("no entrega la cuenta con un PIN equivocado", async () => {
    await expect(repositorioLocal.entrar(DEMO.cedula, "999999")).rejects.toMatchObject({
      codigo: "credenciales",
    });
  });

  it("avisa cuando la cédula no tiene cuenta", async () => {
    await expect(repositorioLocal.entrar("V-99999999", DEMO.pin)).rejects.toMatchObject({
      codigo: "sin-tarjeta",
    });
  });

  it("lista los movimientos de una tarjeta, del más nuevo al más viejo", async () => {
    const { token } = await repositorioLocal.entrar(DEMO.cedula, DEMO.pin);
    const movimientos = await repositorioLocal.movimientos(token, "G-00001-001-N");
    expect(movimientos.length).toBe(6);
    const fechas = movimientos.map((m) => new Date(m.at).getTime());
    expect([...fechas].sort((a, b) => b - a)).toEqual(fechas);
  });

  it("cada plástico conserva su propio saldo y extracto", async () => {
    const { token } = await repositorioLocal.entrar(DEMO.cedula, DEMO.pin);
    const movimientos = await repositorioLocal.movimientos(token, "G-00001-004-V");
    expect(movimientos.length).toBe(3);
    expect(movimientos.every((m) => m.serial === "G-00001-004-V")).toBe(true);
    const sesion = await repositorioLocal.sesion(token);
    expect(sesion.tarjetas.find((t) => t.serial === "G-00001-004-V")?.saldo).toBe(1000);
  });

  it("no deja ver una tarjeta de otra cuenta", async () => {
    const { token } = await repositorioLocal.entrar(DEMO.cedula, DEMO.pin);
    await expect(repositorioLocal.movimientos(token, "G-00001-002-R")).rejects.toMatchObject({
      codigo: "sin-tarjeta",
    });
  });

  it("reporta una recarga pendiente sin tocar el saldo", async () => {
    const { token } = await repositorioLocal.entrar(DEMO.cedula, DEMO.pin);
    const movimiento = await repositorioLocal.reportarRecarga(token, "G-00001-001-N", {
      pasajes: 1,
      monto: 530,
      montoBase: 500,
      telefono: "04141234567",
      banco: "Banco Mercantil",
      referencia: "7788",
    });
    expect(movimiento.estado).toBe("pendiente");
    const sesion = await repositorioLocal.sesion(token);
    expect(sesion.tarjetas.find((t) => t.serial === "G-00001-001-N")?.saldo).toBe(1500);
  });

  it("no acepta dos veces la misma referencia vigente", async () => {
    const { token } = await repositorioLocal.entrar(DEMO.cedula, DEMO.pin);
    await repositorioLocal.reportarRecarga(token, "G-00001-001-N", {
      pasajes: 1,
      monto: 530,
      montoBase: 500,
      telefono: "04141234567",
      banco: "Banco Mercantil",
      referencia: "7788",
    });
    await expect(
      repositorioLocal.reportarRecarga(token, "G-00001-001-N", {
        pasajes: 1,
        monto: 530,
        montoBase: 500,
        telefono: "04141234567",
        banco: "Banco Mercantil",
        referencia: "7788",
      })
    ).rejects.toBeInstanceOf(ErrorBlink);
  });

  it("cambia el PIN y obliga a usar el nuevo", async () => {
    const { token } = await repositorioLocal.entrar(DEMO.cedula, DEMO.pin);
    await repositorioLocal.cambiarPin(token, DEMO.pin, "840517");
    await expect(repositorioLocal.entrar(DEMO.cedula, DEMO.pin)).rejects.toMatchObject({
      codigo: "credenciales",
    });
    const nueva = await repositorioLocal.entrar(DEMO.cedula, "840517");
    expect(nueva.tarjetas[0].serial).toBe("G-00001-001-N");
  });

  it("registra una cuenta nueva con la fuente de pago propia", async () => {
    const sesion = await repositorioLocal.registrar({
      nombres: "Ana Isabel",
      apellidos: "Gómez",
      cedula: "80123456",
      telefono: "04167778899",
      correo: "ana@example.com",
      pin: "615208",
      datosPago: { propio: true, banco: "", telefono: "", cedula: "" },
    });
    expect(sesion.cuenta.correo).toBe("ana@example.com");
    expect(sesion.cuenta.datosPago).toMatchObject({
      propio: true,
      telefono: "04167778899",
      cedula: "80123456",
    });
    expect(sesion.tarjetas).toHaveLength(0);
  });

  it("no permite dos cuentas con la misma cédula", async () => {
    const cuenta = {
      nombres: "Ana Isabel",
      apellidos: "Gómez",
      cedula: "80179999",
      telefono: "04167778899",
      correo: "ana@example.com",
      pin: "615208",
      datosPago: { propio: true, banco: "", telefono: "", cedula: "" },
    };
    await repositorioLocal.registrar(cuenta);
    await expect(repositorioLocal.registrar(cuenta)).rejects.toMatchObject({
      codigo: "ya-activada",
    });
  });

  it("vincula un plástico nuevo y lo deja en cero", async () => {
    const { token } = await repositorioLocal.entrar("87654321", DEMO.pin);
    const actualizada = await repositorioLocal.vincular(token, "G-00001-005-M");
    const nueva = actualizada.tarjetas.find((t) => t.serial === "G-00001-005-M");
    expect(nueva?.saldo).toBe(0);
    expect(nueva?.titular.nombre).toBe("Carlos Andrés Rondón");
    await expect(repositorioLocal.vincular(token, "G-00001-005-M")).rejects.toMatchObject({
      codigo: "duplicada",
    });
  });

  it("no deja apropiarse de la tarjeta de otra cuenta", async () => {
    const { token } = await repositorioLocal.entrar("87654321", DEMO.pin);
    await expect(repositorioLocal.vincular(token, "G-00001-001-N")).rejects.toMatchObject({
      codigo: "ya-activada",
    });
  });

  it("actualiza la fuente de pago alternativa", async () => {
    const { token } = await repositorioLocal.entrar(DEMO.cedula, DEMO.pin);
    const cuenta = await repositorioLocal.actualizarPago(token, {
      propio: false,
      banco: "Banco Mercantil",
      telefono: "04129876543",
      cedula: "81234567",
    });
    expect(cuenta.datosPago.banco).toBe("Banco Mercantil");
    await expect(
      repositorioLocal.actualizarPago(token, {
        propio: false,
        banco: "Banco Inventado",
        telefono: "04129876543",
        cedula: "81234567",
      })
    ).rejects.toMatchObject({ codigo: "datos" });
  });

  it("reabre la sesión con la llave del dispositivo", async () => {
    const { token } = await repositorioLocal.entrar(DEMO.cedula, DEMO.pin);
    const llave = await repositorioLocal.crearEnlace(token);
    expect(llave.length).toBeGreaterThan(20);

    const reabierta = await repositorioLocal.reanudar(DEMO.cedula, llave);
    expect(reabierta.cuenta.cedula).toBe(DEMO.cedula);
    expect(reabierta.tarjetas.length).toBeGreaterThan(0);
    expect(reabierta.token).not.toBe(token);

    await expect(repositorioLocal.reanudar(DEMO.cedula, "otra-llave")).rejects.toMatchObject({
      codigo: "credenciales",
    });
    await expect(
      repositorioLocal.reanudar("87654321", llave)
    ).rejects.toMatchObject({ codigo: "credenciales" });
  });

  it("cierra la sesión e invalida el token", async () => {
    const { token } = await repositorioLocal.entrar(DEMO.cedula, DEMO.pin);
    await repositorioLocal.salir(token);
    await expect(repositorioLocal.sesion(token)).rejects.toMatchObject({ codigo: "sesion" });
  });
});

describe("transferencia de saldo en modo local", () => {
  const ORIGEN = "G-00001-001-N";
  const DESTINO = "G-00001-004-V";

  async function abrir() {
    const { token } = await repositorioLocal.entrar(DEMO.cedula, DEMO.pin);
    return token;
  }

  function solicitud(clave = crypto.randomUUID()) {
    return {
      origen: ORIGEN,
      destino: DESTINO,
      monto: 500,
      pin: DEMO.pin,
      clave,
    };
  }

  it("mueve el saldo y deja un movimiento en cada tarjeta", async () => {
    const token = await abrir();
    const resultado = await repositorioLocal.transferir(token, solicitud());
    expect(resultado.repetida).toBe(false);
    expect(resultado.transferencia.origen.saldo).toBe(1000);
    expect(resultado.transferencia.destino.saldo).toBe(1500);
    expect(resultado.transferencia.destino.titular).toBe("Diego F.");
    expect(resultado.movimiento).toMatchObject({
      serial: ORIGEN,
      tipo: "transferencia",
      monto: -500,
      saldoDespues: 1000,
    });

    const sesion = await repositorioLocal.sesion(token);
    expect(sesion.tarjetas.find((t) => t.serial === ORIGEN)?.saldo).toBe(1000);
    expect(sesion.tarjetas.find((t) => t.serial === DESTINO)?.saldo).toBe(1500);

    const origen = await repositorioLocal.movimientos(token, ORIGEN);
    const destino = await repositorioLocal.movimientos(token, DESTINO);
    expect(origen.find((m) => m.tipo === "transferencia")).toMatchObject({
      tipo: "transferencia",
      monto: -500,
    });
    expect(destino.find((m) => m.tipo === "transferencia")).toMatchObject({
      tipo: "transferencia",
      monto: 500,
    });
  });

  it("no repite el cargo con la misma clave", async () => {
    const token = await abrir();
    const clave = crypto.randomUUID();
    const primera = await repositorioLocal.transferir(token, solicitud(clave));
    const segunda = await repositorioLocal.transferir(token, solicitud(clave));
    expect(primera.repetida).toBe(false);
    expect(segunda.repetida).toBe(true);
    expect(segunda.transferencia.id).toBe(primera.transferencia.id);
    const sesion = await repositorioLocal.sesion(token);
    expect(sesion.tarjetas.find((t) => t.serial === ORIGEN)?.saldo).toBe(1000);
  });

  it("rechaza el PIN incorrecto y bloquea tras cinco fallos", async () => {
    const token = await abrir();
    for (let intento = 0; intento < 4; intento += 1) {
      await expect(
        repositorioLocal.transferir(token, { ...solicitud(), pin: "000000" })
      ).rejects.toMatchObject({ codigo: "credenciales" });
    }
    await expect(
      repositorioLocal.transferir(token, { ...solicitud(), pin: "000000" })
    ).rejects.toMatchObject({ codigo: "credenciales" });
    await expect(repositorioLocal.entrar(DEMO.cedula, DEMO.pin)).rejects.toMatchObject({
      codigo: "credenciales",
    });
  });

  it("no transfiere a la misma tarjeta", async () => {
    const token = await abrir();
    await expect(
      repositorioLocal.transferir(token, { ...solicitud(), destino: ORIGEN })
    ).rejects.toMatchObject({ codigo: "datos" });
  });

  it("no deja transferir más que el saldo disponible", async () => {
    const token = await abrir();
    await expect(
      repositorioLocal.transferir(token, { ...solicitud(), monto: 2000 })
    ).rejects.toMatchObject({ codigo: "datos" });
  });

  it("aplica el tope por operación aunque haya saldo", async () => {
    const token = await abrir();
    await expect(
      repositorioLocal.transferir(token, { ...solicitud(), monto: 5001 })
    ).rejects.toBeInstanceOf(ErrorBlink);
  });

  it("no transfiere a una tarjeta bloqueada ni a un serial inexistente", async () => {
    const token = await abrir();
    await expect(
      repositorioLocal.transferir(token, { ...solicitud(), destino: "G-00001-003-T" })
    ).rejects.toMatchObject({ codigo: "bloqueada" });
    await expect(
      repositorioLocal.transferir(token, { ...solicitud(), destino: "G-00001-009-Z" })
    ).rejects.toMatchObject({ codigo: "sin-tarjeta" });
  });

  it("rechaza céntimos: el plástico sólo guarda bolívares enteros", async () => {
    const token = await abrir();
    await expect(
      repositorioLocal.transferir(token, { ...solicitud(), monto: 100.5 })
    ).rejects.toMatchObject({ codigo: "datos", message: /enteros/ });
  });

  it("puede enviar saldo a la tarjeta de otra cuenta", async () => {
    const token = await abrir();
    const resultado = await repositorioLocal.transferir(token, {
      ...solicitud(),
      destino: "G-00001-002-R",
    });
    expect(resultado.transferencia.destino).toMatchObject({
      serial: "G-00001-002-R",
      titular: "Carlos R.",
      saldo: 500,
    });
  });
});
