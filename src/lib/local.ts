import type {
  Ajustes,
  Cuenta,
  CuentaNueva,
  DatosPago,
  EstadoMovimiento,
  Movimiento,
  RecargaNueva,
  ResultadoTransferencia,
  Sesion,
  Tarjeta,
  Transferencia,
  TransferenciaNueva,
} from "./tipos";
import { AJUSTES_POR_DEFECTO } from "./tipos";
import { hashPin, verificarPin } from "./pin";
import { formatearCedula, formatearEntero, formatearSerial, formatearTelefono, soloDigitos } from "./formato";
import { erroresDatosPago, validarPin, validarSerial } from "./dominio";

export type CodigoError =
  | "credenciales"
  | "bloqueada"
  | "sin-tarjeta"
  | "sin-enrolar"
  | "ya-activada"
  | "pin-invalido"
  | "duplicada"
  | "datos"
  | "red"
  | "sesion";

export class ErrorBlink extends Error {
  constructor(
    public codigo: CodigoError,
    mensaje: string
  ) {
    super(mensaje);
    this.name = "ErrorBlink";
  }
}

export interface Repositorio {
  modo: "local" | "nube";
  entrar(cedula: string, pin: string): Promise<Sesion>;
  registrar(cuenta: CuentaNueva): Promise<Sesion>;
  sesion(token: string): Promise<Sesion>;
  vincular(token: string, serial: string): Promise<Sesion>;
  movimientos(token: string, serial: string): Promise<Movimiento[]>;
  reportarRecarga(token: string, serial: string, recarga: RecargaNueva): Promise<Movimiento>;
  transferir(token: string, transferencia: TransferenciaNueva): Promise<ResultadoTransferencia>;
  cambiarPin(token: string, actual: string, nuevo: string): Promise<void>;
  actualizarPago(token: string, datosPago: DatosPago): Promise<Cuenta>;
  salir(token: string): Promise<void>;
  ajustes(): Promise<Ajustes>;
}

// ------------------------------------------------------------------
// Modo local: la app funciona sin backend con las cuentas de prueba.
// El PIN se guarda con PBKDF2, nunca en claro, igual que haría la nube.
// ------------------------------------------------------------------

const CLAVE = "blink.tarjeta.v3";
const VIDA_SESION = 1000 * 60 * 60 * 12;
const MAX_INTENTOS = 5;
const BLOQUEO_INTENTOS = 1000 * 60 * 5;

const PIN_DEMO = "194628";

/** Topes de la demostración: los mismos valores por defecto que publica la nube. */
const TOPE_TRANSFERENCIA = AJUSTES_POR_DEFECTO.topeTransferencia;
const TOPE_TRANSFERENCIA_DIARIO = AJUSTES_POR_DEFECTO.topeTransferenciaDiario;

interface CuentaLocal extends Cuenta {
  pinHash: string;
}

interface TarjetaLocal extends Tarjeta {
  /** Cédula (solo dígitos) de la cuenta dueña de la billetera. */
  cuenta: string;
}

interface TransferenciaLocal extends Transferencia {
  /** Cédula (solo dígitos) de la cuenta que ordenó la transferencia. */
  cuenta: string;
}

interface BaseLocal {
  version: 5;
  cuentas: CuentaLocal[];
  tarjetas: TarjetaLocal[];
  movimientos: Movimiento[];
  transferencias: TransferenciaLocal[];
  sesiones: Record<string, { cedula: string; expira: number }>;
  intentos: Record<string, { fallos: number; hasta: number }>;
}

type BaseLocalV4 = Omit<BaseLocal, "version" | "transferencias"> & { version: 4 };

const TARIFA = 500;

function isoDiasAtras(dias: number, hora: number, minuto: number): string {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() - dias);
  fecha.setHours(hora, minuto, 0, 0);
  return fecha.toISOString();
}

function datosPagoPropio(telefono: string, cedula: string): DatosPago {
  return { propio: true, banco: "", telefono, cedula };
}

