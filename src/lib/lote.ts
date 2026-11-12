import { letraLuhn } from "./dominio.ts";

export interface OpcionesLote {
  /** Cuántas tarjetas produce el lote (1–999). */
  cantidad: number;
  /** Unidad inicial dentro del lote (1–999); si se omite, empieza en 1. */
  desde?: number;
  /** 1 = pasajero general (G), 2 = estudiante / tercera edad (E). */
  tarifa?: 1 | 2;
  /** Número de lote de 5 dígitos. */
  lote?: number;
  patrocinante?: string;
}

export interface TarjetaLote {
  serial: string;
  /** Serial compacto de 10 caracteres que va en el Code 128. */
  barcode: string;
}

export interface LoteGenerado {
  numero: number;
  tarifa: number;
  patrocinante: string;
  cantidad: number;
  tarjetas: TarjetaLote[];
}

const TARIFA_POR_DEFECTO = 1;
const MAXIMO_POR_LOTE = 999;
const MAXIMO_LOTE = 99999;

function entero(valor: unknown, nombre: string): number {
  if (typeof valor !== "number" || !Number.isInteger(valor)) {
    throw new Error(`${nombre} debe ser un número entero.`);
  }
  return valor;
}

/**
 * G00001001 → G-00001-001-N. La base es la letra de tarifa (A, G o E)
 * seguida del lote de 5 dígitos y la unidad de 3 dígitos.
 */
export function serialDesdeBase(base: string): string {
  const limpio = base.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!/^[AGE][0-9]{8}$/.test(limpio)) {
    throw new Error("La base del ID Blink debe ser A/G/E + 8 dígitos.");
  }
  return `${limpio.slice(0, 1)}-${limpio.slice(1, 6)}-${limpio.slice(6)}-${letraLuhn(limpio)}`;
}

export function generarLote(opciones: OpcionesLote): LoteGenerado {
  const cantidad = entero(opciones.cantidad, "La cantidad");
  const tarifa = entero(opciones.tarifa ?? TARIFA_POR_DEFECTO, "El tipo de tarifa");
  const lote = entero(opciones.lote ?? 1, "El número de lote");
  const desde = entero(opciones.desde ?? 1, "La unidad inicial");

  if (cantidad < 1 || cantidad > MAXIMO_POR_LOTE) {
    throw new Error(`La cantidad debe estar entre 1 y ${MAXIMO_POR_LOTE} tarjetas.`);
  }
  if (tarifa !== 1 && tarifa !== 2) {
    throw new Error("El tipo de tarifa debe ser 1 (general) o 2 (estudiante).");
  }
  if (lote < 1 || lote > MAXIMO_LOTE) {
    throw new Error(`El número de lote debe estar entre 1 y ${MAXIMO_LOTE}.`);
  }
  if (desde < 1 || desde + cantidad - 1 > 999) {
    throw new Error("Las unidades del lote van de 001 a 999; revisa el inicio y la cantidad.");
  }

  const letra = tarifa === 1 ? "G" : "E";
  const tarjetas: TarjetaLote[] = [];

  for (let i = 0; i < cantidad; i++) {
    const base = `${letra}${String(lote).padStart(5, "0")}${String(desde + i).padStart(3, "0")}`;
    const serial = serialDesdeBase(base);
    tarjetas.push({ serial, barcode: serial.replace(/-/g, "") });
  }

  return {
    numero: lote,
    tarifa,
    patrocinante: opciones.patrocinante?.trim() ?? "",
    cantidad,
    tarjetas,
  };
}

function celdaCsv(valor: string | number): string {
  const texto = String(valor);
  return /[",\n;]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

/** Hoja de datos variables para el impresor y la estación de enrolado. */
export function csvLote(lote: LoteGenerado): string {
  const filas = [
    ["lote", "patrocinante", "serial", "codigo_barras", "uid", "saldo_inicial", "tarifa"],
    ...lote.tarjetas.map((t) => [
      String(lote.numero).padStart(5, "0"),
      lote.patrocinante,
      t.serial,
      t.barcode,
      "",
      0,
      lote.tarifa,
    ]),
  ];

  return filas.map((fila) => fila.map(celdaCsv).join(",")).join("\n") + "\n";
}
