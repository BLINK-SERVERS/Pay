import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BarraTabs, type Pestana } from "./components/BarraTabs";
import { Desbloqueo } from "./components/Desbloqueo";
import { Hoja } from "./components/Hoja";
import { HojaVincular } from "./components/HojaVincular";
import { Icon } from "./components/Icon";
import { Acceso } from "./pages/Acceso";
import { Inicio } from "./pages/Inicio";
import { Movimientos } from "./pages/Movimientos";
import { Perfil } from "./pages/Perfil";
import { Recargar } from "./pages/Recargar";
import { ajustesPorDefecto } from "./lib/ajustes";
import {
  activarBiometria,
  biometriaSoportada,
  desbloquearConBiometria,
  guardarSesionBiometria,
  leerRegistroBiometria,
  marcarOfrecimiento,
  mensajeBiometria,
  ofrecimientoHecho,
  olvidarBiometria,
  olvidarTokenBiometria,
  registroDesbloqueable,
  type RegistroBiometria,
} from "./lib/biometria";
import { ErrorBlink, repositorio } from "./lib/repo";
import { aplicarTema, leerTema, useCopiar, type ModoTema } from "./lib/hooks";
import { olvidarCopia } from "./lib/offline";
import { formatearBs, formatearSerial } from "./lib/formato";
import type { Ajustes, Cuenta, DatosPago, Movimiento, RecargaNueva, Sesion, Tarjeta } from "./lib/tipos";

const CLAVE_SESION = "blink.tarjeta.sesion";
const BLOQUEO_INACTIVO = 30 * 60 * 1000;

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