function semilla(pin1: string, pin2: string, pin3: string): BaseLocal {
  const cuentas: CuentaLocal[] = [
    {
      nombres: "María Fernanda",
      apellidos: "Fernández",
      cedula: "V-12345678",
      telefono: "04141234567",
      correo: "maria.fernandez@example.com",
      datosPago: {
        propio: true,
        banco: "Banesco Banco Universal",
        telefono: "04141234567",
        cedula: "V-12345678",
      },
      pinHash: pin1,
    },
    {
      nombres: "Carlos Andrés",
      apellidos: "Rondón",
      cedula: "V-87654321",
      telefono: "04248765432",
      correo: "carlos.rondon@example.com",
      datosPago: {
        propio: false,
        banco: "Banco Mercantil",
        telefono: "04129876543",
        cedula: "E-81234567",
      },
      pinHash: pin2,
    },
    {
      nombres: "Luis Enrique",
      apellidos: "Pérez",
      cedula: "V-11223344",
      telefono: "04125556677",
      correo: "luis.perez@example.com",
      datosPago: {
        propio: true,
        banco: "BBVA Provincial",
        telefono: "04125556677",
        cedula: "V-11223344",
      },
      pinHash: pin3,
    },
  ];

  const tarjetas: TarjetaLocal[] = [
    {
      serial: "G-00001-001-N",
      uid: "3981BF06",
      titular: { nombre: "María Fernanda Fernández", cedula: "V-12345678", telefono: "0414-1234567" },
      saldo: 1500,
      estado: "activa",
      emitida: "2025-03-14T12:00:00.000Z",
      vence: "2030-03-14T12:00:00.000Z",
      tarifa: TARIFA,
      cuenta: "12345678",
    },
    {
      serial: "G-00001-004-V",
      uid: "6A21C40D",
      titular: { nombre: "Diego Andrés Fernández", cedula: "V-30445566", telefono: "0414-1234567" },
      saldo: 1000,
      estado: "activa",
      emitida: "2025-08-09T12:00:00.000Z",
      vence: "2030-08-09T12:00:00.000Z",
      tarifa: TARIFA,
      cuenta: "12345678",
    },
    {
      serial: "G-00001-002-R",
      uid: "058151954F3400",
      titular: { nombre: "Carlos Andrés Rondón", cedula: "V-87654321", telefono: "0424-8765432" },
      saldo: 0,
      estado: "activa",
      emitida: "2025-06-02T12:00:00.000Z",
      vence: "2030-06-02T12:00:00.000Z",
      tarifa: TARIFA,
      cuenta: "87654321",
    },
    {
      serial: "G-00001-003-T",
      uid: "A1B2C3D4",
      titular: { nombre: "Luis Enrique Pérez", cedula: "V-11223344", telefono: "0412-5556677" },
      saldo: 500,
      estado: "bloqueada",
      emitida: "2024-11-20T12:00:00.000Z",
      vence: "2029-11-20T12:00:00.000Z",
      tarifa: TARIFA,
      cuenta: "11223344",
    },
  ];

  const serie1: Movimiento[] = [
    {
      id: "mv-0001",
      serial: "G-00001-001-N",
      tipo: "viaje",
      monto: -TARIFA,
      saldoDespues: 1500,
      at: isoDiasAtras(0, 7, 42),
      detalle: "Pasaje en la línea",
      estado: "aprobado",
      unidad: "Demo-01",
    },
    {
      id: "mv-0002",
      serial: "G-00001-001-N",
      tipo: "viaje",
      monto: -TARIFA,
      saldoDespues: 2000,
      at: isoDiasAtras(0, 6, 58),
      detalle: "Pasaje en la línea",
      estado: "aprobado",
      unidad: "Demo-01",
    },
    {
      id: "mv-0003",
      serial: "G-00001-001-N",
      tipo: "recarga",
      monto: 1000,
      saldoDespues: 2500,
      at: isoDiasAtras(1, 18, 20),
      detalle: "Pago Móvil aprobado",
      estado: "aprobado",
      banco: "Banesco Banco Universal",
      referencia: "4821",
    },
    {
      id: "mv-0004",
      serial: "G-00001-001-N",
      tipo: "viaje",
      monto: -TARIFA,
      saldoDespues: 1500,
      at: isoDiasAtras(2, 17, 5),
      detalle: "Pasaje en la línea",
      estado: "aprobado",
      unidad: "Demo-02",
    },
    {
      id: "mv-0005",
      serial: "G-00001-001-N",
      tipo: "viaje",
      monto: -TARIFA,
      saldoDespues: 2000,
      at: isoDiasAtras(2, 16, 48),
      detalle: "Pasaje en la línea",
      estado: "aprobado",
      unidad: "Demo-02",
    },
    {
      id: "mv-0006",
      serial: "G-00001-001-N",
      tipo: "recarga",
      monto: 1500,
      saldoDespues: 2500,
      at: isoDiasAtras(6, 9, 12),
      detalle: "Pago Móvil aprobado",
      estado: "aprobado",
      banco: "Banco Mercantil",
      referencia: "9034",
    },
  ];

  const serie4: Movimiento[] = [
    {
      id: "mv-0011",
      serial: "G-00001-004-V",
      tipo: "viaje",
      monto: -TARIFA,
      saldoDespues: 1000,
      at: isoDiasAtras(0, 7, 15),
      detalle: "Pasaje en la línea",
      estado: "aprobado",
      unidad: "Demo-03",
    },
    {
      id: "mv-0012",
      serial: "G-00001-004-V",
      tipo: "viaje",
      monto: -TARIFA,
      saldoDespues: 1500,
      at: isoDiasAtras(1, 17, 40),
      detalle: "Pasaje en la línea",
      estado: "aprobado",
      unidad: "Demo-03",
    },
    {
      id: "mv-0013",
      serial: "G-00001-004-V",
      tipo: "recarga",
      monto: 2000,
      saldoDespues: 2000,
      at: isoDiasAtras(2, 8, 5),
      detalle: "Pago Móvil aprobado",
      estado: "aprobado",
      banco: "Banesco Banco Universal",
      referencia: "5540",
    },
  ];

  const pendiente: Movimiento = {
    id: "mv-0007",
    serial: "G-00001-002-R",
    tipo: "recarga",
    monto: 1000,
    saldoDespues: 0,
    at: isoDiasAtras(0, 8, 3),
    detalle: "Pago Móvil en revisión",
    estado: "pendiente",
    banco: "Banco de Venezuela, S.A.",
    referencia: "1177",
  };

  const viaje2: Movimiento = {
    id: "mv-0008",
    serial: "G-00001-003-T",
    tipo: "viaje",
    monto: -TARIFA,
    saldoDespues: 500,
    at: isoDiasAtras(3, 12, 30),
    detalle: "Pasaje en la línea",
    estado: "aprobado",
    unidad: "Demo-03",
  };

  return {
    version: 5,
    cuentas,
    tarjetas,
    movimientos: [pendiente, ...serie1, ...serie4, viaje2].sort(
      (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()
    ),
    transferencias: [],
    sesiones: {},
    intentos: {},
  };
}

function leer(): BaseLocal | null {
  try {
    const crudo = localStorage.getItem(CLAVE);
    if (!crudo) return null;
    const datos = JSON.parse(crudo) as BaseLocal | BaseLocalV4;
    if (datos.version === 4) {
      // La base demo anterior no tenía transferencias; se conserva la
      // billetera y se le añade el libro vacío.
      const migrada: BaseLocal = {
        ...(datos as BaseLocalV4),
        version: 5,
        transferencias: [],
      };
      guardar(migrada);
      return migrada;
    }
    return datos.version === 5 ? datos : null;
  } catch {
    return null;
  }
}

function guardar(datos: BaseLocal) {
  localStorage.setItem(CLAVE, JSON.stringify(datos));
}

let inicializando: Promise<BaseLocal> | null = null;

async function base(): Promise<BaseLocal> {
  const existente = leer();
  if (existente) return existente;
  if (!inicializando) {
    inicializando = (async () => {
      const [p1, p2, p3] = await Promise.all([
        hashPin(PIN_DEMO),
        hashPin(PIN_DEMO),
        hashPin(PIN_DEMO),
      ]);
      const datos = semilla(p1, p2, p3);
      guardar(datos);
      return datos;
    })();
  }
  return inicializando;
}

function aTarjeta({ cuenta: _cuenta, ...tarjeta }: TarjetaLocal): Tarjeta {
  return tarjeta;
}

function aCuenta({ pinHash: _pinHash, ...cuenta }: CuentaLocal): Cuenta {
  return { ...cuenta, datosPago: { ...cuenta.datosPago } };
}

function buscarCuenta(datos: BaseLocal, cedula: string): CuentaLocal | undefined {
  const digitos = soloDigitos(cedula);
  return datos.cuentas.find((c) => soloDigitos(c.cedula) === digitos);
}

function tarjetasDe(datos: BaseLocal, cuenta: CuentaLocal): Tarjeta[] {
  const digitos = soloDigitos(cuenta.cedula);
  return datos.tarjetas.filter((t) => t.cuenta === digitos).map(aTarjeta);
}

function sesionDe(datos: BaseLocal, cuenta: CuentaLocal, token: string): Sesion {
  return { token, cuenta: aCuenta(cuenta), tarjetas: tarjetasDe(datos, cuenta) };
}

function porToken(datos: BaseLocal, token: string): CuentaLocal {
  const sesion = datos.sesiones[token];
  if (!sesion || sesion.expira < Date.now()) {
    throw new ErrorBlink("sesion", "La sesión expiró. Vuelve a entrar con tu PIN.");
  }
  const cuenta = buscarCuenta(datos, sesion.cedula);
  if (!cuenta) throw new ErrorBlink("sesion", "No encontramos tu cuenta.");
  return cuenta;
}

function tarjetaDe(datos: BaseLocal, cuenta: CuentaLocal, serial: string): TarjetaLocal {
  const normalizado = formatearSerial(serial);
  const tarjeta = datos.tarjetas.find(
    (t) => t.cuenta === soloDigitos(cuenta.cedula) && t.serial === normalizado
  );
  if (!tarjeta) throw new ErrorBlink("sin-tarjeta", "Esa tarjeta no está en tu billetera.");
  return tarjeta;
}

function abrirSesion(datos: BaseLocal, cuenta: CuentaLocal): Sesion {
  const token = crypto.randomUUID();
  datos.sesiones[token] = { cedula: cuenta.cedula, expira: Date.now() + VIDA_SESION };
  return sesionDe(datos, cuenta, token);
}

/**
 * Verifica el PIN con el mismo límite de intentos que el acceso. Un fallo
 * en una operación sensible (cambiar PIN, transferir) agota la cuenta
 * igual que un fallo al entrar.
 */
async function exigirPin(datos: BaseLocal, cuenta: CuentaLocal, pin: string): Promise<void> {
  const llave = soloDigitos(cuenta.cedula);
  const intento = datos.intentos[llave];
  if (intento && intento.hasta > Date.now()) {
    const minutos = Math.ceil((intento.hasta - Date.now()) / 60000);
    throw new ErrorBlink(
      "credenciales",
      `Demasiados intentos fallidos. Espera ${minutos} min o recupera tu PIN en atención al cliente.`
    );
  }

  if (await verificarPin(pin, cuenta.pinHash)) {
    if (intento) {
      delete datos.intentos[llave];
      guardar(datos);
    }
    return;
  }

  const fallos = (intento?.fallos ?? 0) + 1;
  datos.intentos[llave] = {
    fallos,
    hasta: fallos >= MAX_INTENTOS ? Date.now() + BLOQUEO_INTENTOS : 0,
  };
  guardar(datos);
  throw new ErrorBlink(
    "credenciales",
    fallos >= MAX_INTENTOS
      ? "Demasiados intentos fallidos. Espera 5 min o recupera tu PIN en atención al cliente."
      : "El PIN no coincide. Inténtalo de nuevo."
  );
}

function terminacion(serial: string): string {
  return serial.replace(/\D/g, "").slice(-4);
}

/** "Ana S.", como el comprobante del servidor. */
function titularMascarado(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "Titular de la tarjeta";
  const inicial = partes[partes.length - 1][0] ?? "";
  return `${partes[0]} ${inicial.toUpperCase()}.`;
}

function aTransferencia({ cuenta: _cuenta, ...transferencia }: TransferenciaLocal): Transferencia {
  return { ...transferencia, origen: { ...transferencia.origen }, destino: { ...transferencia.destino } };
}

export const repositorioLocal: Repositorio = {
  modo: "local",

  async entrar(cedula, pin) {
    const datos = await base();
    const llave = soloDigitos(cedula);
    const intento = datos.intentos[llave];
    if (intento && intento.hasta > Date.now()) {
      const minutos = Math.ceil((intento.hasta - Date.now()) / 60000);
      throw new ErrorBlink(
        "credenciales",
        `Demasiados intentos fallidos. Espera ${minutos} min o recupera tu PIN en atención al cliente.`
      );
    }

    const cuenta = buscarCuenta(datos, cedula);
    if (!cuenta) {
      throw new ErrorBlink("sin-tarjeta", "No encontramos una cuenta con esa cédula.");
    }

    const correcto = await verificarPin(pin, cuenta.pinHash);
    if (!correcto) {
      const fallos = (intento?.fallos ?? 0) + 1;
      datos.intentos[llave] = {
        fallos,
        hasta: fallos >= MAX_INTENTOS ? Date.now() + BLOQUEO_INTENTOS : 0,
      };
      guardar(datos);
      if (fallos >= MAX_INTENTOS) {
        throw new ErrorBlink(
          "credenciales",
          "Demasiados intentos fallidos. Espera 5 min o recupera tu PIN en atención al cliente."
        );
      }
      throw new ErrorBlink("credenciales", "El PIN no coincide. Inténtalo de nuevo.");
    }

    delete datos.intentos[llave];
    const sesion = abrirSesion(datos, cuenta);
    guardar(datos);
    return sesion;
  },

  async registrar(datosCuenta) {
    const datos = await base();
    const cedula = formatearCedula(datosCuenta.cedula);

    if (buscarCuenta(datos, cedula)) {
      throw new ErrorBlink("ya-activada", "Esa cédula ya tiene una cuenta. Entra con tu PIN.");
    }

    const problemaPin = validarPin(datosCuenta.pin);
    if (problemaPin) throw new ErrorBlink("pin-invalido", problemaPin);

    const telefono = soloDigitos(datosCuenta.telefono);
    const datosPago: DatosPago = datosCuenta.datosPago.propio
      ? datosPagoPropio(telefono, cedula)
      : { ...datosCuenta.datosPago };
    const problemas = erroresDatosPago(datosPago);
    const primerProblema = Object.values(problemas)[0];
    if (primerProblema) throw new ErrorBlink("datos", primerProblema);

    const cuenta: CuentaLocal = {
      nombres: datosCuenta.nombres.trim(),
      apellidos: datosCuenta.apellidos.trim(),
      cedula,
      telefono,
      correo: datosCuenta.correo.trim().toLowerCase(),
      datosPago,
      pinHash: await hashPin(datosCuenta.pin),
    };

    datos.cuentas.push(cuenta);
    const sesion = abrirSesion(datos, cuenta);
    guardar(datos);
    return sesion;
  },

  async sesion(token) {
    const datos = await base();
    const cuenta = porToken(datos, token);
    return sesionDe(datos, cuenta, token);
  },

  async vincular(token, serial) {
    const datos = await base();
    const cuenta = porToken(datos, token);
    const normalizado = formatearSerial(serial);

    const errorSerial = validarSerial(normalizado);
    if (errorSerial) throw new ErrorBlink("sin-tarjeta", errorSerial);

    const existente = datos.tarjetas.find((t) => t.serial === normalizado);
    if (existente) {
      if (existente.cuenta === soloDigitos(cuenta.cedula)) {
        throw new ErrorBlink("duplicada", "Esa tarjeta ya está en tu billetera.");
      }
      throw new ErrorBlink(
        "ya-activada",
        "Esa tarjeta ya está vinculada a otra cuenta. Verifica el serial."
      );
    }

    const hoy = new Date();
    const vence = new Date(hoy);
    vence.setFullYear(hoy.getFullYear() + 5);
    datos.tarjetas.push({
      serial: normalizado,
      uid: "",
      titular: {
        nombre: `${cuenta.nombres} ${cuenta.apellidos}`,
        cedula: cuenta.cedula,
        telefono: formatearTelefono(cuenta.telefono),
      },
      saldo: 0,
      estado: "activa",
      emitida: hoy.toISOString(),
      vence: vence.toISOString(),
      tarifa: TARIFA,
      cuenta: soloDigitos(cuenta.cedula),
    });
    guardar(datos);
    return sesionDe(datos, cuenta, token);
  },

  async movimientos(token, serial) {
    const datos = await base();
    const cuenta = porToken(datos, token);
    const tarjeta = tarjetaDe(datos, cuenta, serial);
    return datos.movimientos
      .filter((m) => m.serial === tarjeta.serial)
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  },

  async reportarRecarga(token, serial, recarga) {
    const datos = await base();
    const cuenta = porToken(datos, token);
    const tarjeta = tarjetaDe(datos, cuenta, serial);
    const referencia = soloDigitos(recarga.referencia).slice(-4);
    const duplicada = datos.movimientos.some(
      (m) =>
        m.serial === tarjeta.serial &&
        m.tipo === "recarga" &&
        m.banco === recarga.banco &&
        m.referencia === referencia &&
        m.estado !== "rechazado"
    );
    if (duplicada) {
      throw new ErrorBlink("duplicada", "Ya reportaste esa referencia. Revisa Movimientos.");
    }
    const pasajes = Math.max(1, Math.round(recarga.pasajes));
    const movimiento: Movimiento = {
      id: `rc-${crypto.randomUUID()}`,
      serial: tarjeta.serial,
      tipo: "recarga",
      monto: Math.round(recarga.montoBase),
      saldoDespues: tarjeta.saldo,
      at: new Date().toISOString(),
      detalle: `Recarga de ${pasajes} ${pasajes === 1 ? "pasaje" : "pasajes"} en revisión`,
      estado: "pendiente" satisfies EstadoMovimiento,
      banco: recarga.banco,
      referencia,
    };
    datos.movimientos = [movimiento, ...datos.movimientos].slice(0, 300);
    guardar(datos);
    return movimiento;
  },

  async transferir(token, solicitud) {
    const datos = await base();
    const cuenta = porToken(datos, token);
    const llave = soloDigitos(cuenta.cedula);
    const clave = solicitud.clave.trim();

    if (!clave) {
      throw new ErrorBlink(
        "datos",
        "No pudimos identificar esta operación. Vuelve a intentarlo."
      );
    }

    await exigirPin(datos, cuenta, solicitud.pin);

    const previa = datos.transferencias.find((t) => t.clave === clave);
    if (previa) {
      if (previa.cuenta !== llave) {
        throw new ErrorBlink("duplicada", "Esa operación ya fue registrada. Revisa Movimientos.");
      }
      return { transferencia: aTransferencia(previa), repetida: true };
    }

    const bruto = Number.isFinite(solicitud.monto) ? solicitud.monto : 0;
    const monto = Math.round(bruto * 100) / 100;
    if (monto <= 0) {
      throw new ErrorBlink("datos", "Escribe un monto mayor que cero.");
    }
    if (Math.abs(monto - bruto) > 1e-9) {
      throw new ErrorBlink("datos", "Usa como máximo dos decimales.");
    }
    if (monto > TOPE_TRANSFERENCIA) {
      throw new ErrorBlink(
        "datos",
        `El tope por transferencia es ${formatearEntero(
          TOPE_TRANSFERENCIA
        )} Bs. Divide el monto en varias operaciones.`
      );
    }

    const origen = tarjetaDe(datos, cuenta, solicitud.origen);
    const destinoSerial = formatearSerial(solicitud.destino);
    if (origen.serial === destinoSerial) {
      throw new ErrorBlink("datos", "Elige una tarjeta distinta a la de origen.");
    }

    const destino = datos.tarjetas.find((t) => t.serial === destinoSerial);
    if (!destino) {
      throw new ErrorBlink("sin-tarjeta", "No encontramos la tarjeta de destino. Revisa el serial.");
    }

    if (origen.estado !== "activa") {
      throw new ErrorBlink("bloqueada", "Tu tarjeta de origen no está activa. No se puede transferir.");
    }
    if (!destino.uid) {
      throw new ErrorBlink("sin-enrolar", "La tarjeta de destino todavía no está enrolada.");
    }
    if (destino.estado !== "activa") {
      throw new ErrorBlink("bloqueada", "La tarjeta de destino no está activa. No se puede transferir.");
    }

    const desde = Date.now() - 24 * 60 * 60 * 1000;
    const usado = datos.transferencias
      .filter((t) => t.cuenta === llave && new Date(t.at).getTime() > desde)
      .reduce((total, t) => total + t.monto, 0);
    if (usado + monto > TOPE_TRANSFERENCIA_DIARIO) {
      throw new ErrorBlink(
        "datos",
        `El tope diario para transferir es ${formatearEntero(
          TOPE_TRANSFERENCIA_DIARIO
        )} Bs. Ya usaste ${formatearEntero(usado)} Bs en las últimas 24 horas.`
      );
    }

    if (monto > origen.saldo) {
      throw new ErrorBlink(
        "datos",
        `Solo puedes transferir ${formatearEntero(origen.saldo)} Bs de esta tarjeta.`
      );
    }

    const at = new Date().toISOString();
    origen.saldo = Math.round((origen.saldo - monto) * 100) / 100;
    destino.saldo = Math.round((destino.saldo + monto) * 100) / 100;

    const salida: Movimiento = {
      id: `tr-${crypto.randomUUID()}`,
      serial: origen.serial,
      tipo: "transferencia",
      monto: -monto,
      saldoDespues: origen.saldo,
      at,
      detalle: `Transferencia a la tarjeta terminada en ${terminacion(destino.serial)}`,
      estado: "aprobado",
    };
    const entrada: Movimiento = {
      id: `tr-${crypto.randomUUID()}`,
      serial: destino.serial,
      tipo: "transferencia",
      monto,
      saldoDespues: destino.saldo,
      at,
      detalle: `Transferencia recibida de la tarjeta terminada en ${terminacion(origen.serial)}`,
      estado: "aprobado",
    };

    const transferencia: TransferenciaLocal = {
      id: crypto.randomUUID(),
      clave,
      monto,
      at,
      origen: { serial: origen.serial, saldo: origen.saldo },
      destino: {
        serial: destino.serial,
        titular: titularMascarado(destino.titular.nombre),
        saldo: destino.saldo,
      },
      cuenta: llave,
    };

    datos.transferencias = [transferencia, ...datos.transferencias].slice(0, 200);
    datos.movimientos = [entrada, salida, ...datos.movimientos].slice(0, 300);
    guardar(datos);

    return {
      transferencia: aTransferencia(transferencia),
      movimiento: salida,
      repetida: false,
    };
  },

  async cambiarPin(token, actual, nuevo) {
    const datos = await base();
    const cuenta = porToken(datos, token);
    await exigirPin(datos, cuenta, actual);
    const problema = validarPin(nuevo);
    if (problema) throw new ErrorBlink("pin-invalido", problema);
    if (nuevo === actual) {
      throw new ErrorBlink("pin-invalido", "El PIN nuevo debe ser distinto al actual.");
    }
    cuenta.pinHash = await hashPin(nuevo);
    guardar(datos);
  },

  async actualizarPago(token, datosPago) {
    const datos = await base();
    const cuenta = porToken(datos, token);
    const problemas = erroresDatosPago(datosPago);
    const primerProblema = Object.values(problemas)[0];
    if (primerProblema) throw new ErrorBlink("datos", primerProblema);
    cuenta.datosPago = { ...datosPago };
    guardar(datos);
    return aCuenta(cuenta);
  },

  async salir(token) {
    const datos = await base();
    delete datos.sesiones[token];
    guardar(datos);
  },

  async ajustes() {
    return AJUSTES_POR_DEFECTO;
  },
};
