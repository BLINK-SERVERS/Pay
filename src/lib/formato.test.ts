import { describe, expect, it } from "vitest";
import {
  etiquetaDia,
  formatearBs,
  formatearCedula,
  formatearSerial,
  formatearTelefono,
  formatearVence,
  iniciales,
  nombreTarjeta,
  partesBs,
} from "./formato";

describe("formato de bolívares", () => {
  it("usa bolívares enteros, sin céntimos", () => {
    expect(formatearBs(1234)).toBe("Bs 1.234");
    expect(formatearBs(0)).toBe("Bs 0");
  });

  it("parte el monto para animarlo y omite la coma si no hay decimales", () => {
    expect(partesBs(1500)).toEqual({ entero: "1.500", decimal: "" });
    expect(partesBs(1234.56)).toEqual({ entero: "1.234", decimal: "56" });
  });

  it("no propaga valores inválidos", () => {
    expect(formatearBs(Number.NaN)).toBe("Bs 0");
  });
});

describe("máscaras", () => {
  it("da formato al serial BLINK T-LLLLL-UUU-V", () => {
    expect(formatearSerial("G00001001N")).toBe("G-00001-001-N");
    expect(formatearSerial("g-00001-001-n")).toBe("G-00001-001-N");
    expect(formatearSerial("E00001001")).toBe("E-00001-001");
    expect(formatearSerial("G000")).toBe("G-000");
    expect(formatearSerial("")).toBe("");
  });

  it("deja la cédula en dígitos, sin letras ni guiones", () => {
    expect(formatearCedula("V-12345678")).toBe("12345678");
    expect(formatearCedula("12.345.678")).toBe("12345678");
    expect(formatearCedula("1234567890")).toBe("12345678");
    expect(formatearCedula("")).toBe("");
  });

  it("da formato al teléfono venezolano", () => {
    expect(formatearTelefono("04141234567")).toBe("0414-1234567");
    expect(formatearTelefono("0414")).toBe("0414");
    expect(formatearTelefono("041412345678999")).toBe("0414-1234567");
  });
});

describe("presentación", () => {
  it("imprime el nombre como en el plástico", () => {
    expect(nombreTarjeta("María Fernanda Fernández")).toBe("MARÍA FERNÁNDEZ");
    expect(nombreTarjeta("Carlos Rondón")).toBe("CARLOS RONDÓN");
    expect(nombreTarjeta("María")).toBe("MARÍA");
  });

  it("calcula iniciales del titular", () => {
    expect(iniciales("María Fernanda Fernández")).toBe("MF");
    expect(iniciales("Carlos Rondón")).toBe("CR");
    expect(iniciales("")).toBe("BL");
  });

  it("muestra el vencimiento como la tarjeta", () => {
    expect(formatearVence("2030-03-14T12:00:00.000Z")).toMatch(/^\d{2}\/30$/);
  });

  it("agrupa el extracto por día", () => {
    const hoy = new Date();
    expect(etiquetaDia(hoy.toISOString())).toBe("Hoy");
    const ayer = new Date();
    ayer.setDate(hoy.getDate() - 1);
    expect(etiquetaDia(ayer.toISOString())).toBe("Ayer");
  });
});
