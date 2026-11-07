import type { Sesion } from "./tipos";
import { soloDigitos } from "./formato";

// Acceso con la huella o el rostro del teléfono mediante WebAuthn. La
// credencial la crea y la guarda el autenticador de plataforma (Face ID,
// Touch ID, huella en Android, Windows Hello); la app solo conserva su
// identificador y el token de la sesión ya autenticada.
//
// La biometría no sustituye al PIN: desbloquea la sesión guardada en este
// dispositivo mientras siga vigente (12 h). Pasado ese plazo, tras cerrar
// sesión o al cambiar de teléfono, se vuelve a pedir el PIN.

export const CLAVE_BIOMETRIA = "blink.tarjeta.biometria.v1";
export const CLAVE_OFRECIDA = "blink.tarjeta.biometria.ofrecida.v1";

const VIGENCIA_MS = 12 * 60 * 60 * 1000;
// Tolerancia al reloj del teléfono: una fecha muy futura se considera
// manipulada y se descarta el token, igual que en la copia sin conexión.
const DESFASE_MS = 5 * 60 * 1000;
const MAX_OFERTAS = 8;
const BASE64URL = /^[A-Za-z0-9_-]+$/;

export interface RegistroBiometria {
  cedula: string;
  nombre: string;
  /** Identificador base64url de la credencial WebAuthn. */
  credencial: string;
  /** Token de sesión que desbloquea; vacío si hay que entrar con PIN. */
  token: string;
  /** Vencimiento del token (epoch en ms); 0 si no hay token. */
  expira: number;
  alta: number;
}

export type CodigoBiometria =
  | "no-soportado"
  | "cancelado"
  | "sin-registro"
  | "expirada"
  | "credencial"
  | "dispositivo";

export class ErrorBiometria extends Error {
  constructor(
    public codigo: CodigoBiometria,
    mensaje: string
  ) {
    super(mensaje);
    this.name = "ErrorBiometria";
  }
}

export function mensajeBiometria(error: unknown): string {
  if (error instanceof ErrorBiometria) return error.message;
  return "No pudimos verificar tu huella o rostro. Inténtalo otra vez o entra con tu PIN.";
}

