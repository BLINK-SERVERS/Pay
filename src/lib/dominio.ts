import type { CuentaPago, DatosPago, Movimiento } from "./tipos";
import { bancoPorNombre } from "./tipos.ts";
import { formatearTelefono, soloDigitos } from "./formato.ts";

export interface BorradorRecarga {
  /** Cantidad de pasajes escrita o elegida, como texto de formulario. */
  pasajes: string;
  telefono: string;
  banco: string;
  referencia: string;
}

export type CampoRecarga = keyof BorradorRecarga;

export const CAMPOS_RECARGA: CampoRecarga[] = ["pasajes", "telefono", "banco", "referencia"];

export type ErroresRecarga = Partial<Record<CampoRecarga, string>>;

/** Cédula del pasajero: solo dígitos, entre 6 y 8. */
export function validarCedula(texto: string): string | null {
  if (/[^\d\s.-]/.test(texto)) return "Escribe la cédula solo con números.";
  const digitos = soloDigitos(texto);
  if (digitos.length < 6) return "La cédula debe tener al menos 6 dígitos.";
  if (digitos.length > 8) return "La cédula no puede tener más de 8 dígitos.";
  return null;
}

/** PIN de 6 dígitos, sin secuencias ni repeticiones obvias. */
export function validarPin(pin: string): string | null {
  if (!/^\d{6}$/.test(pin)) return "El PIN debe tener 6 dígitos.";
  if (/^(\d)\1{5}$/.test(pin)) return "No uses el mismo dígito seis veces.";
  const ascendente = "0123456789";
  const descendente = "9876543210";
  for (let i = 0; i + 6 <= 10; i += 1) {
    if (ascendente.slice(i, i + 6) === pin || descendente.slice(i, i + 6) === pin) {
      return "Evita secuencias como 123456 o 987654.";
    }
  }
  return null;
}

const NOMBRE = /^\p{L}[\p{L}\s'.-]{1,59}$/u;

/** Nombres y apellidos como aparecen en la cédula. */
export function validarNombre(texto: string, campo: "nombre" | "apellido"): string | null {
  const limpio = texto.trim();
  if (!limpio) {
    return campo === "nombre" ? "Escribe tus nombres." : "Escribe tus apellidos.";
  }
  if (!NOMBRE.test(limpio)) {
    return "Solo letras, espacios, guiones y apóstrofos (2 a 60 caracteres).";
  }
  return null;
}

/** Correo para notificaciones y recuperación de acceso. */
export function validarCorreo(texto: string): string | null {
  const limpio = texto.trim();
  if (!limpio) return "Escribe un correo electrónico.";
  if (limpio.length > 120) return "El correo es demasiado largo.";
  if (!/^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(limpio)) {
    return "Revisa el correo: falta la arroba o el dominio.";
  }
  return null;
}

/** Teléfono móvil venezolano de 11 dígitos que empieza por 0. */
export function validarTelefono(texto: string): string | null {
  if (!/^0\d{10}$/.test(soloDigitos(texto))) {
    return "Escribe el teléfono con 11 dígitos (0414-1234567).";
  }
  return null;
}

export type CampoPago = "banco" | "telefono" | "cedula";
export type ErroresPago = Partial<Record<CampoPago, string>>;

/**
 * Datos de la cuenta bancaria desde la que se fondea la billetera. El banco
 * puede quedar vacío mientras el pasajero usa los datos del registro; en la
 * recarga se le pide elegirlo.
 */
export function erroresDatosPago(datos: DatosPago): ErroresPago {
  const errores: ErroresPago = {};
  if (datos.banco && !bancoPorNombre(datos.banco)) {
    errores.banco = "Selecciona un banco del directorio oficial.";
  }
  const telefono = validarTelefono(datos.telefono);
  if (telefono) errores.telefono = telefono;
  const cedula = validarCedula(datos.cedula);
  if (cedula) errores.cedula = cedula;
  return errores;
}

/**
 * Alta o edición de una cuenta guardada. A diferencia del formulario de la
 * recarga, aquí el banco sí es obligatorio cuando los datos son de otra
 * persona: sin banco la fila no sirve para identificar de dónde viene la plata.
 */
export function erroresCuentaPago(datos: DatosPago): ErroresPago {
  const errores = erroresDatosPago(datos);
  if (!datos.banco) {
    errores.banco = "Selecciona el banco de esa cuenta de Pago Móvil.";
  }
  return errores;
}

/** La cuenta que Recargar trae por defecto; tolera listas sin la marca. */
export function cuentaPrincipal(cuentas: CuentaPago[]): CuentaPago | undefined {
  return cuentas.find((cuenta) => cuenta.principal) ?? cuentas[0];
}

/** Texto corto de una cuenta guardada: banco y teléfono, legible en una fila. */
export function etiquetaCuentaPago(cuenta: CuentaPago): string {
  const banco = cuenta.banco || "Banco por definir";
  return `${banco} · ${formatearTelefono(cuenta.telefono)}`;
}

/** Alfabeto seguro de 23 letras (sin I, O, Q) para el verificador. */
const ALFABETO_VERIFICADOR = "ABCDEFGHJKLMNPRSTUVWXYZ";

/**
 * Letra verificadora del ID Blink (Luhn mod 23, ISO/IEC 7064).
 * Toma el ASCII de la letra de tarifa (A=65, E=69, G=71) seguido de los
 * 8 dígitos, duplica las posiciones pares contadas desde la derecha y
 * busca el residuo módulo 23. G00001001 → N.
 */
export function letraLuhn(base: string): string {
  const limpio = base.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!/^[AGE][0-9]{8}$/.test(limpio)) {
    throw new Error("La base del ID Blink debe ser A/G/E + 8 dígitos.");
  }

  const numeros = String(limpio.charCodeAt(0)).padStart(2, "0") + limpio.slice(1);
  let suma = 0;
  for (let i = 0; i < numeros.length; i++) {
    let valor = Number(numeros[i]);
    if ((numeros.length - i) % 2 === 1) {
      valor *= 2;
      if (valor > 9) valor -= 9;
    }
    suma += valor;
  }
  return ALFABETO_VERIFICADOR[suma % 23];
}