export function App() {
  const [sesion, setSesion] = useState<Sesion | null>(null);
  const [serialActiva, setSerialActiva] = useState<string | null>(null);
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [ajustes, setAjustes] = useState<Ajustes>(ajustesPorDefecto());
  const [pestana, setPestana] = useState<Pestana>("inicio");
  const [tema, setTema] = useState<ModoTema>(leerTema);
  const [saldoOculto, setSaldoOculto] = useState(false);
  const [restaurando, setRestaurando] = useState(true);
  const [pagoMovilAbierto, setPagoMovilAbierto] = useState(false);
  const [vinculoAbierto, setVinculoAbierto] = useState(false);
  const [copiado, copiar] = useCopiar();
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
  const ocultoDesde = useRef<number | null>(null);

  const token = sesion?.token ?? null;

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
    (async () => {
      try {
        const config = await repositorio.ajustes();
        if (vivo) setAjustes(config);
        const guardada = leerSesionGuardada();
        if (!guardada) {
          olvidarCopia();
          return;
        }

        const registro = leerRegistroBiometria();
        if (registro && registro.token === guardada.token && registroDesbloqueable(registro)) {
          if (vivo) {
            setBiometria(registro);
            setBloqueo(registro);
          }
          return;
        }
        if (registro && registro.token !== guardada.token) {
          // El token guardado no es el de la sesión: no hay nada que
          // desbloquear con biometría. Se conserva la credencial para el
          // próximo acceso con PIN.
          olvidarTokenBiometria();
          if (vivo) setBiometria(leerRegistroBiometria());
        }

        const actual = await repositorio.sesion(guardada.token);
        if (!vivo) return;
        setSesion(actual);
        setSerialActiva(actual.tarjetas[0]?.serial ?? null);
      } catch {
        localStorage.removeItem(CLAVE_SESION);
        olvidarCopia();
        olvidarTokenBiometria();
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
      return;
    }
    let vivo = true;
    repositorio
      .movimientos(token, serialActiva)
      .then((lista) => {
        if (vivo) setMovimientos(lista);
      })
      .catch(() => {
        if (vivo) setMovimientos([]);
      });
    return () => {
      vivo = false;
    };
  }, [token, serialActiva]);

  const refrescar = useCallback(async () => {
    if (!token || !serialActiva) return;
    try {
      const actual = await repositorio.sesion(token);
      setSesion(actual);
      setMovimientos(await repositorio.movimientos(token, serialActiva));
    } catch {
      // La sesión pudo expirar; el siguiente intento de acción lo dirá.
    }
  }, [token, serialActiva]);

  const salir = useCallback(async () => {
    const actual = token;
    setSesion(null);
    setSerialActiva(null);
    setMovimientos([]);
    setPestana("inicio");
    setSaldoOculto(false);
    setBloqueo(null);
    localStorage.removeItem(CLAVE_SESION);
    // El token se revoca en el servidor; la credencial del teléfono se
    // conserva para volver a enlazarla tras el próximo acceso con PIN.
    olvidarTokenBiometria();
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
    setSesion(null);
    setSerialActiva(null);
    setMovimientos([]);
    setPestana("inicio");
    setSaldoOculto(false);
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

  async function desbloquear() {
    const token = await desbloquearConBiometria();
    try {
      const actual = await repositorio.sesion(token);
      const registro = leerRegistroBiometria();
      guardarSesion(token, registro?.expira);
      setSesion(actual);
      setSerialActiva(actual.tarjetas[0]?.serial ?? null);
      setPestana("inicio");
      setBloqueo(null);
      setAvisoAcceso(null);
      setBiometria(registro);
    } catch (error) {
      if (error instanceof ErrorBlink && error.codigo === "sesion") {
        localStorage.removeItem(CLAVE_SESION);
        olvidarCopia();
        olvidarTokenBiometria();
        setBiometria(leerRegistroBiometria());
        setBloqueo(null);
        setAvisoAcceso("La sesión guardada venció. Entra con tu PIN para renovarla.");
      }
      throw error;
    }
  }

  function usarPin() {
    setBloqueo(null);
    setAvisoAcceso(null);
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
      const registro = await activarBiometria(sesion);
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
    const registro = await activarBiometria(sesion);
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
    const registro = guardarSesionBiometria(nueva);
    setBiometria(registro ?? leerRegistroBiometria());
    setSesion(nueva);
    setSerialActiva(nueva.tarjetas[0]?.serial ?? null);
    setPestana("inicio");
    setBloqueo(null);
    setAvisoAcceso(null);
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
    await refrescar();
    return movimiento;
  }

  async function cambiarPin(actual: string, nuevo: string) {
    if (!token) throw new Error("Sin sesión activa.");
    await repositorio.cambiarPin(token, actual, nuevo);
  }

  async function actualizarPago(datosPago: DatosPago): Promise<Cuenta> {
    if (!token) throw new Error("Sin sesión activa.");
    const cuenta = await repositorio.actualizarPago(token, datosPago);
    setSesion((previa) => (previa ? { ...previa, cuenta } : previa));
    return cuenta;
  }

  function cambiarPestana(nueva: Pestana) {
    setPestana(nueva);
    if (nueva === "inicio" || nueva === "movimientos") void refrescar();
  }

  function cambiarTema(nuevo: ModoTema) {
    setTema(nuevo);
    aplicarTema(nuevo);
  }

  if (restaurando) {
    return (
      <div className="arranque" role="status" aria-label="Abriendo tu tarjeta">
        <span className="marca marca--grande">
          BLINK<em>TARJETA</em>
        </span>
        <span className="girador girador--grande" />
      </div>
    );
  }

  const accesoBiometrico =
    registroDesbloqueable(biometria) && biometria
      ? { nombre: biometria.nombre, cedula: biometria.cedula }
      : null;

  if (!sesion && bloqueo) {
    return (
      <Desbloqueo
        nombre={bloqueo.nombre}
        cedula={bloqueo.cedula}
        alDesbloquear={desbloquear}
        alUsarPin={usarPin}
      />
    );
  }

  if (!sesion) {
    return (
      <Acceso
        alEntrar={alEntrar}
        tarifa={ajustes.tarifario.base}
        biometria={accesoBiometrico}
        alEntrarConBiometria={accesoBiometrico ? desbloquear : undefined}
        avisoInicial={avisoAcceso}
      />
    );
  }

  return (
    <div className={`app app--${pestana}`}>
      <main className="app__main" id="contenido">
        {pestana === "inicio" && (
          <Inicio
            cuenta={sesion.cuenta}
            tarjetas={sesion.tarjetas}
            tarjeta={tarjeta}
            movimientos={movimientos}
            saldoOculto={saldoOculto}
            alAlternarSaldo={() => setSaldoOculto((valor) => !valor)}
            alSeleccionar={setSerialActiva}
            alVincular={() => setVinculoAbierto(true)}
            alRecargar={() => cambiarPestana("recargar")}
            alVerMovimientos={() => cambiarPestana("movimientos")}
            alVerPerfil={() => cambiarPestana("perfil")}
            alAbrirPagoMovil={() => setPagoMovilAbierto(true)}
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
                onClick={() => setVinculoAbierto(true)}
              >
                <Icon name="mas" />
                Vincular una tarjeta
              </button>
            </section>
          </div>
        )}

        {tarjeta && pestana === "movimientos" && (
          <Movimientos tarjeta={tarjeta} movimientos={movimientos} />
        )}
        {tarjeta && pestana === "recargar" && (
          <Recargar
            tarjeta={tarjeta}
            datosPago={sesion.cuenta.datosPago}
            ajustes={ajustes}
            movimientos={movimientos}
            alReportar={reportarRecarga}
            alInicio={() => cambiarPestana("inicio")}
            alVerMovimientos={() => cambiarPestana("movimientos")}
            alEditarPago={() => cambiarPestana("perfil")}
          />
        )}
        {pestana === "perfil" && (
          <Perfil
            cuenta={sesion.cuenta}
            tarjetas={sesion.tarjetas}
            tarjetaActiva={tarjeta}
            ajustes={ajustes}
            tema={tema}
            modoDatos={repositorio.modo}
            alCambiarTema={cambiarTema}
            alCambiarPin={cambiarPin}
            alActualizarPago={actualizarPago}
            alVincular={() => setVinculoAbierto(true)}
            biometriaSoportada={soportaBiometria}
            biometriaActiva={Boolean(biometria)}
            alActivarBiometria={activarBiometriaDesdePerfil}
            alDesactivarBiometria={desactivarBiometriaDesdePerfil}
            alSalir={() => void salir()}
          />
        )}
      </main>

      <BarraTabs activa={pestana} alCambiar={cambiarPestana} />

      <Hoja
        abierta={pagoMovilAbierto}
        alCerrar={() => setPagoMovilAbierto(false)}
        titulo="Pago Móvil de BLINK"
        descripcion="Transfiere desde tu banco y reporta la referencia en Recargar."
      >
        <dl className="datos datos--copiar">
          {[
            ["Banco", ajustes.pagoMovil.banco, "pm-banco"],
            ["RIF", ajustes.pagoMovil.rif, "pm-rif"],
            ["Teléfono", ajustes.pagoMovil.telefono, "pm-telefono"],
            ["Titular", ajustes.pagoMovil.titular, "pm-titular"],
          ].map(([etiqueta, valor, clave]) => (
            <div key={clave}>
              <dt>{etiqueta}</dt>
              <dd>
                <span className="mono">{valor}</span>
                <button
                  type="button"
                  className="boton-copiar"
                  onClick={() => void copiar(valor, clave)}
                  aria-label={`Copiar ${etiqueta.toLowerCase()}`}
                >
                  <Icon name={copiado === clave ? "check" : "copiar"} />
                </button>
              </dd>
            </div>
          ))}
        </dl>
        <ol className="pasos">
          <li>Abre tu banco y elige Pago Móvil.</li>
          <li>
            Paga {formatearBs((tarjeta?.tarifa ?? 15) * 10)} o el monto que quieras a los datos
            de arriba.
          </li>
          <li>Vuelve aquí, toca Recargar y reporta la referencia.</li>
        </ol>
        <button
          type="button"
          className="boton boton--primario"
          onClick={() => {
            setPagoMovilAbierto(false);
            cambiarPestana("recargar");
          }}
        >
          <Icon name="recargar" />
          Reportar una recarga
        </button>
      </Hoja>

      <HojaVincular
        abierta={vinculoAbierto}
        alCerrar={() => setVinculoAbierto(false)}
        alVincular={vincular}
      />

      <Hoja
        abierta={ofreceBiometria && Boolean(sesion)}
        alCerrar={cerrarOfertaBiometria}
        titulo={altaBiometriaLista ? "Biometría activada" : "Entra sin escribir el PIN"}
        descripcion={
          altaBiometriaLista
            ? undefined
            : "Usa la huella o el rostro de este teléfono para desbloquear tu sesión guardada."
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
              La próxima vez podrás entrar con tu huella o rostro. El PIN sigue siendo la llave
              de respaldo.
            </p>
          </div>
        ) : (
          <div className="alta-biometria">
            <span className="desbloqueo__icono">
              <Icon name="huella" />
            </span>
            <ul className="pasos">
              <li>Confirma la huella o el rostro que usa tu teléfono para desbloquearse.</li>
              <li>BLINK no recibe ni guarda esos datos: quedan en el autenticador del equipo.</li>
              <li>La sesión guardada dura 12 horas; después, o si cierras sesión, se pide el PIN.</li>
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
    </div>
  );
}
