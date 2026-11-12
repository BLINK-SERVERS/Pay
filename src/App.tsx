import { lazy, memo, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AvisoActualizacion } from "./components/AvisoActualizacion";
import { AvisoInstalacion } from "./components/AvisoInstalacion";
import { AvisoDemo } from "./components/AvisoDemo";
import { BarraTabs, type Pestana } from "./components/BarraTabs";
import { Desbloqueo } from "./components/Desbloqueo";
import { Hoja } from "./components/Hoja";
import { HojaVincular } from "./components/HojaVincular";
import { Icon } from "./components/Icon";
import { PayLoader } from "./components/PayLoader";
import { BarraLateral } from "./components/ui/BarraLateral";
import { ajustesPorDefecto } from "./lib/ajustes";
import {
  activarBiometria,
  biometriaSoportada,
  desbloquearConBiometria,
  guardarLlaveBiometria,
  leerRegistroBiometria,
  marcarOfrecimiento,
  mensajeBiometria,
  ofrecimientoHecho,
  olvidarBiometria,
  registroDesbloqueable,
  type RegistroBiometria,
} from "./lib/biometria";
import { ErrorBlink, repositorio } from "./lib/repo";
import { useConsultaMedio } from "./lib/hooks";
import { olvidarCopia } from "./lib/offline";
import { formatearSerial } from "./lib/formato";
import type {
  Ajustes,
  Cuenta,
  DatosPago,
  Movimiento,
  RecargaNueva,
  ResultadoTransferencia,
  Sesion,
  Tarjeta,
  TransferenciaNueva,
} from "./lib/tipos";

const CLAVE_SESION = "blink.tarjeta.sesion";
const BLOQUEO_INACTIVO = 30 * 60 * 1000;

/** Movimientos por página del extracto: una pantalla y algo de margen. */
const LIMITE_MOVIMIENTOS = 30;
/** Evita releer sesión y extracto al cambiar de pestaña o volver a la app. */
const VIGENCIA_REFRESCO = 10_000;

// Cada vista viaja en su propio trozo de JavaScript. El arranque solo carga
// la pantalla que se va a ver; las demás llegan al navegar (y quedan en la
// caché del service worker para la siguiente visita).
const Landing = lazy(() =>
  import("./pages/Landing").then((modulo) => ({ default: memo(modulo.Landing) }))
);
const Acceso = lazy(() =>
  import("./pages/Acceso").then((modulo) => ({ default: memo(modulo.Acceso) }))
);
const Inicio = lazy(() =>
  import("./pages/Inicio").then((modulo) => ({ default: memo(modulo.Inicio) }))
);
const Movimientos = lazy(() =>
  import("./pages/Movimientos").then((modulo) => ({ default: memo(modulo.Movimientos) }))
);
const Recargar = lazy(() =>
  import("./pages/Recargar").then((modulo) => ({ default: memo(modulo.Recargar) }))
);
const Transferir = lazy(() =>
  import("./pages/Transferir").then((modulo) => ({ default: memo(modulo.Transferir) }))
);
const Perfil = lazy(() =>
  import("./pages/Perfil").then((modulo) => ({ default: memo(modulo.Perfil) }))
);
const Inspector = lazy(() =>
  import("./components/ui/Inspector").then((modulo) => ({ default: modulo.Inspector }))
);

function VistaCargando({ etiqueta = "Cargando…" }: { etiqueta?: string }) {
  return (
    <div className="vista vista--cargando" role="status" aria-live="polite" aria-busy="true">
      <span className="esqueleto esqueleto--bloque" aria-hidden="true" />
      <span className="visualmente-oculto">{etiqueta}</span>
    </div>
  );
}

function leerSesionGuardada(): { token: string; expira: number } | null {
  try {
    const crudo = localStorage.getItem(CLAVE_SESION);
    if (!crudo) return null;
    const datos = JSON.parse(crudo) as { token?: string; expira?: number };
    if (!datos.token || !datos.expira || datos.expira < Date.now()) {
      localStorage.removeItem(CLAVE_SESION);
      return null;
    }
    return { token: datos.token, expira: datos.expira };
  } catch {
    return null;
  }
}