function almacen(valor?: Storage): Storage | null {
  if (valor) return valor;
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function esNumero(valor: unknown): valor is number {
  return typeof valor === "number" && Number.isFinite(valor);
}

function aBase64Url(datos: ArrayBuffer | Uint8Array): string {
  const bytes = datos instanceof Uint8Array ? datos : new Uint8Array(datos);
  let binario = "";
  for (let i = 0; i < bytes.length; i += 1) binario += String.fromCharCode(bytes[i]);
  return btoa(binario).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function deBase64Url(texto: string): Uint8Array<ArrayBuffer> {
  const normalizado = texto.replace(/-/g, "+").replace(/_/g, "/");
  const relleno = "=".repeat((4 - (normalizado.length % 4)) % 4);
  const binario = atob(normalizado + relleno);
  const bytes = new Uint8Array(new ArrayBuffer(binario.length));
  for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

function escribir(registro: RegistroBiometria, deposito?: Storage): void {
  const guardado = almacen(deposito);
  if (!guardado) return;
  try {
    guardado.setItem(CLAVE_BIOMETRIA, JSON.stringify(registro));
  } catch {
    // Sin espacio o almacenamiento bloqueado: la biometría no queda activa.
  }
}

export function leerRegistroBiometria(deposito?: Storage): RegistroBiometria | null {
  const guardado = almacen(deposito);
  if (!guardado) return null;

  let crudo: string | null;
  try {
    crudo = guardado.getItem(CLAVE_BIOMETRIA);
  } catch {
    return null;
  }
  if (!crudo) return null;

  try {
    const datos = JSON.parse(crudo) as Partial<RegistroBiometria>;
    const formaValida =
      typeof datos.cedula === "string" &&
      datos.cedula.length > 0 &&
      typeof datos.nombre === "string" &&
      typeof datos.credencial === "string" &&
      BASE64URL.test(datos.credencial) &&
      typeof datos.token === "string" &&
      esNumero(datos.expira) &&
      esNumero(datos.alta);
    if (!formaValida) {
      guardado.removeItem(CLAVE_BIOMETRIA);
      return null;
    }

    const ahora = Date.now();
    const registro: RegistroBiometria = {
      cedula: datos.cedula as string,
      nombre: datos.nombre as string,
      credencial: datos.credencial as string,
      token: datos.token as string,
      expira: datos.expira as number,
      alta: datos.alta as number,
    };

    // Una credencial con fecha de alta en el futuro no puede ser nuestra.
    if (registro.alta > ahora + DESFASE_MS) {
      guardado.removeItem(CLAVE_BIOMETRIA);
      return null;
    }

    const incoherente =
      (registro.token === "") !== (registro.expira === 0) ||
      registro.expira > ahora + VIGENCIA_MS + DESFASE_MS ||
      (registro.expira > 0 && registro.expira <= ahora);
    if (incoherente) {
      // La credencial sigue siendo útil para volver a enlazarla tras un
      // acceso con PIN; el token vencido o incoherente se descarta.
      registro.token = "";
      registro.expira = 0;
      escribir(registro, guardado);
    }

    return registro;
  } catch {
    guardado.removeItem(CLAVE_BIOMETRIA);
    return null;
  }
}

export function registroDesbloqueable(
  registro: RegistroBiometria | null,
  ahora = Date.now()
): boolean {
  return Boolean(registro && registro.token.length > 0 && registro.expira > ahora);
}

/**
 * Enlaza el token de un acceso con PIN a la credencial ya registrada. No crea
 * credenciales: para eso está `activarBiometria`.
 */
export function guardarSesionBiometria(
  sesion: Sesion,
  deposito?: Storage
): RegistroBiometria | null {
  const registro = leerRegistroBiometria(deposito);
  if (!registro) return null;
  if (soloDigitos(registro.cedula) !== soloDigitos(sesion.cuenta.cedula)) return null;

  registro.nombre = `${sesion.cuenta.nombres} ${sesion.cuenta.apellidos}`.trim();
  registro.token = sesion.token;
  registro.expira = Date.now() + VIGENCIA_MS;
  escribir(registro, deposito);
  return registro;
}

/** Conserva la credencial pero invalida su token (cierre de sesión). */
export function olvidarTokenBiometria(deposito?: Storage): void {
  const registro = leerRegistroBiometria(deposito);
  if (!registro) return;
  if (!registro.token && !registro.expira) return;
  registro.token = "";
  registro.expira = 0;
  escribir(registro, deposito);
}

/** Borra la vinculación completa con este dispositivo. */
export function olvidarBiometria(deposito?: Storage): void {
  const guardado = almacen(deposito);
  try {
    guardado?.removeItem(CLAVE_BIOMETRIA);
  } catch {
    // Nada que hacer.
  }
}

let soporte: boolean | null = null;

export async function biometriaSoportada(): Promise<boolean> {
  if (soporte !== null) return soporte;
  try {
    if (typeof window === "undefined" || !window.isSecureContext) {
      soporte = false;
      return soporte;
    }
    const navegador = globalThis.PublicKeyCredential;
    if (
      !navegador ||
      typeof navegador.isUserVerifyingPlatformAuthenticatorAvailable !== "function" ||
      !navigator.credentials
    ) {
      soporte = false;
      return soporte;
    }
    soporte = await navegador.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    soporte = false;
  }
  return soporte;
}

function desafio(): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(32));
}

async function idUsuario(cedula: string): Promise<Uint8Array<ArrayBuffer>> {
  const resumen = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(soloDigitos(cedula))
  );
  return new Uint8Array(resumen);
}

function traducir(error: unknown, fase: "alta" | "acceso"): ErrorBiometria {
  const nombre =
    typeof DOMException !== "undefined" && error instanceof DOMException ? error.name : "";
  if (nombre === "NotAllowedError" || nombre === "AbortError") {
    return new ErrorBiometria(
      "cancelado",
      "No se completó la verificación. Toca de nuevo cuando estés listo."
    );
  }
  if (nombre === "InvalidStateError") {
    return new ErrorBiometria(
      "credencial",
      fase === "alta"
        ? "Este teléfono ya tiene una huella registrada para la cuenta."
        : "La huella guardada ya no está disponible. Desactívala y actívala de nuevo en tu perfil."
    );
  }
  if (nombre === "NotSupportedError" || nombre === "SecurityError") {
    return new ErrorBiometria(
      "no-soportado",
      "Este navegador no permite biometría en este momento. Entra con tu PIN."
    );
  }
  return new ErrorBiometria(
    "dispositivo",
    "No pudimos usar la biometría. Entra con tu PIN o inténtalo más tarde."
  );
}

