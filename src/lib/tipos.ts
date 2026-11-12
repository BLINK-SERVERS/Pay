// Dominio de Blink Pay: la cuenta del pasajero y su billetera de plásticos.

import { TARIFARIO_POR_DEFECTO, type ParametrosTarifarios } from "./tarifa";

export type EstadoTarjeta = "activa" | "bloqueada";

export interface Titular {
  nombre: string;
  cedula: string;
  telefono: string;
}

export interface Tarjeta {
  /** Serial público impreso en el plástico: 23-1-000001-9. */
  serial: string;
  /** UID de fábrica del chip MIFARE. Viaja en cada lectura del lector. */
  uid: string;
  titular: Titular;
  saldo: number;
  estado: EstadoTarjeta;
  /** ISO de emisión y de vencimiento del plástico. */
  emitida: string;
  vence: string;
  /** Tarifa vigente del pasaje, en Bs. */
  tarifa: number;
}

export type TipoMovimiento =
  | "recarga"
  | "viaje"
  | "devolucion"
  | "ajuste"
  | "transferencia";

export type EstadoMovimiento = "aprobado" | "pendiente" | "rechazado";

export interface Movimiento {
  id: string;
  serial: string;
  tipo: TipoMovimiento;
  /** Bs con signo: positivo entra a la tarjeta, negativo sale. */
  monto: number;
  /** Saldo después del movimiento. En pendientes, el saldo no cambia. */
  saldoDespues: number;
  at: string;
  detalle: string;
  estado: EstadoMovimiento;
  /** Unidad de la línea que hizo el cobro, en viajes. */
  unidad?: string;
  banco?: string;
  referencia?: string;
}

/** Página del extracto: el servidor avisa si quedan movimientos más viejos. */
export interface PaginaMovimientos {
  movimientos: Movimiento[];
  hayMas: boolean;
}

export interface OpcionesMovimientos {
  /** Filas por página (el servidor admite de 1 a 100). */
  limite?: number;
  /** Cuántos movimientos saltar desde el más reciente. */
  desplazamiento?: number;
}

export interface RecargaNueva {
  /** Cantidad de pasajes comprada. */
  pasajes: number;
  /** Monto bruto transferido por Pago Móvil, con comisiones y margen. */
  monto: number;
  /** Bs que se acreditan al saldo utilizable de la tarjeta. */
  montoBase: number;
  telefono: string;
  banco: string;
  referencia: string;
}

/** Orden de transferir saldo entre dos plásticos. */
export interface TransferenciaNueva {
  /** Serial de la tarjeta que entrega el saldo. */
  origen: string;
  /** Serial de la tarjeta que lo recibe. */
  destino: string;
  /** Bs enteros: el chip no admite céntimos. */
  monto: number;
  /** PIN de la cuenta dueña de la tarjeta de origen. */
  pin: string;
  /** Clave de idempotencia: un reintento devuelve el mismo comprobante. */
  clave: string;
}

export interface TransferenciaLado {
  serial: string;
  /** Saldo después de aplicar la transferencia. */
  saldo: number;
  /** Titular enmascarado del destino: "Ana S.". */
  titular?: string;
}

export interface Transferencia {
  id: string;
  clave: string;
  monto: number;
  at: string;
  origen: TransferenciaLado;
  destino: TransferenciaLado;
}

export interface ResultadoTransferencia {
  transferencia: Transferencia;
  /** Movimiento de salida en la tarjeta de origen. */
  movimiento?: Movimiento;
  /** true cuando la clave ya se había aplicado y no se repitió el cargo. */
  repetida: boolean;
}

/** Banco emisor venezolano del directorio oficial (SUDEBAN). */
export interface Banco {
  codigo: string;
  nombre: string;
}

