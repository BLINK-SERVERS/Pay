import { useState, type KeyboardEvent } from "react";
import { Hoja } from "../components/Hoja";
import { HojaLegal } from "../components/HojaLegal";
import { Icon } from "../components/Icon";
import { PinEntrada } from "../components/PinEntrada";
import { mensajeBiometria } from "../lib/biometria";
import { ErrorBlink } from "../lib/repo";
import { erroresCuentaPago, validarPin } from "../lib/dominio";
import {
  formatearCedula,
  formatearTelefono,
  iniciales,
  nombreCompleto,
  soloDigitos,
} from "../lib/formato";
import { BANCOS, MAXIMO_CUENTAS_PAGO } from "../lib/tipos";
import type { Ajustes, Cuenta, CuentaPago, DatosPago, Tarjeta } from "../lib/tipos";

const SITIO = "https://www.blink.com.ve";

interface Props {
  cuenta: Cuenta;
  tarjetaActiva: Tarjeta | null;
  ajustes: Ajustes;
  alCambiarPin: (actual: string, nuevo: string) => Promise<void>;
  alGuardarCuenta: (id: string | null, datos: DatosPago) => Promise<Cuenta>;
  alBorrarCuenta: (id: string) => Promise<Cuenta>;
  alUsarCuenta: (id: string) => Promise<Cuenta>;
  alVincular: () => void;
  biometriaSoportada: boolean;
  biometriaActiva: boolean;
  alActivarBiometria: () => Promise<void>;
  alDesactivarBiometria: () => void;
  alSalir: () => void;
}

