// Formato venezolano: bolívares enteros, fechas cortas y máscaras.

const bs = new Intl.NumberFormat("es-VE", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const bsSinDecimales = bs;

/** 1250 → "Bs 1.250" (el sistema no maneja céntimos) */
export function formatearBs(monto: number): string {
  return `Bs ${bs.format(Number.isFinite(monto) ? monto : 0)}`;
}

/** 1250 → "1.250" (montos enteros para chips y resúmenes) */
export function formatearEntero(monto: number): string {
  return bsSinDecimales.format(Number.isFinite(monto) ? monto : 0);
}

/** Separa el monto para animarlo: entero y, si existe, la parte decimal. */
export function partesBs(monto: number): { entero: string; decimal: string } {
  const valor = Number.isFinite(monto) ? Math.abs(monto) : 0;
  const entero = Math.floor(valor);
  const decimal = Math.round((valor - entero) * 100);
  return {
    entero: bsSinDecimales.format(entero),
    decimal: decimal === 0 ? "" : String(decimal).padStart(2, "0"),
  };
}

const fechaCorta = new Intl.DateTimeFormat("es-VE", {
  day: "2-digit",
  month: "short",
});

const fechaLarga = new Intl.DateTimeFormat("es-VE", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

const hora = new Intl.DateTimeFormat("es-VE", {
  hour: "2-digit",
  minute: "2-digit",
});

/** "Hoy · 08:12", "Ayer · 19:40" o "12 oct · 07:05". */
export function formatearMovimiento(at: string): string {
  const fecha = new Date(at);
  if (Number.isNaN(fecha.getTime())) return "—";
  const hoy = new Date();
  const ayer = new Date();
  ayer.setDate(hoy.getDate() - 1);
  const mismoDia = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  const dia = mismoDia(fecha, hoy)
    ? "Hoy"
    : mismoDia(fecha, ayer)
      ? "Ayer"
      : fechaCorta.format(fecha).replace(".", "");
  return `${dia} · ${hora.format(fecha)}`;
}

/** "08:12", sin el día: para filas ya agrupadas por fecha. */
export function formatearHora(at: string): string {
  const fecha = new Date(at);
  if (Number.isNaN(fecha.getTime())) return "—";
  return hora.format(fecha);
}

const diaSemana = new Intl.DateTimeFormat("es-VE", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

/** Encabezado de grupo del extracto: "Hoy", "Ayer", "lunes, 12 de octubre". */
export function etiquetaDia(at: string): string {
  const fecha = new Date(at);
  if (Number.isNaN(fecha.getTime())) return "Sin fecha";
  const hoy = new Date();
  const ayer = new Date();
  ayer.setDate(hoy.getDate() - 1);
  const mismoDia = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  if (mismoDia(fecha, hoy)) return "Hoy";
  if (mismoDia(fecha, ayer)) return "Ayer";
  const texto = diaSemana.format(fecha);
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export function formatearFecha(iso: string): string {
  const fecha = new Date(iso);
  return Number.isNaN(fecha.getTime()) ? "—" : fechaLarga.format(fecha);
}

/** Mes y año del vencimiento: "10/31" a la usanza de las tarjetas. */
export function formatearVence(iso: string): string {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return "—";
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  const anio = String(fecha.getFullYear()).slice(-2);
  return `${mes}/${anio}`;
}

// --- Máscaras de entrada ---

export function soloDigitos(texto: string): string {
  return texto.replace(/\D/g, "");
}

/**
 * Máscara de la serie T-LLLLL-UUU-V mientras se escribe.
 * G00001001N → G-00001-001-N; tolera guiones y minúsculas.
 */
export function formatearSerial(texto: string): string {
  const limpio = texto.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!limpio) return "";

  const letra = limpio.slice(0, 1).replace(/[^AGE]/, "");
  const cuerpo = letra ? limpio.slice(1) : limpio;
  const digitos = cuerpo.replace(/\D/g, "").slice(0, 8);
  const verificadora = cuerpo.replace(/\d/g, "").slice(0, 1);

  let salida = letra;
  if (digitos) salida += (salida ? "-" : "") + digitos.slice(0, 5);
  if (digitos.length > 5) salida += "-" + digitos.slice(5, 8);
  if (verificadora) salida += (salida ? "-" : "") + verificadora;
  return salida;
}

/** G-00001-001-N → G00001001N (lo que llevan el chip y el Code 128). */
export function serialCompacto(serial: string): string {
  return serial.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Cédula como se guarda y se muestra: solo dígitos, hasta 8. */
export function formatearCedula(texto: string): string {
  return soloDigitos(texto).slice(0, 8);
}

/** 04141234567 → 0414-1234567 */
export function formatearTelefono(texto: string): string {
  const digitos = soloDigitos(texto).slice(0, 11);
  if (digitos.length <= 4) return digitos;
  return `${digitos.slice(0, 4)}-${digitos.slice(4)}`;
}

/** Nombre del titular como se imprime en el plástico: nombre y apellido. */
export function nombreTarjeta(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  if (partes.length <= 1) return (partes[0] ?? "").toUpperCase();
  return `${partes[0]} ${partes[partes.length - 1]}`.toUpperCase();
}

/** Iniciales para el avatar del perfil. */
export function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "BL";
  const primera = partes[0][0] ?? "";
  const segunda = partes.length > 1 ? partes[partes.length - 1][0] ?? "" : "";
  return (primera + segunda).toUpperCase();
}

/** "María Fernanda Fernández": nombres y apellidos de la cuenta. */
export function nombreCompleto(nombres: string, apellidos: string): string {
  return `${nombres.trim()} ${apellidos.trim()}`.trim();
}
