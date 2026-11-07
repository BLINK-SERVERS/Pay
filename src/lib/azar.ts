// Identificadores aleatorios disponibles también fuera de un contexto
// seguro: `crypto.randomUUID` solo existe sobre HTTPS o localhost, y la
// demostración se abre por HTTP en algunos navegadores.

function bytes(cantidad: number): Uint8Array {
  const salida = new Uint8Array(cantidad);
  crypto.getRandomValues(salida);
  return salida;
}

function hex(datos: Uint8Array): string {
  return Array.from(datos, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** UUID v4 con la misma forma que `crypto.randomUUID()`. */
export function idAleatorio(): string {
  if (typeof crypto.randomUUID === "function") {
    try {
      return crypto.randomUUID();
    } catch {
      // Sin contexto seguro: se arma a mano.
    }
  }
  const datos = bytes(16);
  datos[6] = (datos[6] & 0x0f) | 0x40;
  datos[8] = (datos[8] & 0x3f) | 0x80;
  const h = hex(datos);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Secreto base64url de 32 bytes. */
export function secretoAleatorio(): string {
  const datos = bytes(32);
  let binario = "";
  for (let i = 0; i < datos.length; i += 1) binario += String.fromCharCode(datos[i]);
  return btoa(binario).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