export function Perfil({
  cuenta,
  tarjetaActiva,
  ajustes,
  alCambiarPin,
  alGuardarCuenta,
  alBorrarCuenta,
  alUsarCuenta,
  alVincular,
  biometriaSoportada,
  biometriaActiva,
  alActivarBiometria,
  alDesactivarBiometria,
  alSalir,
}: Props) {
  const [pinAbierto, setPinAbierto] = useState(false);
  const [actual, setActual] = useState("");
  const [nuevo, setNuevo] = useState("");
  const [repetir, setRepetir] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [legalAbierto, setLegalAbierto] = useState(false);
  const [exito, setExito] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [guardandoBiometria, setGuardandoBiometria] = useState(false);
  const [errorBiometria, setErrorBiometria] = useState<string | null>(null);

  const cuentas = cuenta.cuentasPago;
  const [pagoAbierto, setPagoAbierto] = useState(false);
  /** id de la fila en edición; null cuando se está añadiendo una nueva. */
  const [pagoEditando, setPagoEditando] = useState<string | null>(null);
  const [pagoPropio, setPagoPropio] = useState(true);
  const [pagoBanco, setPagoBanco] = useState("");
  const [pagoTelefono, setPagoTelefono] = useState(cuenta.telefono);
  const [pagoCedula, setPagoCedula] = useState(cuenta.cedula);
  const [pagoError, setPagoError] = useState<string | null>(null);
  const [guardandoPago, setGuardandoPago] = useState(false);
  const [errorLista, setErrorLista] = useState<string | null>(null);
  const [porBorrar, setPorBorrar] = useState<CuentaPago | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const nombre = nombreCompleto(cuenta.nombres, cuenta.apellidos);

  function cerrarPin() {
    setPinAbierto(false);
    setActual("");
    setNuevo("");
    setRepetir("");
    setError(null);
    setExito(false);
  }

  async function guardarPin() {
    const problema = validarPin(nuevo);
    if (problema) return setError(problema);
    if (nuevo !== repetir) return setError("Los dos PIN nuevos no coinciden.");
    if (nuevo === actual) return setError("El PIN nuevo debe ser distinto al actual.");
    setGuardando(true);
    setError(null);
    try {
      await alCambiarPin(actual, nuevo);
      setExito(true);
      setActual("");
      setNuevo("");
      setRepetir("");
    } catch (fallo) {
      setError(
        fallo instanceof ErrorBlink ? fallo.message : "No pudimos cambiar el PIN. Inténtalo otra vez."
      );
    } finally {
      setGuardando(false);
    }
  }

  async function alternarBiometria() {
    if (guardandoBiometria) return;
    setErrorBiometria(null);
    if (biometriaActiva) {
      alDesactivarBiometria();
      return;
    }
    setGuardandoBiometria(true);
    try {
      await alActivarBiometria();
    } catch (fallo) {
      setErrorBiometria(mensajeBiometria(fallo));
    } finally {
      setGuardandoBiometria(false);
    }
  }

  function abrirCuenta(pago?: CuentaPago) {
    const esPropia = pago ? pago.propio : true;
    setPagoEditando(pago?.id ?? null);
    setPagoPropio(esPropia);
    setPagoBanco(pago?.banco ?? "");
    setPagoTelefono(esPropia ? cuenta.telefono : (pago?.telefono ?? ""));
    setPagoCedula(esPropia ? cuenta.cedula : (pago?.cedula ?? ""));
    setPagoError(null);
    setPagoAbierto(true);
  }

  async function guardarCuenta() {
    const datos: DatosPago = {
      propio: pagoPropio,
      banco: pagoBanco,
      telefono: soloDigitos(pagoTelefono),
      cedula: pagoCedula,
    };
    const problemas = erroresCuentaPago(datos);
    const primero = Object.values(problemas)[0];
    if (primero) {
      setPagoError(primero);
      return;
    }
    setGuardandoPago(true);
    setPagoError(null);
    try {
      await alGuardarCuenta(pagoEditando, datos);
      setPagoAbierto(false);
    } catch (fallo) {
      setPagoError(
        fallo instanceof ErrorBlink
          ? fallo.message
          : "No pudimos guardar esa cuenta de pago. Inténtalo otra vez."
      );
    } finally {
      setGuardandoPago(false);
    }
  }

  /** «Usar esta» cambia la fuente que Recargar trae por defecto. */
  async function usar(pago: CuentaPago) {
    if (ocupado) return;
    setOcupado(true);
    setErrorLista(null);
    try {
      await alUsarCuenta(pago.id);
    } catch (fallo) {
      setErrorLista(mensajeCuenta(fallo));
    } finally {
      setOcupado(false);
    }
  }

  async function quitar() {
    const pago = porBorrar;
    if (!pago) return;
    setOcupado(true);
    setErrorLista(null);
    try {
      await alBorrarCuenta(pago.id);
      setPorBorrar(null);
    } catch (fallo) {
      setPorBorrar(null);
      setErrorLista(mensajeCuenta(fallo));
    } finally {
      setOcupado(false);
    }
  }

  function mensajeCuenta(fallo: unknown): string {
    return fallo instanceof ErrorBlink
      ? fallo.message
      : "No pudimos actualizar tus cuentas de pago. Inténtalo otra vez.";
  }

  function elegirPago(propio: boolean) {
    setPagoPropio(propio);
    if (propio) {
      setPagoTelefono(cuenta.telefono);
      setPagoCedula(cuenta.cedula);
    }
  }

  /** En un grupo de radio las flechas mueven la selección y el foco juntos. */
  function moverPago(evento: KeyboardEvent<HTMLButtonElement>, propio: boolean) {
    if (evento.key !== "ArrowRight" && evento.key !== "ArrowLeft") return;
    evento.preventDefault();
    const siguiente = !propio;
    elegirPago(siguiente);
    document.getElementById(siguiente ? "pago-propia" : "pago-ajena")?.focus();
  }

  return (
    <div className="vista">
      <header className="cabecera cabecera--titulo">
        <h1 className="cabecera__titulo cabecera__titulo--grande">Mi cuenta</h1>
      </header>

      <section className="identidad">
        <span className="identidad__avatar">{iniciales(nombre)}</span>
        <div className="identidad__datos">
          <strong>{nombre}</strong>
          <span className="mono">{formatearCedula(cuenta.cedula)}</span>
          <span className="mono">{formatearTelefono(cuenta.telefono)}</span>
          <span className="identidad__correo">{cuenta.correo}</span>
        </div>
      </section>

      <section className="panel">
        <h2 className="panel__titulo">Fuentes de pago (Pago Móvil)</h2>
        <ul className="cuentas-pago">
          {cuentas.map((pago) => (
            <li
              key={pago.id}
              className={`cuentas-pago__fila${
                pago.principal ? " cuentas-pago__fila--activa" : ""
              }`}
            >
              <span className="cuentas-pago__icono">
                <Icon name="banco" />
              </span>
              <div className="cuentas-pago__datos">
                <strong>{pago.banco || "Banco por definir"}</strong>
                <span className="mono">
                  {formatearTelefono(pago.telefono)} · {formatearCedula(pago.cedula)}
                </span>
                {pago.principal && (
                  <span className="etiqueta etiqueta--bien">Se usa al recargar</span>
                )}
              </div>
              <div className="cuentas-pago__acciones">
                {!pago.principal && (
                  <button
                    type="button"
                    className="seccion__enlace"
                    onClick={() => void usar(pago)}
                    disabled={ocupado}
                  >
                    Usar esta
                  </button>
                )}
                <button
                  type="button"
                  className="seccion__enlace"
                  onClick={() => abrirCuenta(pago)}
                  disabled={ocupado}
                >
                  Editar
                </button>
                {cuentas.length > 1 && (
                  <button
                    type="button"
                    className="seccion__enlace seccion__enlace--peligro"
                    onClick={() => setPorBorrar(pago)}
                    disabled={ocupado}
                  >
                    Quitar
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>

        {errorLista && (
          <div className="aviso aviso--peligro" role="alert">
            <Icon name="alerta" />
            <p>{errorLista}</p>
          </div>
        )}

        <button
          type="button"
          className="fila-accion"
          onClick={() => abrirCuenta()}
          disabled={cuentas.length >= MAXIMO_CUENTAS_PAGO}
        >
          <span className="fila-accion__icono">
            <Icon name="mas" />
          </span>
          <span className="fila-accion__texto">
            <strong>Añadir otra cuenta de Pago Móvil</strong>
            <span>La de un familiar que te pasa plata</span>
          </span>
          <Icon name="adelante" />
        </button>
        <p className="panel__nota">
          Puedes guardar hasta {MAXIMO_CUENTAS_PAGO} cuentas. Al recargar eliges cuál pagó, sin
          teclear de nuevo el banco ni el teléfono.
        </p>
      </section>

      <section className="panel">
        <h2 className="panel__titulo">Mis tarjetas</h2>
        <button type="button" className="fila-accion" onClick={alVincular}>
          <span className="fila-accion__icono">
            <Icon name="mas" />
          </span>
          <span className="fila-accion__texto">
            <strong>Vincular otra tarjeta</strong>
            <span>La tuya, la de tu hijo o la de un familiar</span>
          </span>
          <Icon name="adelante" />
        </button>
      </section>

      <section className="panel">
        <h2 className="panel__titulo">Seguridad</h2>
        <button type="button" className="fila-accion" onClick={() => setPinAbierto(true)}>
          <span className="fila-accion__icono">
            <Icon name="candado" />
          </span>
          <span className="fila-accion__texto">
            <strong>Cambiar PIN</strong>
            <span>6 dígitos, sin secuencias fáciles</span>
          </span>
          <Icon name="adelante" />
        </button>

        {biometriaSoportada ? (
          <button
            type="button"
            className="fila-accion"
            onClick={() => void alternarBiometria()}
            disabled={guardandoBiometria}
          >
            <span className="fila-accion__icono">
              <Icon name="huella" />
            </span>
            <span className="fila-accion__texto">
              <strong>
                {biometriaActiva ? "Desactivar acceso con huella" : "Activar acceso con huella"}
              </strong>
              <span>
                {biometriaActiva
                  ? "Este teléfono entra con tu huella"
                  : "Entra con tu huella desde este teléfono"}
              </span>
            </span>
            {guardandoBiometria ? (
              <span className="girador" aria-label="Guardando" />
            ) : (
              <Icon name={biometriaActiva ? "check" : "adelante"} />
            )}
          </button>
        ) : (
          <div className="fila-accion fila-accion--estatica">
            <span className="fila-accion__icono">
              <Icon name="huella" />
            </span>
            <span className="fila-accion__texto">
              <strong>Acceso con huella</strong>
              <span>No disponible en este navegador o dispositivo</span>
            </span>
          </div>
        )}

        {errorBiometria && (
          <div className="aviso aviso--peligro" role="alert">
            <Icon name="alerta" />
            <p>{errorBiometria}</p>
          </div>
        )}

        <p className="panel__nota">
          La huella la verifica tu teléfono: Blink no la recibe ni la guarda. Desbloquea tu
          cuenta y no sustituye al PIN, que siempre sirve de respaldo. El vínculo con este
          teléfono se mantiene hasta que desactives la huella.
        </p>
      </section>

      <section className="panel">
        <h2 className="panel__titulo">Blink</h2>
        <a className="fila-accion" href={SITIO} target="_blank" rel="noreferrer">
          <span className="fila-accion__icono">
            <Icon name="escudo" />
          </span>
          <span className="fila-accion__texto">
            <strong>Sitio de Blink</strong>
            <span>blink.com.ve</span>
          </span>
          <Icon name="compartir" />
        </a>
        <a className="fila-accion" href={`mailto:${ajustes.atencion}`}>
          <span className="fila-accion__icono">
            <Icon name="ayuda" />
          </span>
          <span className="fila-accion__texto">
            <strong>Atención al cliente</strong>
            <span className="mono">{ajustes.atencion}</span>
          </span>
          <Icon name="compartir" />
        </a>
        <button type="button" className="fila-accion" onClick={() => setLegalAbierto(true)}>
          <span className="fila-accion__icono">
            <Icon name="documento" />
          </span>
          <span className="fila-accion__texto">
            <strong>Términos y condiciones</strong>
            <span>Tarifa del pasaje y tasa administrativa</span>
          </span>
          <Icon name="adelante" />
        </button>
      </section>

      <button type="button" className="boton boton--peligro" onClick={alSalir}>
        <Icon name="salir" />
        Cerrar sesión
      </button>

      <Hoja
        abierta={pagoAbierto}
        alCerrar={() => setPagoAbierto(false)}
        titulo={pagoEditando ? "Cuenta de Pago Móvil" : "Añadir cuenta de Pago Móvil"}
        descripcion="La cuenta desde donde haces tus Pago Móvil. No tiene que ser tuya."
        pie={
          <>
            <button type="button" className="boton boton--fantasma" onClick={() => setPagoAbierto(false)}>
              Cancelar
            </button>
            <button
              type="button"
              className="boton boton--primario"
              onClick={() => void guardarCuenta()}
              disabled={guardandoPago}
            >
              {guardandoPago ? <span className="girador" aria-label="Guardando" /> : "Guardar"}
            </button>
          </>
        }
      >
        <div className="pin-form">
          <div className="segmentado" role="radiogroup" aria-label="Origen de la fuente de pago">
            <button
              type="button"
              role="radio"
              id="pago-propia"
              aria-checked={pagoPropio}
              tabIndex={pagoPropio ? 0 : -1}
              className={`segmentado__opcion${pagoPropio ? " segmentado__opcion--activa" : ""}`}
              onClick={() => elegirPago(true)}
              onKeyDown={(evento) => moverPago(evento, true)}
            >
              Mis datos
            </button>
            <button
              type="button"
              role="radio"
              id="pago-ajena"
              aria-checked={!pagoPropio}
              tabIndex={pagoPropio ? -1 : 0}
              className={`segmentado__opcion${!pagoPropio ? " segmentado__opcion--activa" : ""}`}
              onClick={() => elegirPago(false)}
              onKeyDown={(evento) => moverPago(evento, false)}
            >
              Otra cuenta
            </button>
          </div>

          <div className="campo">
            <label className="campo__etiqueta" htmlFor="perfil-banco">
              Banco emisor
            </label>
            <select
              id="perfil-banco"
              className="entrada"
              value={pagoBanco}
              onChange={(evento) => setPagoBanco(evento.target.value)}
              aria-invalid={pagoError && !pagoBanco ? true : undefined}
              aria-describedby={pagoError && !pagoBanco ? "pago-error" : undefined}
            >
              <option value="">Selecciona tu banco…</option>
              {BANCOS.map((banco) => (
                <option key={banco.codigo} value={banco.nombre}>
                  {banco.codigo} · {banco.nombre}
                </option>
              ))}
            </select>
          </div>

          <div className="campo">
            <label className="campo__etiqueta" htmlFor="perfil-telefono">
              Teléfono del Pago Móvil
            </label>
            <input
              id="perfil-telefono"
              className="entrada mono"
              type="tel"
              inputMode="tel"
              maxLength={12}
              value={formatearTelefono(pagoTelefono)}
              onChange={(evento) => setPagoTelefono(soloDigitos(evento.target.value))}
              disabled={pagoPropio}
              aria-describedby={pagoError ? "pago-error" : undefined}
            />
          </div>

          <div className="campo">
            <label className="campo__etiqueta" htmlFor="perfil-cedula">
              C.I. del titular
            </label>
            <input
              id="perfil-cedula"
              className="entrada mono"
              inputMode="numeric"
              maxLength={8}
              placeholder="12345678"
              value={pagoCedula}
              onChange={(evento) => setPagoCedula(formatearCedula(evento.target.value))}
              disabled={pagoPropio}
              aria-describedby={pagoError ? "pago-error" : undefined}
            />
          </div>

          {pagoError && (
            <div className="aviso aviso--peligro" role="alert" id="pago-error">
              <Icon name="alerta" />
              <p>{pagoError}</p>
            </div>
          )}
        </div>
      </Hoja>

      <Hoja
        abierta={Boolean(porBorrar)}
        alCerrar={() => setPorBorrar(null)}
        titulo="Quitar esta cuenta"
        descripcion={
          porBorrar
            ? `Dejas de tener guardado el Pago Móvil de ${porBorrar.banco || "tu cuenta"} · ${formatearTelefono(porBorrar.telefono)}. Puedes añadirlo otra vez cuando quieras.`
            : ""
        }
        pie={
          <>
            <button type="button" className="boton boton--fantasma" onClick={() => setPorBorrar(null)}>
              Cancelar
            </button>
            <button type="button" className="boton boton--peligro" onClick={() => void quitar()}>
              Quitar
            </button>
          </>
        }
      />

      <Hoja
        abierta={pinAbierto}
        alCerrar={cerrarPin}
        titulo="Cambiar PIN"
        descripcion="Elige seis dígitos que no sean fáciles de adivinar."
        pie={
          exito ? (
            <button type="button" className="boton boton--primario" onClick={cerrarPin}>
              Listo
            </button>
          ) : (
            <>
              <button type="button" className="boton boton--fantasma" onClick={cerrarPin}>
                Cancelar
              </button>
              <button
                type="button"
                className="boton boton--primario"
                onClick={() => void guardarPin()}
                disabled={guardando}
              >
                {guardando ? <span className="girador" aria-label="Guardando" /> : "Guardar PIN"}
              </button>
            </>
          )
        }
      >
        {exito ? (
          <div className="exito-mini">
            <span className="exito__sello">
              <Icon name="check" />
            </span>
            <p>Tu PIN quedó actualizado. Úsalo la próxima vez que entres.</p>
          </div>
        ) : (
          <div className="pin-form">
            <div className="campo">
              <span className="campo__etiqueta">PIN actual</span>
              <PinEntrada valor={actual} alCambiar={setActual} etiqueta="PIN actual" autoFocus />
            </div>
            <div className="campo">
              <span className="campo__etiqueta">PIN nuevo</span>
              <PinEntrada valor={nuevo} alCambiar={setNuevo} etiqueta="PIN nuevo" />
            </div>
            <div className="campo">
              <span className="campo__etiqueta">Repite el PIN nuevo</span>
              <PinEntrada valor={repetir} alCambiar={setRepetir} etiqueta="Repite el PIN nuevo" />
            </div>
            {error && (
              <div className="aviso aviso--peligro" role="alert">
                <Icon name="alerta" />
                <p>{error}</p>
              </div>
            )}
          </div>
        )}
      </Hoja>

      <HojaLegal
        abierta={legalAbierto}
        alCerrar={() => setLegalAbierto(false)}
        tarifa={tarjetaActiva?.tarifa ?? ajustes.tarifario.base}
      />
    </div>
  );
}