function guardarSesion(token: string, expira = Date.now() + 12 * 60 * 60 * 1000) {
  localStorage.setItem(CLAVE_SESION, JSON.stringify({ token, expira }));
}

/** Lo que ve quien no tiene sesión abierta. */
type VistaPublica = "landing" | "acceso";
type ModoAcceso = "entrar" | "registro";

/**
 * Sin sesión, el hash decide la puerta: `/` es la landing de pay.blink.com.ve
 * y `#entrar` / `#registro` abren el acceso (enlaces que se pueden compartir).
 * Los anclas de la propia landing (`#configurar`, `#seguridad`, `#preguntas`)
 * no son rutas: dejan la puerta de entrada tal cual.
 */
function leerVistaPublica(): { vista: VistaPublica; modo: ModoAcceso } {
  const hash = window.location.hash.replace(/^#/, "").toLowerCase();
  if (hash === "registro") return { vista: "acceso", modo: "registro" };
  if (hash === "entrar" || hash === "acceso") return { vista: "acceso", modo: "entrar" };
  return { vista: "landing", modo: "entrar" };
}

/** Cambiar de vista pública no debe dejar la página a media altura. */
function irArriba() {
  window.scrollTo({ top: 0, left: 0, behavior: "instant" });
}

/** Deja la URL en la raíz sin añadir una entrada al historial. */
function limpiarHash() {
  if (!window.location.hash) return;
  window.history.replaceState(
    null,
    "",
    window.location.pathname + window.location.search
  );
}

export function App() {
  const [sesion, setSesion] = useState<Sesion | null>(null);
  const [serialActiva, setSerialActiva] = useState<string | null>(null);
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [hayMasMovimientos, setHayMasMovimientos] = useState(false);
  // Arranca en true: con la sesión restaurada la primera pintura aún no tiene
  // extracto y no debe mostrar el vacío. Los refrescos silenciosos no lo tocan.
  const [cargandoMovimientos, setCargandoMovimientos] = useState(true);
  const [cargandoMasMovimientos, setCargandoMasMovimientos] = useState(false);
  // Un fallo de red al leer el extracto no es «no hay movimientos»: se avisa
  // aparte para no mostrar una tarjeta vacía que en realidad está sin leer.
  const [errorMovimientos, setErrorMovimientos] = useState("");
  const [ajustes, setAjustes] = useState<Ajustes>(ajustesPorDefecto());
  const [pestana, setPestana] = useState<Pestana>("inicio");
  const [restaurando, setRestaurando] = useState(true);
  const [vinculoAbierto, setVinculoAbierto] = useState(false);
  const [movimientoActivo, setMovimientoActivo] = useState<string | null>(null);
  const escritorio = useConsultaMedio("(min-width: 1080px)");
  const [bloqueo, setBloqueo] = useState<RegistroBiometria | null>(null);
  const [biometria, setBiometria] = useState<RegistroBiometria | null>(
    leerRegistroBiometria
  );
  const [soportaBiometria, setSoportaBiometria] = useState(false);
  const [ofreceBiometria, setOfreceBiometria] = useState(false);
  const [activandoBiometria, setActivandoBiometria] = useState(false);
  const [altaBiometriaLista, setAltaBiometriaLista] = useState(false);
  const [errorAltaBiometria, setErrorAltaBiometria] = useState<string | null>(null);
  const [avisoAcceso, setAvisoAcceso] = useState<string | null>(null);
  // Puerta de entrada: sin sesión se ve la landing; el acceso se abre con un
  // CTA o con un enlace `#entrar` / `#registro`.
  const [vistaPublica, setVistaPublica] = useState<VistaPublica>(
    () => leerVistaPublica().vista
  );
  const [modoAcceso, setModoAcceso] = useState<ModoAcceso>(
    () => leerVistaPublica().modo
  );
  const vistaPublicaRef = useRef<VistaPublica>(vistaPublica);
  const ocultoDesde = useRef<number | null>(null);
  // Un solo refresco en vuelo y una ventana de vigencia: cambiar de pestaña o
  // volver a la app no dispara la misma lectura dos veces.
  const refrescoEnCurso = useRef<Promise<void> | null>(null);
  const ultimoRefresco = useRef(0);
  // Una respuesta que llega después de salir o bloquear no debe reabrir la
  // sesión ni repintar el extracto.
  const generacion = useRef(0);

  const token = sesion?.token ?? null;

  const movimientoSeleccionado = useMemo(
    () => movimientos.find((movimiento) => movimiento.id === movimientoActivo) ?? null,
    [movimientos, movimientoActivo]
  );

  const tarjeta = useMemo<Tarjeta | null>(() => {
    if (!sesion) return null;
    return (
      sesion.tarjetas.find((t) => t.serial === serialActiva) ?? sesion.tarjetas[0] ?? null
    );
  }, [sesion, serialActiva]);

  useEffect(() => {
    let vivo = true;
    void biometriaSoportada().then((soportada) => {
      if (vivo) setSoportaBiometria(soportada);
    });
    // Configuración y sesión son independientes: van en paralelo para que la
    // restauración no espere a los ajustes ni el login espere al token.
    void repositorio
      .ajustes()
      .then((config) => {
        if (vivo) setAjustes(config);
      })
      .catch(() => undefined);
    (async () => {
      try {
        const guardada = leerSesionGuardada();
        if (!guardada) {
          olvidarCopia();
          return;
        }

        const registro = leerRegistroBiometria();
        if (registro) {
          if (vivo) setBiometria(registro);
          if (registroDesbloqueable(registro)) {
            if (vivo) setBloqueo(registro);
            return;
          }
        }

        const actual = await repositorio.sesion(guardada.token);
        if (!vivo) return;
        setSesion(actual);
        setSerialActiva(actual.tarjetas[0]?.serial ?? null);
      } catch {
        localStorage.removeItem(CLAVE_SESION);
        olvidarCopia();
        if (vivo) setBiometria(leerRegistroBiometria());
      } finally {
        if (vivo) setRestaurando(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [pestana]);

  useEffect(() => {
    if (!token || !serialActiva) {
      setMovimientos([]);
      setHayMasMovimientos(false);
      setCargandoMasMovimientos(false);
      setErrorMovimientos("");
      setCargandoMovimientos(false);
      return;
    }
    let vivo = true;
    // Al cambiar de tarjeta el extracto anterior ya no representa nada.
    setMovimientos([]);
    setHayMasMovimientos(false);
    setCargandoMasMovimientos(false);
    setErrorMovimientos("");
    setCargandoMovimientos(true);
    // La primera página cuenta como refresco reciente: una pestaña tocada de
    // inmediato no vuelve a pedir lo mismo.
    ultimoRefresco.current = Date.now();
    repositorio
      .movimientos(token, serialActiva, { limite: LIMITE_MOVIMIENTOS })
      .then((pagina) => {
        if (!vivo) return;
        setMovimientos(pagina.movimientos);
        setHayMasMovimientos(pagina.hayMas);
      })
      .catch(() => {
        if (!vivo) return;
        ultimoRefresco.current = 0;
        setMovimientos([]);
        setErrorMovimientos(
          "No pudimos cargar tus movimientos. Revisa la conexión e inténtalo de nuevo."
        );
      })
      .finally(() => {
        if (vivo) setCargandoMovimientos(false);
      });
    return () => {
      vivo = false;
    };
  }, [token, serialActiva]);

  const refrescar = useCallback(
    async (forzar = false) => {
      if (!token || !serialActiva) return;
      if (!forzar && Date.now() - ultimoRefresco.current < VIGENCIA_REFRESCO) return;
      if (refrescoEnCurso.current) return refrescoEnCurso.current;

      const marca = generacion.current;
      const tarea = (async () => {
        try {
          // Sesión y extracto no dependen entre sí: viajan juntos.
          const [actual, pagina] = await Promise.all([
            repositorio.sesion(token),
            repositorio.movimientos(token, serialActiva, { limite: LIMITE_MOVIMIENTOS }),
          ]);
          if (marca !== generacion.current) return;
          setSesion(actual);
          setMovimientos(pagina.movimientos);
          setHayMasMovimientos(pagina.hayMas);
          setCargandoMasMovimientos(false);
          setErrorMovimientos("");
          ultimoRefresco.current = Date.now();
        } catch (fallo) {
          if (marca !== generacion.current) return;
          ultimoRefresco.current = 0;
          // La sesión pudo expirar; el siguiente intento de acción lo dirá.
          if ((fallo as { codigo?: string }).codigo !== "sesion") {
            setErrorMovimientos(
              "No pudimos actualizar tus movimientos. Revisa la conexión e inténtalo de nuevo."
            );
          }
        } finally {
          refrescoEnCurso.current = null;
        }
      })();
      refrescoEnCurso.current = tarea;
      return tarea;
    },
    [token, serialActiva]
  );

  const cargarMasMovimientos = useCallback(async () => {
    if (!token || !serialActiva || cargandoMasMovimientos || !hayMasMovimientos) return;
    const marca = generacion.current;
    setCargandoMasMovimientos(true);
    try {
      const pagina = await repositorio.movimientos(token, serialActiva, {
        limite: LIMITE_MOVIMIENTOS,
        desplazamiento: movimientos.length,
      });
      if (marca !== generacion.current) return;
      setMovimientos((previas) => {
        const vistos = new Set(previas.map((movimiento) => movimiento.id));
        return [
          ...previas,
          ...pagina.movimientos.filter((movimiento) => !vistos.has(movimiento.id)),
        ];
      });
      setHayMasMovimientos(pagina.hayMas);
      setErrorMovimientos("");
    } catch {
      setErrorMovimientos(
        "No pudimos cargar más movimientos. Revisa la conexión e inténtalo de nuevo."
      );
    } finally {
      setCargandoMasMovimientos(false);
    }
  }, [token, serialActiva, cargandoMasMovimientos, hayMasMovimientos, movimientos.length]);

  const salir = useCallback(async () => {
    const actual = token;
    generacion.current += 1;
    refrescoEnCurso.current = null;
    ultimoRefresco.current = 0;
    setSesion(null);
    setSerialActiva(null);
    setMovimientos([]);
    setHayMasMovimientos(false);
    setCargandoMasMovimientos(false);
    setErrorMovimientos("");
    setPestana("inicio");
    setBloqueo(null);
    setMovimientoActivo(null);
    // Cerrar sesión devuelve a la puerta de entrada, no al formulario.
    vistaPublicaRef.current = "landing";
    setVistaPublica("landing");
    setModoAcceso("entrar");
    limpiarHash();
    irArriba();
    localStorage.removeItem(CLAVE_SESION);
    // La credencial del teléfono se conserva: la huella vuelve a abrir la
    // cuenta sin pedir el PIN.
    setBiometria(leerRegistroBiometria());
    if (actual) {
      try {
        await repositorio.salir(actual);
      } catch {
        // El token ya no existe en el servidor: nada que limpiar.
      }
    }
  }, [token]);

  const bloquear = useCallback(() => {
    const registro = leerRegistroBiometria();
    if (!registroDesbloqueable(registro)) {
      void salir();
      return;
    }
    generacion.current += 1;
    refrescoEnCurso.current = null;
    ultimoRefresco.current = 0;
    setSesion(null);
    setSerialActiva(null);
    setMovimientos([]);
    setHayMasMovimientos(false);
    setCargandoMasMovimientos(false);
    setErrorMovimientos("");
    setPestana("inicio");
    setBiometria(registro);
    setBloqueo(registro);
  }, [salir]);

  useEffect(() => {
    function alCambiarVisibilidad() {
      if (document.hidden) {
        ocultoDesde.current = Date.now();
        return;
      }
      const oculto = ocultoDesde.current;
      ocultoDesde.current = null;
      if (oculto && Date.now() - oculto > BLOQUEO_INACTIVO) {
        bloquear();
        return;
      }
      if (sesion) void refrescar();
    }
    document.addEventListener("visibilitychange", alCambiarVisibilidad);
    return () => document.removeEventListener("visibilitychange", alCambiarVisibilidad);
  }, [bloquear, refrescar, sesion]);

  // El hash manda: así «atrás» (también el de Android dentro de la PWA)
  // vuelve a la landing en lugar de sacar al usuario de la app.
  useEffect(() => {
    function alCambiarHash() {
      const { vista, modo } = leerVistaPublica();
      if (vistaPublicaRef.current !== vista) irArriba();
      vistaPublicaRef.current = vista;
      setVistaPublica(vista);
      setModoAcceso(modo);
    }
    window.addEventListener("hashchange", alCambiarHash);
    return () => window.removeEventListener("hashchange", alCambiarHash);
  }, []);

  const abrirAcceso = useCallback((modo: ModoAcceso) => {
    vistaPublicaRef.current = "acceso";
    setVistaPublica("acceso");
    setModoAcceso(modo);
    window.location.hash = modo === "registro" ? "registro" : "entrar";
    irArriba();
  }, []);

  const volverALanding = useCallback(() => {
    vistaPublicaRef.current = "landing";
    setVistaPublica("landing");
    setModoAcceso("entrar");
    limpiarHash();
    irArriba();
  }, []);

  const configurarTarjeta = useCallback(() => abrirAcceso("registro"), [abrirAcceso]);
  const entrarConCuenta = useCallback(() => abrirAcceso("entrar"), [abrirAcceso]);

  async function desbloquear() {
    const prueba = await desbloquearConBiometria();
    try {
      const actual = await repositorio.reanudar(prueba.cedula, prueba.llave);
      guardarSesion(actual.token);
      setSesion(actual);
      setSerialActiva(actual.tarjetas[0]?.serial ?? null);
      setPestana("inicio");
      setBloqueo(null);
      setAvisoAcceso(null);
      setBiometria(leerRegistroBiometria());
      limpiarHash();
    } catch (error) {
      if (error instanceof ErrorBlink && error.codigo === "credenciales") {
        localStorage.removeItem(CLAVE_SESION);
        olvidarCopia();
        setBloqueo(null);
        setBiometria(leerRegistroBiometria());
        setAvisoAcceso(error.message);
        // La llave biométrica ya no sirve: se explica en el acceso con PIN.
        abrirAcceso("entrar");
      }
      throw error;
    }
  }

  function usarPin() {
    setBloqueo(null);
    setAvisoAcceso(null);
    // «Usar mi PIN» desde el desbloqueo biométrico abre el formulario.
    abrirAcceso("entrar");
  }

  async function ofrecerAccesoBiometrico(nueva: Sesion) {
    if (leerRegistroBiometria()) return;
    if (ofrecimientoHecho(nueva.cuenta.cedula)) return;
    if (!(await biometriaSoportada())) return;
    setErrorAltaBiometria(null);
    setAltaBiometriaLista(false);
    setOfreceBiometria(true);
  }

  async function activarBiometriaAhora() {
    if (!sesion) return;
    setActivandoBiometria(true);
    setErrorAltaBiometria(null);
    try {
      const llave = await repositorio.crearEnlace(sesion.token);
      const registro = await activarBiometria(sesion, llave);
      setBiometria(registro);
      setSoportaBiometria(true);
      setAltaBiometriaLista(true);
    } catch (error) {
      setErrorAltaBiometria(mensajeBiometria(error));
    } finally {
      setActivandoBiometria(false);
    }
  }

  function cerrarOfertaBiometria() {
    if (!altaBiometriaLista && sesion) marcarOfrecimiento(sesion.cuenta.cedula);
    setOfreceBiometria(false);
    setErrorAltaBiometria(null);
    setAltaBiometriaLista(false);
  }

  async function activarBiometriaDesdePerfil() {
    if (!sesion) throw new Error("Sin sesión activa.");
    const llave = await repositorio.crearEnlace(sesion.token);
    const registro = await activarBiometria(sesion, llave);
    setBiometria(registro);
    setSoportaBiometria(true);
  }

  function desactivarBiometriaDesdePerfil() {
    olvidarBiometria();
    setBiometria(null);
    setBloqueo(null);
  }

  function alEntrar(nueva: Sesion) {
    guardarSesion(nueva.token);
    const previo = leerRegistroBiometria();
    const mismaCuenta =
      previo !== null && previo.cedula === nueva.cuenta.cedula;
    setBiometria(previo);
    setSesion(nueva);
    setSerialActiva(nueva.tarjetas[0]?.serial ?? null);
    setPestana("inicio");
    setBloqueo(null);
    setAvisoAcceso(null);
    limpiarHash();
    if (mismaCuenta && !registroDesbloqueable(previo)) {
      // Un registro anterior sin llave se reactiva al entrar con PIN.
      void repositorio
        .crearEnlace(nueva.token)
        .then((llave) => setBiometria(guardarLlaveBiometria(llave)))
        .catch(() => undefined);
      return;
    }
    void ofrecerAccesoBiometrico(nueva);
  }

  async function vincular(serial: string) {
    if (!token) throw new Error("Sin sesión activa.");
    const normalizado = formatearSerial(serial);
    const actual = await repositorio.vincular(token, normalizado);
    setSesion(actual);
    setSerialActiva(
      actual.tarjetas.find((t) => t.serial === normalizado)?.serial ??
        actual.tarjetas[0]?.serial ??
        null
    );
    setPestana("inicio");
  }

  async function reportarRecarga(recarga: RecargaNueva) {
    if (!token || !tarjeta) throw new Error("Sin sesión activa.");
    const movimiento = await repositorio.reportarRecarga(token, tarjeta.serial, recarga);
    // Un movimiento de dinero siempre revalida, aunque acabe de leerse.
    await refrescar(true);
    return movimiento;
  }

  async function transferir(solicitud: TransferenciaNueva): Promise<ResultadoTransferencia> {
    if (!token) throw new Error("Sin sesión activa.");
    const resultado = await repositorio.transferir(token, solicitud);
    await refrescar(true);
    return resultado;
  }

  async function cambiarPin(actual: string, nuevo: string) {
    if (!token) throw new Error("Sin sesión activa.");
    await repositorio.cambiarPin(token, actual, nuevo);
  }

  function fijarCuenta(cuenta: Cuenta) {
    setSesion((previa) => (previa ? { ...previa, cuenta } : previa));
  }

  async function guardarCuentaPago(id: string | null, datos: DatosPago): Promise<Cuenta> {
    if (!token) throw new Error("Sin sesión activa.");
    const cuenta = id
      ? await repositorio.editarCuentaPago(token, id, datos)
      : await repositorio.altaCuentaPago(token, datos);
    fijarCuenta(cuenta);
    return cuenta;
  }

  async function borrarCuentaPago(id: string): Promise<Cuenta> {
    if (!token) throw new Error("Sin sesión activa.");
    const cuenta = await repositorio.borrarCuentaPago(token, id);
    fijarCuenta(cuenta);
    return cuenta;
  }

  async function usarCuentaPago(id: string): Promise<Cuenta> {
    if (!token) throw new Error("Sin sesión activa.");
    const cuenta = await repositorio.usarCuentaPago(token, id);
    fijarCuenta(cuenta);
    return cuenta;
  }

  const cambiarPestana = useCallback(
    (nueva: Pestana) => {
      setPestana(nueva);
      // El inspector refleja una selección de la pestaña en curso; al cambiar
      // de sección volvemos al resumen en lugar de arrastrar el detalle.
      setMovimientoActivo(null);
      // `refrescar` ignora la llamada si el extracto se leyó hace < 10 s.
      if (nueva === "inicio" || nueva === "movimientos" || nueva === "transferir") {
        void refrescar();
      }
    },
    [refrescar]
  );

  const abrirVinculo = useCallback(() => setVinculoAbierto(true), []);
  const cerrarVinculo = useCallback(() => setVinculoAbierto(false), []);
  const seleccionarMovimiento = useCallback(
    (movimiento: Movimiento) => setMovimientoActivo(movimiento.id),
    []
  );
  const limpiarSeleccion = useCallback(() => setMovimientoActivo(null), []);
  const reintentarMovimientos = useCallback(() => void refrescar(true), [refrescar]);
  const irAInicio = useCallback(() => cambiarPestana("inicio"), [cambiarPestana]);
  const irAMovimientos = useCallback(() => cambiarPestana("movimientos"), [cambiarPestana]);
  const irARecargar = useCallback(() => cambiarPestana("recargar"), [cambiarPestana]);
  const irAPerfil = useCallback(() => cambiarPestana("perfil"), [cambiarPestana]);

  if (restaurando) {
    return (
      <>
        <PayLoader />
        <AvisoDemo />
        <AvisoActualizacion />
      </>
    );
  }

  const accesoBiometrico =
    registroDesbloqueable(biometria) && biometria
      ? { nombre: biometria.nombre, cedula: biometria.cedula }
      : null;

  if (!sesion && bloqueo) {
    return (
      <>
        <Desbloqueo
          nombre={bloqueo.nombre}
          cedula={bloqueo.cedula}
          alDesbloquear={desbloquear}
          alUsarPin={usarPin}
        />
        <AvisoDemo />
        <AvisoActualizacion />
      </>
    );
  }

  if (!sesion && vistaPublica === "landing") {
    return (
      <>
        <Suspense fallback={<PayLoader />}>
          <Landing
            alConfigurar={configurarTarjeta}
            alEntrar={entrarConCuenta}
            tarifa={ajustes.tarifario.base}
          />
        </Suspense>
        {/* `AvisoDemo` lo pinta la propia landing dentro del hero. */}
        <AvisoActualizacion />
      </>
    );
  }

  if (!sesion) {
    return (
      <>
        <Suspense fallback={<PayLoader />}>
          <Acceso
            key={modoAcceso}
            alEntrar={alEntrar}
            tarifa={ajustes.tarifario.base}
            biometria={accesoBiometrico}
            alEntrarConBiometria={accesoBiometrico ? desbloquear : undefined}
            avisoInicial={avisoAcceso}
            modoInicial={modoAcceso}
            alVolver={volverALanding}
          />
        </Suspense>
        <AvisoDemo />
        <AvisoActualizacion />
      </>
    );
  }

  return (
    <div className={`app app--${pestana}`}>
      <BarraLateral pestana={pestana} alCambiar={cambiarPestana} />

      <div className="app__cuerpo">
        <main className="app__main" id="contenido">
          <AvisoDemo />
          <AvisoInstalacion visible={pestana === "inicio"} />
        <Suspense fallback={<VistaCargando />}>
        {pestana === "inicio" && (
          <Inicio
            cuenta={sesion.cuenta}
            tarjetas={sesion.tarjetas}
            tarjeta={tarjeta}
            movimientos={movimientos}
            cargandoMovimientos={cargandoMovimientos}
            alSeleccionar={setSerialActiva}
            alVincular={abrirVinculo}
            alVerMovimientos={irAMovimientos}
            seleccionadoId={escritorio ? movimientoActivo : null}
            alSeleccionarMovimiento={escritorio ? seleccionarMovimiento : undefined}
          />
        )}

        {pestana !== "inicio" && !tarjeta && (
          <div className="vista">
            <section className="billetera-vacia">
              <span className="billetera-vacia__icono">
                <Icon name="tarjeta" />
              </span>
              <h1>Tu billetera está vacía</h1>
              <p>Vincula el serial impreso al reverso de tu plástico para empezar a recargar.</p>
              <button
                type="button"
                className="boton boton--primario"
                onClick={abrirVinculo}
              >
                <Icon name="mas" />
                Vincular una tarjeta
              </button>
            </section>
          </div>
        )}

        {tarjeta && pestana === "movimientos" && (
          <Movimientos
            tarjeta={tarjeta}
            movimientos={movimientos}
            cargando={cargandoMovimientos}
            error={errorMovimientos}
            alReintentar={reintentarMovimientos}
            hayMas={hayMasMovimientos}
            cargandoMas={cargandoMasMovimientos}
            alCargarMas={cargarMasMovimientos}
            seleccionadoId={escritorio ? movimientoActivo : null}
            alSeleccionar={escritorio ? seleccionarMovimiento : undefined}
          />
        )}
        {tarjeta && pestana === "recargar" && (
          <Recargar
            tarjeta={tarjeta}
            cuentasPago={sesion.cuenta.cuentasPago}
            ajustes={ajustes}
            movimientos={movimientos}
            alReportar={reportarRecarga}
            alInicio={irAInicio}
            alVerMovimientos={irAMovimientos}
            alEditarPago={irAPerfil}
          />
        )}
        {tarjeta && pestana === "transferir" && (
          <Transferir
            tarjeta={tarjeta}
            tarjetas={sesion.tarjetas}
            ajustes={ajustes}
            alSeleccionarOrigen={setSerialActiva}
            alTransferir={transferir}
            alInicio={irAInicio}
            alVerMovimientos={irAMovimientos}
          />
        )}
        {pestana === "perfil" && (
          <Perfil
            cuenta={sesion.cuenta}
            tarjetaActiva={tarjeta}
            ajustes={ajustes}
            alCambiarPin={cambiarPin}
            alGuardarCuenta={guardarCuentaPago}
            alBorrarCuenta={borrarCuentaPago}
            alUsarCuenta={usarCuentaPago}
            alVincular={abrirVinculo}
            biometriaSoportada={soportaBiometria}
            biometriaActiva={Boolean(biometria)}
            alActivarBiometria={activarBiometriaDesdePerfil}
            alDesactivarBiometria={desactivarBiometriaDesdePerfil}
            alSalir={() => void salir()}
          />
        )}
        </Suspense>
        </main>
      </div>

      {escritorio && (
        <Suspense fallback={null}>
          <Inspector
            cuenta={sesion.cuenta}
            tarjeta={tarjeta}
            seleccionado={movimientoSeleccionado}
            alLimpiar={limpiarSeleccion}
            alRecargar={irARecargar}
            alVerMovimientos={irAMovimientos}
          />
        </Suspense>
      )}

      <BarraTabs activa={pestana} alCambiar={cambiarPestana} />

      <HojaVincular
        abierta={vinculoAbierto}
        alCerrar={cerrarVinculo}
        alVincular={vincular}
      />

      <Hoja
        abierta={ofreceBiometria && Boolean(sesion)}
        alCerrar={cerrarOfertaBiometria}
        titulo={altaBiometriaLista ? "Biometría activada" : "Entra sin escribir el PIN"}
        descripcion={
          altaBiometriaLista
            ? undefined
            : "Usa la huella de este teléfono para entrar a tu cuenta sin escribir el PIN."
        }
        pie={
          altaBiometriaLista ? (
            <button type="button" className="boton boton--primario" onClick={cerrarOfertaBiometria}>
              Listo
            </button>
          ) : (
            <>
              <button
                type="button"
                className="boton boton--fantasma"
                onClick={cerrarOfertaBiometria}
                disabled={activandoBiometria}
              >
                Ahora no
              </button>
              <button
                type="button"
                className="boton boton--primario"
                onClick={() => void activarBiometriaAhora()}
                disabled={activandoBiometria}
              >
                {activandoBiometria ? (
                  <span className="girador" aria-label="Activando" />
                ) : (
                  <>
                    <Icon name="huella" />
                    Activar
                  </>
                )}
              </button>
            </>
          )
        }
      >
        {altaBiometriaLista ? (
          <div className="exito-mini">
            <span className="exito__sello">
              <Icon name="check" />
            </span>
            <p>
              La próxima vez podrás entrar con tu huella. El PIN sigue siendo la llave
              de respaldo.
            </p>
          </div>
        ) : (
          <div className="alta-biometria">
            <span className="desbloqueo__icono">
              <Icon name="huella" />
            </span>
            <ul className="pasos">
              <li>Confirma la huella que usa tu teléfono para desbloquearse.</li>
              <li>Blink no recibe ni guarda esos datos: quedan en el autenticador del equipo.</li>
              <li>Queda activa en este teléfono hasta que la desactives; el PIN sigue siendo la llave de respaldo.</li>
            </ul>
            {errorAltaBiometria && (
              <div className="aviso aviso--peligro" role="alert">
                <Icon name="alerta" />
                <p>{errorAltaBiometria}</p>
              </div>
            )}
          </div>
        )}
      </Hoja>
      <AvisoActualizacion />
    </div>
  );
}
