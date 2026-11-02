import { useState } from "react";
import { Hoja } from "../components/Hoja";
import { HojaLegal } from "../components/HojaLegal";
import { Icon } from "../components/Icon";
import { PinEntrada } from "../components/PinEntrada";
import { ErrorBlink } from "../lib/repo";
import { erroresDatosPago, validarPin } from "../lib/dominio";
import {
  formatearBs,
  formatearFecha,
  formatearTelefono,
  formatearVence,
  iniciales,
  nombreCompleto,
  soloDigitos,
} from "../lib/formato";
import type { ModoTema } from "../lib/hooks";
import { BANCOS } from "../lib/tipos";
import type { Ajustes, Cuenta, DatosPago, Tarjeta } from "../lib/tipos";

const SITIO = "https://www.blink.com.ve";

const APARIENCIAS: { id: ModoTema; etiqueta: string; icono: "auto" | "sol" | "luna" }[] = [
  { id: "auto", etiqueta: "Auto", icono: "auto" },
  { id: "claro", etiqueta: "Claro", icono: "sol" },
  { id: "oscuro", etiqueta: "Oscuro", icono: "luna" },
];

interface Props {
  cuenta: Cuenta;
  tarjetas: Tarjeta[];
  tarjetaActiva: Tarjeta | null;
  ajustes: Ajustes;
  tema: ModoTema;
  modoDatos: "local" | "nube";
  alCambiarTema: (tema: ModoTema) => void;
  alCambiarPin: (actual: string, nuevo: string) => Promise<void>;
  alActualizarPago: (datos: DatosPago) => Promise<Cuenta>;
  alVincular: () => void;
  alSalir: () => void;
}

