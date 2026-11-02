import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BarraTabs, type Pestana } from "./components/BarraTabs";
import { Hoja } from "./components/Hoja";
import { HojaVincular } from "./components/HojaVincular";
import { Icon } from "./components/Icon";
import { Acceso } from "./pages/Acceso";
import { Inicio } from "./pages/Inicio";
import { Movimientos } from "./pages/Movimientos";
import { Perfil } from "./pages/Perfil";
import { Recargar } from "./pages/Recargar";
import { ajustesPorDefecto } from "./lib/ajustes";
import { repositorio } from "./lib/repo";
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

function guardarSesion(token: string) {
  localStorage.setItem(
    CLAVE_SESION,
    JSON.stringify({ token, expira: Date.now() + 12 * 60 * 60 * 1000 })
  );
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
    (async () => {
      try {
        const config = await repositorio.ajustes();
        if (vivo) setAjustes(config);
        const guardada = leerSesionGuardada();
        if (!guardada) {
          olvidarCopia();
          return;
        }
        const actual = await repositorio.sesion(guardada.token);
        if (!vivo) return;
        setSesion(actual);
        setSerialActiva(actual.tarjetas[0]?.serial ?? null);
      } catch {
        localStorage.removeItem(CLAVE_SESION);
        olvidarCopia();
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
    localStorage.removeItem(CLAVE_SESION);
    if (actual) {
      try {
        await repositorio.salir(actual);
      } catch {
        // El token ya no existe en el servidor: nada que limpiar.
      }
    }
  }, [token]);

  useEffect(() => {
    function alCambiarVisibilidad() {
      if (document.hidden) {
        ocultoDesde.current = Date.now();
        return;
      }
      const oculto = ocultoDesde.current;
      ocultoDesde.current = null;
      if (oculto && Date.now() - oculto > BLOQUEO_INACTIVO) {
        void salir();
        return;
      }
      if (sesion) void refrescar();
    }
    document.addEventListener("visibilitychange", alCambiarVisibilidad);
    return () => document.removeEventListener("visibilitychange", alCambiarVisibilidad);
  }, [salir, refrescar, sesion]);

  function alEntrar(nueva: Sesion) {
    guardarSesion(nueva.token);
    setSesion(nueva);
    setSerialActiva(nueva.tarjetas[0]?.serial ?? null);
    setPestana("inicio");
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

  if (!sesion) {
    return <Acceso alEntrar={alEntrar} tarifa={ajustes.tarifario.base} />;
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
    </div>
  );
}
