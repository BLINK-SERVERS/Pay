import { describe, expect, it } from "vitest";
import {
  buscarRecargaDuplicada,
  erroresDatosPago,
  erroresRecarga,
  letraLuhn,
  pasajesEquivalentes,
  perfilTarifa,
  saldoParaPasajes,
  validarCedula,
  validarCorreo,
  validarNombre,
  validarPin,
  validarSerial,
  validarTelefono,
  type BorradorRecarga,
} from "./dominio";
import type { Movimiento } from "./tipos";

const BUENO: BorradorRecarga = {
  pasajes: "1",
  telefono: "0414-1234567",
  banco: "Banesco",
  referencia: "4821",
};

function recarga(estado: Movimiento["estado"], referencia = "4821"): Movimiento {
  return {
    id: `r-${estado}`,
    serial: "G-00001-001-N",
    tipo: "recarga",
    monto: 200,
    saldoDespues: 100,
    at: new Date().toISOString(),
    detalle: "Pago Móvil",
    estado,
    banco: "Banesco",
    referencia,
  };
}

describe("validarCedula", () => {
  it("acepta cédulas de 6 a 8 dígitos", () => {
    expect(validarCedula("12345678")).toBeNull();
    expect(validarCedula("123456")).toBeNull();
  });

  it("tolera separadores al pegar la cédula", () => {
    expect(validarCedula("12.345.678")).toBeNull();
  });

  it("rechaza cédulas cortas o largas", () => {
    expect(validarCedula("12345")).toMatch(/al menos 6/);
    expect(validarCedula("123456789")).toMatch(/más de 8/);
  });

  it("rechaza letras y símbolos", () => {
    expect(validarCedula("V-12345678")).toMatch(/solo con números/);
    expect(validarCedula("1234a678")).toMatch(/solo con números/);
  });
});

describe("validarPin", () => {
  it("acepta seis dígitos sin patrón", () => {
    expect(validarPin("149205")).toBeNull();
  });

  it("rechaza repeticiones y secuencias", () => {
    expect(validarPin("111111")).toMatch(/mismo dígito/);
    expect(validarPin("123456")).toMatch(/secuencias/);
    expect(validarPin("987654")).toMatch(/secuencias/);
    expect(validarPin("12345")).toMatch(/6 dígitos/);
  });
});

describe("datos del registro", () => {
  it("valida nombres y apellidos", () => {
    expect(validarNombre("María Fernanda", "nombre")).toBeNull();
    expect(validarNombre("O'Brien", "apellido")).toBeNull();
    expect(validarNombre("", "nombre")).toMatch(/nombres/);
    expect(validarNombre("Ana3", "nombre")).toMatch(/letras/);
  });

  it("valida el correo", () => {
    expect(validarCorreo("maria@example.com")).toBeNull();
    expect(validarCorreo("maria.example.com")).toMatch(/arroba/);
    expect(validarCorreo("")).toMatch(/correo/);
  });

  it("valida el teléfono venezolano", () => {
    expect(validarTelefono("0414-1234567")).toBeNull();
    expect(validarTelefono("4141234567")).toMatch(/11 dígitos/);
  });

  it("valida la fuente de pago contra el directorio de bancos", () => {
    expect(
      erroresDatosPago({
        propio: false,
        banco: "Banesco Banco Universal",
        telefono: "04141234567",
        cedula: "12345678",
      })
    ).toEqual({});
    expect(
      erroresDatosPago({
        propio: false,
        banco: "Banco Inventado",
        telefono: "0414",
        cedula: "1",
      })
    ).toMatchObject({ banco: expect.any(String), telefono: expect.any(String), cedula: expect.any(String) });
  });
});

