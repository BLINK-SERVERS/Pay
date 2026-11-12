import type {
  Ajustes,
  Cuenta,
  CuentaPago,
  DatosPago,
  Movimiento,
  PaginaMovimientos,
  RecargaNueva,
  ResultadoTransferencia,
  Sesion,
  Tarjeta,
  TransferenciaNueva,
} from "./tipos";
import { AJUSTES_POR_DEFECTO } from "./tipos";
import { ErrorBlink, type CodigoError, type Repositorio } from "./local";
import { formatearCedula } from "./formato";
import {
  copiaDe,
  guardarCopia,
  guardarMovimientos,
  movimientosDe,
  olvidarCopia,
} from "./offline";

// Cliente mínimo de Supabase por REST. No se usa `supabase-js` porque la app
// solo necesita las llamadas RPC del portal: así el bundle no carga la
// librería de auth ni la de realtime (más de 100 KB).
//
// Las credenciales son la URL del proyecto y la llave pública (anon /
// publishable). La llave de servicio NUNCA viaja al navegador: las funciones
// `bt_*` son `security definer` y viven en Postgres.

const URL_BASE = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, "");
const LLAVE = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const nubeConfigurada = Boolean(URL_BASE && LLAVE);

function sinRed(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

const CODIGOS: CodigoError[] = [
  "credenciales",
  "bloqueada",
  "sin-tarjeta",
  "sin-enrolar",
  "ya-activada",
  "pin-invalido",
  "duplicada",
  "datos",
  "red",
  "sesion",
];

interface ErrorRpc {
  code?: string;
  message?: string;
  details?: string;
}

interface ErrorDeDominio {
  error: string;
  mensaje?: string;
}

/** ErrorBlink con la pista de PostgREST para distinguir una RPC ausente. */
type ErrorRpcBlink = ErrorBlink & { estado?: number; codigoPostgrest?: string };

function funcionAusente(error: unknown): boolean {
  if (!(error instanceof ErrorBlink)) return false;
  const rpcError = error as ErrorRpcBlink;
  return rpcError.estado === 404 || rpcError.codigoPostgrest === "PGRST202";
}

/** null = aún no se sabe; false = servidor sin la RPC paginada (0026). */
let paginacionServidor: boolean | null = null;

function esErrorDeDominio(valor: unknown): valor is ErrorDeDominio {
  return (
    typeof valor === "object" &&
    valor !== null &&
    "error" in valor &&
    typeof (valor as ErrorDeDominio).error === "string"
  );
}

async function rpc<T>(funcion: string, argumentos: Record<string, unknown>): Promise<T> {
  // Sin límite, una petición que no responde deja la interfaz girando para
  // siempre; a partir de 20 s se libera con un aviso de conexión.
  const corte = new AbortController();
  const reloj = setTimeout(() => corte.abort(), 20_000);
  let respuesta: Response;
  try {
    respuesta = await fetch(`${URL_BASE}/rest/v1/rpc/${funcion}`, {
      method: "POST",
      headers: {
        apikey: LLAVE ?? "",
        Authorization: `Bearer ${LLAVE ?? ""}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        // PostgREST resuelve contra el primer esquema expuesto; si ese esquema
        // no es `public` las funciones bt_* devuelven PGRST202/PGRST205.
        "Accept-Profile": "public",
        "Content-Profile": "public",
      },
      body: JSON.stringify(argumentos),
      signal: corte.signal,
    });
  } catch {
    if (corte.signal.aborted) {
      throw new ErrorBlink(
        "red",
        "Blink tardó demasiado en responder. Revisa tu conexión e inténtalo otra vez."
      );
    }
    throw new ErrorBlink("red", "Sin conexión con Blink. Revisa tu internet e inténtalo otra vez.");
  } finally {
    clearTimeout(reloj);
  }

  if (!respuesta.ok) {
    const detalle = (await respuesta.json().catch(() => ({}))) as ErrorRpc;
    const mensaje = detalle.message ?? "";
    const codigo = CODIGOS.find((c) => mensaje.includes(`bt:${c}`));
    if (codigo) {
      throw new ErrorBlink(codigo, mensaje.replace(`bt:${codigo}:`, "").trim());
    }
    const fallo = new ErrorBlink(
      "red",
      "Blink no está disponible en este momento. Intenta más tarde."
    ) as ErrorRpcBlink;
    fallo.estado = respuesta.status;
    fallo.codigoPostgrest = detalle.code;
    throw fallo;
  }

  const datos = (await respuesta.json()) as unknown;

  // Los fallos que deben dejar rastro en la base (intentos de PIN) vuelven
  // como dato, no como error HTTP: así la función puede confirmar su escritura.
  if (esErrorDeDominio(datos)) {
    const codigo = CODIGOS.find((c) => c === datos.error);
    throw new ErrorBlink(
      codigo ?? "red",
      datos.mensaje ?? "Blink no está disponible en este momento. Intenta más tarde."
    );
  }

  return datos as T;
}

interface CuentaRpc {
  nombres: string;
  apellidos: string;
  cedula: string;
  telefono: string;
  correo: string;
  cuentasPago?: CuentaPago[];
  /** Espejo de la principal que la base dejó por la app ya publicada. */
  datosPago?: DatosPago;
}

/**
 * La lista siempre viene de `bt_cuentas_pago`. Si la base todavía no tiene la
 * migración de cuentas aplicadas, el espejo plano es la única fuente que
 * existe, así que se presenta como cuenta principal.
 */
function aCuentasPago(datos: CuentaRpc): CuentaPago[] {
  if (datos.cuentasPago?.length) {
    return datos.cuentasPago.map((pago) => ({ ...pago, cedula: formatearCedula(pago.cedula) }));
  }
  if (!datos.datosPago) return [];
  return [{ id: "principal", principal: true, ...datos.datosPago }];
}

function aCuenta(datos: CuentaRpc): Cuenta {
  return {
    nombres: datos.nombres,
    apellidos: datos.apellidos,
    cedula: formatearCedula(datos.cedula),
    telefono: datos.telefono,
    correo: datos.correo,
    cuentasPago: aCuentasPago(datos),
  };
}

interface BilleteraRpc {
  token: string;
  cuenta: CuentaRpc;
  tarjetas: Tarjeta[];
}

function aSesion(datos: BilleteraRpc): Sesion {
  return { token: datos.token, cuenta: aCuenta(datos.cuenta), tarjetas: datos.tarjetas };
}

function aSesionGuardada(datos: BilleteraRpc): Sesion {
  const sesion = aSesion(datos);
  guardarCopia(sesion);
  return sesion;
}

export const repositorioNube: Repositorio = {
  modo: "nube",

  entrar(cedula, pin) {
    return rpc<BilleteraRpc>("bt_entrar", {
      p_cedula: formatearCedula(cedula),
      p_pin: pin,
    }).then(aSesionGuardada);
  },

  registrar(cuenta) {
    return rpc<BilleteraRpc>("bt_registrar", {
      p_nombres: cuenta.nombres,
      p_apellidos: cuenta.apellidos,
      p_cedula: formatearCedula(cuenta.cedula),
      p_telefono: cuenta.telefono,
      p_correo: cuenta.correo,
      p_pin: cuenta.pin,
      p_pago_propio: cuenta.datosPago.propio,
      p_pago_banco: cuenta.datosPago.banco,
      p_pago_telefono: cuenta.datosPago.telefono,
      p_pago_cedula: formatearCedula(cuenta.datosPago.cedula),
    }).then(aSesionGuardada);
  },

  async sesion(token) {
    if (sinRed()) {
      const copia = copiaDe(token);
      if (copia) return copia;
    }
    try {
      const datos = await rpc<Omit<BilleteraRpc, "token">>("bt_sesion", { p_token: token });
      const sesion = aSesion({ ...datos, token });
      guardarCopia(sesion);
      return sesion;
    } catch (error) {
      if (error instanceof ErrorBlink && error.codigo === "red") {
        const copia = copiaDe(token);
        if (copia) return copia;
      }
      if (error instanceof ErrorBlink && error.codigo === "sesion") {
        olvidarCopia(token);
      }
      throw error;
    }
  },

  async vincular(token, serial) {
    const datos = await rpc<Omit<BilleteraRpc, "token">>("bt_vincular", {
      p_token: token,
      p_serial: serial,
    });
    const sesion = { token, cuenta: aCuenta(datos.cuenta), tarjetas: datos.tarjetas };
    guardarCopia(sesion);
    return sesion;
  },

  async movimientos(token, serial, opciones = {}) {
    const limite = Math.min(Math.max(opciones.limite ?? 30, 1), 100);
    const desplazamiento = Math.max(opciones.desplazamiento ?? 0, 0);

    function pedir(argumentos: Record<string, unknown>) {
      return rpc<{ movimientos: Movimiento[]; hayMas?: boolean }>(
        "bt_movimientos",
        argumentos
      );
    }

    try {
      let datos;
      if (paginacionServidor !== false) {
        try {
          datos = await pedir({
            p_token: token,
            p_serial: serial,
            p_limite: limite,
            p_desplazamiento: desplazamiento,
          });
          paginacionServidor = true;
        } catch (error) {
          // La RPC paginada llega con la migración 0026; la anterior sigue
          // sirviendo mientras no esté aplicada.
          if (!funcionAusente(error)) throw error;
          paginacionServidor = false;
        }
      }

      if (!datos) {
        // Servidor anterior a 0026: el extracto completo de una sola vez,
        // como antes de paginar. Sin botón de «ver anteriores».
        if (desplazamiento > 0) {
          const guardados = movimientosDe(token, serial);
          return guardados
            ? {
                movimientos: guardados.slice(desplazamiento, desplazamiento + limite),
                hayMas: guardados.length > desplazamiento + limite,
              }
            : { movimientos: [], hayMas: false };
        }
        datos = await pedir({ p_token: token, p_serial: serial, p_limite: 100 });
        const pagina: PaginaMovimientos = {
          movimientos: datos.movimientos,
          hayMas: false,
        };
        guardarMovimientos(token, serial, pagina.movimientos);
        return pagina;
      }

      const pagina: PaginaMovimientos = {
        movimientos: datos.movimientos,
        hayMas: datos.hayMas ?? datos.movimientos.length === limite,
      };
      if (desplazamiento === 0) guardarMovimientos(token, serial, pagina.movimientos);
      return pagina;
    } catch (error) {
      if (error instanceof ErrorBlink && error.codigo === "red") {
        const guardados = movimientosDe(token, serial);
        if (guardados) {
          return {
            movimientos: guardados.slice(desplazamiento, desplazamiento + limite),
            hayMas: guardados.length > desplazamiento + limite,
          };
        }
      }
      throw error;
    }
  },

  reportarRecarga(token, serial, recarga: RecargaNueva) {
    return rpc<{ movimiento: Movimiento }>("bt_recargar_pasajes", {
      p_token: token,
      p_serial: serial,
      p_pasajes: recarga.pasajes,
      p_telefono: recarga.telefono,
      p_banco: recarga.banco,
      p_referencia: recarga.referencia,
    }).then((r) => r.movimiento);
  },

  transferir(token, transferencia: TransferenciaNueva) {
    return rpc<ResultadoTransferencia>("bt_transferir_saldo", {
      p_token: token,
      p_origen: transferencia.origen,
      p_destino: transferencia.destino,
      p_monto: transferencia.monto,
      p_pin: transferencia.pin,
      p_clave: transferencia.clave,
    });
  },

  async cambiarPin(token, actual, nuevo) {
    await rpc<null>("bt_cambiar_pin", { p_token: token, p_actual: actual, p_nuevo: nuevo });
  },

  async altaCuentaPago(token, datos) {
    return rpc<{ cuenta: CuentaRpc }>("bt_alta_cuenta_pago", {
      p_token: token,
      p_propio: datos.propio,
      p_banco: datos.banco,
      p_telefono: datos.telefono,
      p_cedula: formatearCedula(datos.cedula),
    }).then((r) => aCuenta(r.cuenta));
  },

  async editarCuentaPago(token, id, datos) {
    return rpc<{ cuenta: CuentaRpc }>("bt_editar_cuenta_pago", {
      p_token: token,
      p_id: id,
      p_propio: datos.propio,
      p_banco: datos.banco,
      p_telefono: datos.telefono,
      p_cedula: formatearCedula(datos.cedula),
    }).then((r) => aCuenta(r.cuenta));
  },

  async borrarCuentaPago(token, id) {
    return rpc<{ cuenta: CuentaRpc }>("bt_borrar_cuenta_pago", {
      p_token: token,
      p_id: id,
    }).then((r) => aCuenta(r.cuenta));
  },

  async usarCuentaPago(token, id) {
    return rpc<{ cuenta: CuentaRpc }>("bt_usar_cuenta_pago", {
      p_token: token,
      p_id: id,
    }).then((r) => aCuenta(r.cuenta));
  },

  crearEnlace(token) {
    return rpc<string>("bt_crear_enlace", { p_token: token });
  },

  reanudar(cedula, llave) {
    return rpc<BilleteraRpc>("bt_reanudar", {
      p_cedula: formatearCedula(cedula),
      p_llave: llave,
    }).then(aSesionGuardada);
  },

  async salir(token) {
    try {
      await rpc<null>("bt_salir", { p_token: token });
    } finally {
      olvidarCopia(token);
    }
  },

  async ajustes() {
    try {
      const remoto = await rpc<Partial<Ajustes>>("bt_ajustes", {});
      return {
        ...AJUSTES_POR_DEFECTO,
        ...remoto,
        pagoMovil: { ...AJUSTES_POR_DEFECTO.pagoMovil, ...remoto.pagoMovil },
        tarifario: { ...AJUSTES_POR_DEFECTO.tarifario, ...remoto.tarifario },
      };
    } catch {
      return AJUSTES_POR_DEFECTO;
    }
  },
};