export function Perfil({
  cuenta,
  tarjetas,
  tarjetaActiva,
  ajustes,
  tema,
  modoDatos,
  alCambiarTema,
  alCambiarPin,
  alActualizarPago,
  alVincular,
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

  const [pagoAbierto, setPagoAbierto] = useState(false);
  const [pagoPropio, setPagoPropio] = useState(cuenta.datosPago.propio);
  const [pagoBanco, setPagoBanco] = useState(cuenta.datosPago.banco);
  const [pagoTelefono, setPagoTelefono] = useState(cuenta.datosPago.telefono);
  const [pagoCedula, setPagoCedula] = useState(cuenta.datosPago.cedula);
  const [pagoError, setPagoError] = useState<string | null>(null);
  const [pagoGuardado, setPagoGuardado] = useState(false);
  const [guardandoPago, setGuardandoPago] = useState(false);

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

  function abrirPago() {
    setPagoPropio(cuenta.datosPago.propio);
    setPagoBanco(cuenta.datosPago.banco);
    setPagoTelefono(cuenta.datosPago.telefono);
    setPagoCedula(cuenta.datosPago.cedula);
    setPagoError(null);
    setPagoGuardado(false);
    setPagoAbierto(true);
  }

  async function guardarPago() {
    const datos: DatosPago = {
      propio: pagoPropio,
      banco: pagoBanco,
      telefono: soloDigitos(pagoTelefono),
      cedula: pagoCedula,
    };
    if (!datos.banco) {
      setPagoError("Selecciona el banco emisor de tu cuenta.");
      return;
    }
    const problemas = erroresDatosPago(datos);
    const primero = Object.values(problemas)[0];
    if (primero) {
      setPagoError(primero);
      return;
    }
    setGuardandoPago(true);
    setPagoError(null);
    try {
      await alActualizarPago(datos);
      setPagoGuardado(true);
    } catch (fallo) {
      setPagoError(
        fallo instanceof ErrorBlink
          ? fallo.message
          : "No pudimos guardar tus datos de pago. Inténtalo otra vez."
      );
    } finally {
      setGuardandoPago(false);
    }
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
          <span className="mono">{cuenta.cedula}</span>
          <span className="mono">{formatearTelefono(cuenta.telefono)}</span>
          <span className="identidad__correo">{cuenta.correo}</span>
        </div>
        <span className="etiqueta etiqueta--bien">
          {tarjetas.length} {tarjetas.length === 1 ? "tarjeta" : "tarjetas"}
        </span>
      </section>

      <section className="panel">
        <h2 className="panel__titulo">Fuente de pago (Pago Móvil)</h2>
        <dl className="filas">
          <div>
            <dt>Banco</dt>
            <dd>{cuenta.datosPago.banco || "Por definir"}</dd>
          </div>
          <div>
            <dt>Teléfono</dt>
            <dd className="mono">{formatearTelefono(cuenta.datosPago.telefono)}</dd>
          </div>
          <div>
            <dt>Cédula</dt>
            <dd className="mono">{cuenta.datosPago.cedula}</dd>
          </div>
          <div>
            <dt>Origen</dt>
            <dd>
              {cuenta.datosPago.propio ? "Datos de tu registro" : "Cuenta de un tercero"}
            </dd>
          </div>
        </dl>
        <button type="button" className="fila-accion" onClick={abrirPago}>
          <span className="fila-accion__icono">
            <Icon name="banco" />
          </span>
          <span className="fila-accion__texto">
            <strong>Editar datos de pago</strong>
            <span>Banco, teléfono y cédula desde donde recargas</span>
          </span>
          <Icon name="adelante" />
        </button>
      </section>

      <section className="panel">
        <h2 className="panel__titulo">Mis tarjetas</h2>
        <ul className="billetera-lista">
          {tarjetas.map((item) => (
            <li
              key={item.serial}
              className={`billetera-lista__fila${
                item.serial === tarjetaActiva?.serial ? " billetera-lista__fila--activa" : ""
              }`}
            >
              <span className="billetera-lista__icono">
                <Icon name="tarjeta" />
              </span>
              <span className="billetera-lista__datos">
                <strong className="mono">{item.serial}</strong>
                <span>
                  {item.titular.nombre} · {formatearBs(item.saldo)}
                </span>
              </span>
              <span
                className={`etiqueta ${
                  item.estado === "activa" ? "etiqueta--bien" : "etiqueta--mal"
                }`}
              >
                {item.estado === "activa" ? "Activa" : "Bloqueada"}
              </span>
            </li>
          ))}
        </ul>
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

      {tarjetaActiva && (
        <section className="panel">
          <h2 className="panel__titulo">Tarjeta seleccionada</h2>
          <dl className="filas">
            <div>
              <dt>Serial</dt>
              <dd className="mono">{tarjetaActiva.serial}</dd>
            </div>
            <div>
              <dt>Chip (UID)</dt>
              <dd className="mono">{tarjetaActiva.uid || "Sin enrolar"}</dd>
            </div>
            <div>
              <dt>Saldo</dt>
              <dd>{formatearBs(tarjetaActiva.saldo)}</dd>
            </div>
            <div>
              <dt>Tarifa del pasaje</dt>
              <dd>{formatearBs(tarjetaActiva.tarifa)}</dd>
            </div>
            <div>
              <dt>Emitida</dt>
              <dd>{formatearFecha(tarjetaActiva.emitida)}</dd>
            </div>
            <div>
              <dt>Vence</dt>
              <dd className="mono">{formatearVence(tarjetaActiva.vence)}</dd>
            </div>
          </dl>
        </section>
      )}

      <section className="panel">
        <h2 className="panel__titulo">Apariencia</h2>
        <div className="segmentado segmentado--tres" role="radiogroup" aria-label="Apariencia">
          {APARIENCIAS.map((opcion) => (
            <button
              key={opcion.id}
              type="button"
              role="radio"
              aria-checked={tema === opcion.id}
              className={`segmentado__opcion${
                tema === opcion.id ? " segmentado__opcion--activa" : ""
              }`}
              onClick={() => alCambiarTema(opcion.id)}
            >
              <Icon name={opcion.icono} />
              {opcion.etiqueta}
            </button>
          ))}
        </div>
        <p className="panel__nota">«Auto» sigue la apariencia del teléfono.</p>
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
        <p className="panel__nota">
          La sesión se cierra sola a las 12 horas. El PIN nunca se envía a un tercero; se
          verifica contra su hash.
        </p>
      </section>

      <section className="panel">
        <h2 className="panel__titulo">BLINK</h2>
        <a className="fila-accion" href={SITIO} target="_blank" rel="noreferrer">
          <span className="fila-accion__icono">
            <Icon name="escudo" />
          </span>
          <span className="fila-accion__texto">
            <strong>Sitio de BLINK</strong>
            <span>blink.com.ve</span>
          </span>
          <Icon name="compartir" />
        </a>
        <div className="fila-accion fila-accion--estatica">
          <span className="fila-accion__icono">
            <Icon name="ayuda" />
          </span>
          <span className="fila-accion__texto">
            <strong>Atención al cliente</strong>
            <span className="mono">{ajustes.atencion}</span>
          </span>
        </div>
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

      <p className="panel__nota panel__nota--centro">
        BLINK TARJETA v{__APP_VERSION__} ·{" "}
        {modoDatos === "nube" ? "Conectada a BLINK Cloud" : "Modo demostración (datos locales)"}
      </p>

      <button type="button" className="boton boton--peligro" onClick={alSalir}>
        <Icon name="salir" />
        Cerrar sesión
      </button>

      <Hoja
        abierta={pagoAbierto}
        alCerrar={() => setPagoAbierto(false)}
        titulo="Datos de pago"
        descripcion="La cuenta desde donde haces tus Pago Móvil. No tiene que ser tuya."
        pie={
          pagoGuardado ? (
            <button type="button" className="boton boton--primario" onClick={() => setPagoAbierto(false)}>
              Listo
            </button>
          ) : (
            <>
              <button type="button" className="boton boton--fantasma" onClick={() => setPagoAbierto(false)}>
                Cancelar
              </button>
              <button
                type="button"
                className="boton boton--primario"
                onClick={() => void guardarPago()}
                disabled={guardandoPago}
              >
                {guardandoPago ? <span className="girador" aria-label="Guardando" /> : "Guardar"}
              </button>
            </>
          )
        }
      >
        {pagoGuardado ? (
          <div className="exito-mini">
            <span className="exito__sello">
              <Icon name="check" />
            </span>
            <p>Tus datos de pago quedaron actualizados.</p>
          </div>
        ) : (
          <div className="pin-form">
            <div className="segmentado" role="radiogroup" aria-label="Origen de la fuente de pago">
              <button
                type="button"
                role="radio"
                aria-checked={pagoPropio}
                className={`segmentado__opcion${pagoPropio ? " segmentado__opcion--activa" : ""}`}
                onClick={() => {
                  setPagoPropio(true);
                  setPagoTelefono(cuenta.telefono);
                  setPagoCedula(cuenta.cedula);
                }}
              >
                Mis datos
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={!pagoPropio}
                className={`segmentado__opcion${!pagoPropio ? " segmentado__opcion--activa" : ""}`}
                onClick={() => setPagoPropio(false)}
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
              <span className="campo__etiqueta">Teléfono del Pago Móvil</span>
              <input
                className="entrada mono"
                type="tel"
                inputMode="tel"
                maxLength={12}
                value={formatearTelefono(pagoTelefono)}
                onChange={(evento) => setPagoTelefono(soloDigitos(evento.target.value))}
                aria-label="Teléfono del Pago Móvil"
                disabled={pagoPropio}
              />
            </div>

            <div className="campo">
              <span className="campo__etiqueta">Cédula del titular</span>
              <input
                className="entrada mono"
                value={pagoCedula}
                onChange={(evento) => setPagoCedula(evento.target.value)}
                aria-label="Cédula del titular de la cuenta de pago"
                disabled={pagoPropio}
              />
            </div>

            {pagoError && (
              <div className="aviso aviso--peligro" role="alert">
                <Icon name="alerta" />
                <p>{pagoError}</p>
              </div>
            )}
          </div>
        )}
      </Hoja>

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