describe("erroresRecarga", () => {
  it("no marca nada con un reporte completo", () => {
    expect(erroresRecarga(BUENO)).toEqual({});
  });

  it("valida pasajes, teléfono, banco y referencia por separado", () => {
    const errores = erroresRecarga({ pasajes: "", telefono: "0414", banco: "", referencia: "12" });
    expect(errores.pasajes).toBeTruthy();
    expect(errores.telefono).toBeTruthy();
    expect(errores.banco).toBeTruthy();
    expect(errores.referencia).toBeTruthy();
  });

  it("admite cualquier cantidad de pasajes: la recarga no tiene tope", () => {
    expect(erroresRecarga({ ...BUENO, pasajes: "40" }).pasajes).toBeUndefined();
    expect(erroresRecarga({ ...BUENO, pasajes: "100000" }).pasajes).toBeUndefined();
  });

  it("solo admite cantidades enteras", () => {
    expect(erroresRecarga({ ...BUENO, pasajes: "1.5" }).pasajes).toMatch(/entera/);
    expect(erroresRecarga({ ...BUENO, pasajes: "0" }).pasajes).toMatch(/entera/);
  });

  it("exige teléfono venezolano de 11 dígitos", () => {
    expect(erroresRecarga({ ...BUENO, telefono: "4141234567" }).telefono).toBeTruthy();
  });
});

describe("buscarRecargaDuplicada", () => {
  it("encuentra una referencia vigente", () => {
    const lista = [recarga("pendiente")];
    expect(buscarRecargaDuplicada(lista, { banco: "Banesco", referencia: "4821" })).toBeTruthy();
  });

  it("deja reenviar una recarga rechazada", () => {
    const lista = [recarga("rechazado")];
    expect(buscarRecargaDuplicada(lista, { banco: "Banesco", referencia: "4821" })).toBeNull();
  });

  it("solo compara los últimos 4 dígitos", () => {
    const lista = [recarga("aprobado")];
    expect(
      buscarRecargaDuplicada(lista, { banco: "Banesco", referencia: "000004821" })
    ).toBeTruthy();
  });

  it("distingue el banco emisor", () => {
    const lista = [recarga("aprobado")];
    expect(buscarRecargaDuplicada(lista, { banco: "Mercantil", referencia: "4821" })).toBeNull();
  });
});

describe("pasajesEquivalentes", () => {
  it("calcula pasajes completos a la tarifa", () => {
    expect(pasajesEquivalentes(1500, 500)).toBe(3);
    expect(pasajesEquivalentes(499, 500)).toBe(0);
  });

  it("no divide entre cero y no da negativos", () => {
    expect(pasajesEquivalentes(1000, 0)).toBe(0);
    expect(pasajesEquivalentes(-10, 500)).toBe(0);
  });

  it("sabe si el saldo alcanza para N pasajes", () => {
    expect(saldoParaPasajes(1500, 500, 3)).toBe(true);
    expect(saldoParaPasajes(1499, 500, 3)).toBe(false);
  });
});

describe("perfilTarifa", () => {
  it("lee el perfil de la letra del serial", () => {
    expect(perfilTarifa("G-00001-001-N")).toBe("GENERAL");
    expect(perfilTarifa("E-00001-001-V")).toBe("ESTUDIANTE");
    expect(perfilTarifa("A-00000-000-H")).toBe("GENERAL");
  });

  it("cae en general con seriales incompletos", () => {
    expect(perfilTarifa("")).toBe("GENERAL");
    expect(perfilTarifa("23")).toBe("GENERAL");
  });
});

describe("serial Blink", () => {
  it("calcula la letra verificadora mod 23 de los 9 caracteres base", () => {
    expect(letraLuhn("G00001001")).toBe("N");
    expect(letraLuhn("G00001002")).toBe("R");
    expect(letraLuhn("G00001004")).toBe("V");
    expect(letraLuhn("E00001001")).toBe("V");
    expect(letraLuhn("A00000000")).toBe("H");
  });

  it("rechaza bases que no son A/G/E + 8 dígitos", () => {
    expect(() => letraLuhn("231000001")).toThrow();
    expect(() => letraLuhn("G0000100")).toThrow();
  });

  it("acepta seriales con verificador válido", () => {
    expect(validarSerial("G-00001-001-N")).toBeNull();
    expect(validarSerial("G00001001N")).toBeNull();
    expect(validarSerial("E-00001-001-V")).toBeNull();
    expect(validarSerial("A-00000-000-H")).toBeNull();
  });

  it("rechaza largo incorrecto o verificador que no cuadra", () => {
    expect(validarSerial("G-00001-001-A")).toMatch(/letra final/);
    expect(validarSerial("G-00001-001")).toMatch(/formato/);
    expect(validarSerial("23-1-000001-9")).toMatch(/formato/);
    expect(validarSerial("")).toMatch(/formato/);
  });
});