export const BANCOS: Banco[] = [
  { codigo: "0102", nombre: "Banco de Venezuela, S.A." },
  { codigo: "0104", nombre: "Banco Venezolano de Crédito" },
  { codigo: "0105", nombre: "Banco Mercantil" },
  { codigo: "0108", nombre: "BBVA Provincial" },
  { codigo: "0114", nombre: "Bancaribe" },
  { codigo: "0115", nombre: "Banco Exterior" },
  { codigo: "0128", nombre: "Banco Caroní" },
  { codigo: "0134", nombre: "Banesco Banco Universal" },
  { codigo: "0137", nombre: "Banco Sofitasa" },
  { codigo: "0138", nombre: "Banco Plaza" },
  { codigo: "0146", nombre: "Bangente" },
  { codigo: "0149", nombre: "Banco del Pueblo Soberano" },
  { codigo: "0151", nombre: "Banco Fondo Común (BFC)" },
  { codigo: "0156", nombre: "100% Banco" },
  { codigo: "0157", nombre: "DelSur Banco Universal" },
  { codigo: "0163", nombre: "Banco del Tesoro" },
  { codigo: "0166", nombre: "Banco Agrícola de Venezuela" },
  { codigo: "0168", nombre: "Bancrecer" },
  { codigo: "0169", nombre: "Mi Banco (Banco Microfinanciero)" },
  { codigo: "0171", nombre: "Banco Activo" },
  { codigo: "0172", nombre: "Bancamiga Banco Universal" },
  { codigo: "0173", nombre: "Banco Internacional de Desarrollo" },
  { codigo: "0175", nombre: "Banco Digital de los Trabajadores / Banco Bicentenario" },
  { codigo: "0177", nombre: "BANFANB (Banco de la Fuerza Armada Nacional Bolivariana)" },
  { codigo: "0178", nombre: "N58 Banco Digital" },
  { codigo: "0190", nombre: "Citibank N.A." },
  { codigo: "0191", nombre: "Banco Nacional de Crédito (BNC)" },
  { codigo: "0601", nombre: "Instituto Municipal de Crédito Popular" },
];

export function bancoPorCodigo(codigo: string): Banco | undefined {
  return BANCOS.find((banco) => banco.codigo === codigo);
}

export function bancoPorNombre(nombre: string): Banco | undefined {
  return BANCOS.find((banco) => banco.nombre === nombre);
}

/**
 * Fuente de fondos con la que el pasajero paga sus recargas. No siempre es la
 * misma persona de la cuenta: un familiar puede fondear la billetera.
 */
export interface DatosPago {
  /** true cuando usa el teléfono y la cédula del registro. */
  propio: boolean;
  /** Nombre del banco del directorio; "" mientras no se elige. */
  banco: string;
  /** 11 dígitos sin guiones. */
  telefono: string;
  /** Cédula del titular de la cuenta bancaria: 6 a 8 dígitos. */
  cedula: string;
}

/**
 * Cuenta de Pago Móvil guardada: los mismos datos más un id estable y la
 * marca de cuál es la que trae la recarga.
 */
export interface CuentaPago extends DatosPago {
  /** Identificador devuelto por la base; en el modo local se genera al crearla. */
  id: string;
  /** Solo una por pasajero; Recargar la trae por defecto. */
  principal: boolean;
}

/** Tope de cuentas guardables: no es una billetera infinita de terceros. */
export const MAXIMO_CUENTAS_PAGO = 10;

/** Cuenta matriz del pasajero: identidad y fuentes de pago. */
export interface Cuenta {
  nombres: string;
  apellidos: string;
  /** Documento de identidad: 6 a 8 dígitos. */
  cedula: string;
  /** 11 dígitos sin guiones. */
  telefono: string;
  correo: string;
  /** Ordenadas con la principal delante; la que usa la recarga es la primera. */
  cuentasPago: CuentaPago[];
}

export interface CuentaNueva {
  nombres: string;
  apellidos: string;
  cedula: string;
  telefono: string;
  correo: string;
  pin: string;
  datosPago: DatosPago;
}

/** Respuesta de entrar/registrar: la cuenta, su billetera y un token. */
export interface Sesion {
  token: string;
  cuenta: Cuenta;
  tarjetas: Tarjeta[];
}

/**
 * Datos de Pago Móvil que el Admin configura para recibir recargas. Van sin
 * titular: el pasajero transfiere a un banco, un teléfono y un documento.
 */
export interface DatosPagoMovil {
  banco: string;
  /** C.I. o RIF afiliado al Pago Móvil, tal cual lo pide el banco emisor. */
  rif: string;
  telefono: string;
}

export interface Ajustes {
  pagoMovil: DatosPagoMovil;
  /** Tope de saldo por transferencia entre tarjetas, en Bs. */
  topeTransferencia: number;
  /** Tope de saldo transferido por cuenta en 24 h, en Bs. */
  topeTransferenciaDiario: number;
  /** Parámetros del motor tarifario (BLINK-DOC-19). */
  tarifario: ParametrosTarifarios;
  /** Canal de atención al cliente. */
  atencion: string;
}

export const AJUSTES_POR_DEFECTO: Ajustes = {
  pagoMovil: {
    banco: "Banco Nacional de Crédito",
    rif: "34201580",
    telefono: "0424-6603660",
  },
  topeTransferencia: 5000,
  topeTransferenciaDiario: 20000,
  tarifario: TARIFARIO_POR_DEFECTO,
  atencion: "support@blink.com.ve",
};
