import { AJUSTES_POR_DEFECTO, type Ajustes } from "./tipos";

const CLAVE = "blink.tarjeta.ajustes";

/**
 * Parámetros de la línea (Pago Móvil, tope de recarga, atención). Hoy salen
 * del paquete; mañana el Admin los publica en Blink Cloud y esta función los
 * mezcla con la caché local para que la app abra sin esperar red.
 */
export function ajustesPorDefecto(): Ajustes {
  try {
    const crudo = localStorage.getItem(CLAVE);
    if (!crudo) return AJUSTES_POR_DEFECTO;
    const guardado = JSON.parse(crudo) as Partial<Ajustes>;
    return {
      ...AJUSTES_POR_DEFECTO,
      ...guardado,
      pagoMovil: { ...AJUSTES_POR_DEFECTO.pagoMovil, ...guardado.pagoMovil },
      tarifario: { ...AJUSTES_POR_DEFECTO.tarifario, ...guardado.tarifario },
    };
  } catch {
    return AJUSTES_POR_DEFECTO;
  }
}