/** Serial impreso en el plástico: T-LLLLL-UUU-V con letra verificadora. */
export function validarSerial(texto: string): string | null {
  const limpio = texto.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!/^[AGE][0-9]{8}[A-HJ-NPR-Z]$/.test(limpio)) {
    return "El serial tiene el formato G-00001-001-N. Revísalo en el reverso de la tarjeta.";
  }
  if (letraLuhn(limpio.slice(0, 9)) !== limpio.slice(9)) {
    return "La letra final del serial no coincide. Revísala en el reverso de la tarjeta.";
  }
  return null;
}

/** Cuántos pasajes caben en un saldo, a la tarifa vigente. */
export function pasajesEquivalentes(saldo: number, tarifa: number): number {
  if (!Number.isFinite(tarifa) || tarifa <= 0) return 0;
  return Math.max(0, Math.floor(saldo / tarifa));
}

export type PerfilTarifa = "GENERAL" | "ESTUDIANTE";

/**
 * La letra inicial del serial identifica el perfil tarifario:
 * G general, E estudiante / tercera edad, A Alfa del propietario.
 */
export function perfilTarifa(serial: string): PerfilTarifa {
  const letra = serial.trim().toUpperCase().slice(0, 1);
  return letra === "E" ? "ESTUDIANTE" : "GENERAL";
}

/** Bs que aún alcanzan para N pasajes (para el bloque "te alcanza para"). */
export function saldoParaPasajes(saldo: number, tarifa: number, pasajes: number): boolean {
  return saldo >= tarifa * pasajes;
}

/** Errores por campo del reporte de recarga, listos para pintar bajo cada input. */
export function erroresRecarga(
  borrador: BorradorRecarga
): ErroresRecarga {
  const errores: ErroresRecarga = {};

  const pasajes = Number(borrador.pasajes);
  if (borrador.pasajes.trim() === "") {
    errores.pasajes = "Elige cuántos pasajes quieres recargar.";
  } else if (!Number.isInteger(pasajes) || pasajes < 1) {
    errores.pasajes = "Escribe una cantidad entera de pasajes (1 o más).";
  }

  if (!/^0\d{10}$/.test(soloDigitos(borrador.telefono))) {
    errores.telefono = "El teléfono debe tener 11 dígitos y empezar por 0 (ej. 0414-1234567).";
  }

  if (!borrador.banco) {
    errores.banco = "Selecciona el banco emisor.";
  }

  if (!/^\d{4}$/.test(soloDigitos(borrador.referencia))) {
    errores.referencia = "Escribe los últimos 4 dígitos de la referencia.";
  }

  return errores;
}

/**
 * Un pago vigente no se puede reportar dos veces: misma referencia en el
 * mismo banco sigue pendiente o ya fue aprobado. Si fue rechazado, se
 * permite corregirlo y volver a reportar.
 */
export function buscarRecargaDuplicada(
  movimientos: Movimiento[],
  consulta: { banco: string; referencia: string }
): Movimiento | null {
  const referencia = soloDigitos(consulta.referencia).slice(-4);
  return (
    movimientos.find(
      (movimiento) =>
        movimiento.tipo === "recarga" &&
        movimiento.banco === consulta.banco &&
        movimiento.referencia === referencia &&
        movimiento.estado !== "rechazado"
    ) ?? null
  );
}