export async function activarBiometria(
  sesion: Sesion,
  deposito?: Storage
): Promise<RegistroBiometria> {
  if (!(await biometriaSoportada())) {
    throw new ErrorBiometria(
      "no-soportado",
      "Este dispositivo no tiene un lector de huella o rostro disponible para la web."
    );
  }

  const previo = leerRegistroBiometria(deposito);
  const mismaCuenta =
    previo !== null && soloDigitos(previo.cedula) === soloDigitos(sesion.cuenta.cedula);
  const nombre = `${sesion.cuenta.nombres} ${sesion.cuenta.apellidos}`.trim();

  // El identificador se deriva de la cédula para que la misma cuenta use el
  // mismo usuario en cualquier teléfono; el autenticador lo limita a 64 B.
  const opciones: PublicKeyCredentialCreationOptions = {
    challenge: desafio(),
    rp: { name: "Blink Pay" },
    user: {
      id: await idUsuario(sesion.cuenta.cedula),
      name: sesion.cuenta.cedula,
      displayName: nombre,
    },
    pubKeyCredParams: [
      { type: "public-key", alg: -7 },
      { type: "public-key", alg: -257 },
    ],
    authenticatorSelection: {
      authenticatorAttachment: "platform",
      userVerification: "required",
      residentKey: "preferred",
    },
    excludeCredentials: mismaCuenta
      ? [{ type: "public-key", id: deBase64Url(previo.credencial) }]
      : [],
    timeout: 60_000,
    attestation: "none",
  };

  let credencial: Credential | null;
  try {
    credencial = await navigator.credentials.create({ publicKey: opciones });
  } catch (error) {
    throw traducir(error, "alta");
  }
  if (!credencial) {
    throw new ErrorBiometria("cancelado", "No se completó el registro de la huella.");
  }

  const publica = credencial as PublicKeyCredential;
  const identificador = publica.id || aBase64Url(publica.rawId);
  if (!identificador || !BASE64URL.test(identificador)) {
    throw new ErrorBiometria(
      "credencial",
      "El teléfono devolvió una credencial que no pudimos guardar."
    );
  }

  const ahora = Date.now();
  const registro: RegistroBiometria = {
    cedula: sesion.cuenta.cedula,
    nombre,
    credencial: identificador,
    token: sesion.token,
    expira: ahora + VIGENCIA_MS,
    alta: ahora,
  };
  escribir(registro, deposito);
  return registro;
}

export async function desbloquearConBiometria(deposito?: Storage): Promise<string> {
  const registro = leerRegistroBiometria(deposito);
  if (!registro) {
    throw new ErrorBiometria(
      "sin-registro",
      "No hay una sesión guardada con biometría en este dispositivo."
    );
  }
  if (!registroDesbloqueable(registro)) {
    throw new ErrorBiometria(
      "expirada",
      "La sesión guardada venció. Entra con tu PIN para renovarla."
    );
  }
  if (!(await biometriaSoportada())) {
    throw new ErrorBiometria(
      "no-soportado",
      "Este navegador no permite biometría en este momento. Entra con tu PIN."
    );
  }

  const opciones: PublicKeyCredentialRequestOptions = {
    challenge: desafio(),
    allowCredentials: [{ type: "public-key", id: deBase64Url(registro.credencial) }],
    userVerification: "required",
    timeout: 60_000,
  };

  let credencial: Credential | null;
  try {
    credencial = await navigator.credentials.get({ publicKey: opciones });
  } catch (error) {
    throw traducir(error, "acceso");
  }
  if (!credencial) {
    throw new ErrorBiometria("cancelado", "No se completó la verificación.");
  }

  const publica = credencial as PublicKeyCredential;
  if (aBase64Url(publica.rawId) !== registro.credencial) {
    throw new ErrorBiometria(
      "credencial",
      "La huella no corresponde a la cuenta guardada. Entra con tu PIN."
    );
  }
  return registro.token;
}

export function ofrecimientoHecho(cedula: string, deposito?: Storage): boolean {
  const guardado = almacen(deposito);
  if (!guardado) return false;
  try {
    const crudo = guardado.getItem(CLAVE_OFRECIDA);
    if (!crudo) return false;
    const lista = JSON.parse(crudo) as unknown;
    if (!Array.isArray(lista)) return false;
    return lista.some(
      (valor) => typeof valor === "string" && soloDigitos(valor) === soloDigitos(cedula)
    );
  } catch {
    return false;
  }
}

export function marcarOfrecimiento(cedula: string, deposito?: Storage): void {
  const guardado = almacen(deposito);
  if (!guardado) return;
  try {
    const crudo = guardado.getItem(CLAVE_OFRECIDA);
    const lista = crudo ? (JSON.parse(crudo) as unknown) : [];
    const cedulas = Array.isArray(lista)
      ? lista.filter((valor): valor is string => typeof valor === "string")
      : [];
    if (cedulas.some((valor) => soloDigitos(valor) === soloDigitos(cedula))) return;
    cedulas.push(cedula);
    guardado.setItem(CLAVE_OFRECIDA, JSON.stringify(cedulas.slice(-MAX_OFERTAS)));
  } catch {
    // Sin almacenamiento no se recuerda la negativa; se volverá a ofrecer.
  }
}
