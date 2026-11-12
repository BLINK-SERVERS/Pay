import { useState, type FormEvent } from "react";
import { Icon } from "../components/Icon";
import { PinEntrada } from "../components/PinEntrada";
import { Hoja } from "../components/Hoja";
import { HojaLegal } from "../components/HojaLegal";
import { MarcaPay } from "../components/MarcaPay";
import { mensajeBiometria } from "../lib/biometria";
import { ErrorBlink } from "../lib/repo";
import { repositorio, type Repositorio } from "../lib/repo";
import {
  erroresDatosPago,
  validarCedula,
  validarCorreo,
  validarNombre,
  validarPin,
  validarTelefono,
} from "../lib/dominio";
import { formatearCedula, formatearTelefono, soloDigitos } from "../lib/formato";
import { BANCOS, type DatosPago, type Sesion } from "../lib/tipos";

type Modo = "entrar" | "registro";
type PasoRegistro = "datos" | "pago";

interface Props {
  repo?: Repositorio;
  alEntrar: (sesion: Sesion) => void;
  /** Tarifa vigente que se muestra en los términos legales. */
  tarifa?: number;
  /** Cuenta con sesión guardada que puede desbloquearse con biometría. */
  biometria?: { nombre: string; cedula: string } | null;
  alEntrarConBiometria?: () => Promise<void>;
  /** Aviso que dejó una sesión vencida o revocada. */
  avisoInicial?: string | null;
  /** Pestaña con la que abre: la decide el enlace (`#entrar` o `#registro`). */
  modoInicial?: Modo;
  /** Vuelve a la landing de pay.blink.com.ve. Sin él no se muestra el botón. */
  alVolver?: () => void;
}

export function Acceso({
  repo = repositorio,
  alEntrar,
  tarifa = 500,
  biometria = null,
  alEntrarConBiometria,
  avisoInicial = null,
  modoInicial = "entrar",
  alVolver,
}: Props) {
  const [modo, setModo] = useState<Modo>(modoInicial);

  // Entrar
  const [cedula, setCedula] = useState("");
  const [pin, setPin] = useState("");

  // Registro
  const [paso, setPaso] = useState<PasoRegistro>("datos");
  const [documento, setDocumento] = useState("");
  const [nombres, setNombres] = useState("");
  const [apellidos, setApellidos] = useState("");
  const [telefono, setTelefono] = useState("");
  const [correo, setCorreo] = useState("");
  const [pinNuevo, setPinNuevo] = useState("");
  const [pinRepetido, setPinRepetido] = useState("");
  const [pagoPropio, setPagoPropio] = useState<boolean | null>(null);
  const [pagoBanco, setPagoBanco] = useState("");
  const [pagoTelefono, setPagoTelefono] = useState("");
  const [pagoCedula, setPagoCedula] = useState("");

  const [errores, setErrores] = useState<Record<string, string>>({});
  const [aviso, setAviso] = useState<string | null>(avisoInicial);
  const [enviando, setEnviando] = useState(false);
  const [ayuda, setAyuda] = useState(false);
  const [legalAbierto, setLegalAbierto] = useState(false);

  const demo = repo.modo === "local";

  function cambiarModo(nuevo: Modo) {
    setModo(nuevo);
    setErrores({});
    setAviso(null);
    setPin("");
    setPaso("datos");
    setPagoPropio(null);
  }

  async function enviarLogin(evento?: FormEvent, pinActual = pin) {
    evento?.preventDefault();
    if (enviando) return;
    const nuevos: Record<string, string> = {};
    const errorCedula = validarCedula(cedula);
    if (errorCedula) nuevos.cedula = errorCedula;
    if (pinActual.length !== 6) nuevos.pin = "Escribe tu PIN de 6 dígitos.";
    setErrores(nuevos);
    if (Object.keys(nuevos).length > 0) return;

    setEnviando(true);
    setAviso(null);
    try {
      alEntrar(await repo.entrar(cedula, pinActual));
    } catch (error) {
      setAviso(
        error instanceof ErrorBlink
          ? error.message
          : "No pudimos completar la operación. Inténtalo de nuevo."
      );
      setPin("");
    } finally {
      setEnviando(false);
    }
  }

  async function entrarConBiometria() {
    if (enviando || !alEntrarConBiometria) return;
    setEnviando(true);
    setAviso(null);
    try {
      await alEntrarConBiometria();
    } catch (error) {
      setAviso(mensajeBiometria(error));
    } finally {
      setEnviando(false);
    }
  }

  function validarDatosRegistro(): boolean {
    const nuevos: Record<string, string> = {};
    const nombre = validarNombre(nombres, "nombre");
    if (nombre) nuevos.nombres = nombre;
    const apellido = validarNombre(apellidos, "apellido");
    if (apellido) nuevos.apellidos = apellido;
    const errorCedula = validarCedula(documento);
    if (errorCedula) nuevos.documento = errorCedula;
    const errorTelefono = validarTelefono(telefono);
    if (errorTelefono) nuevos.telefono = errorTelefono;
    const errorCorreo = validarCorreo(correo);
    if (errorCorreo) nuevos.correo = errorCorreo;
    const errorPin = validarPin(pinNuevo);
    if (errorPin) nuevos.pinNuevo = errorPin;
    if (pinRepetido !== pinNuevo) nuevos.pinRepetido = "Los dos PIN no coinciden.";
    setErrores(nuevos);
    return Object.keys(nuevos).length === 0;
  }

  function continuarDatos(evento: FormEvent) {
    evento.preventDefault();
    setAviso(null);
    if (!validarDatosRegistro()) return;
    setPaso("pago");
  }

  async function registrarCuenta(datosPago: DatosPago) {
    if (enviando) return;
    setEnviando(true);
    setAviso(null);
    try {
      const sesion = await repo.registrar({
        nombres,
        apellidos,
        cedula: documento,
        telefono: soloDigitos(telefono),
        correo,
        pin: pinNuevo,
        datosPago,
      });
      alEntrar(sesion);
    } catch (error) {
      setAviso(
        error instanceof ErrorBlink
          ? error.message
          : "No pudimos crear tu cuenta. Inténtalo de nuevo."
      );
    } finally {
      setEnviando(false);
    }
  }

  function usarMisDatos() {
    setPagoPropio(true);
    void registrarCuenta({
      propio: true,
      banco: "",
      telefono: soloDigitos(telefono),
      cedula: documento,
    });
  }

  function guardarOtraCuenta(evento: FormEvent) {
    evento.preventDefault();
    const datosPago: DatosPago = {
      propio: false,
      banco: pagoBanco,
      telefono: soloDigitos(pagoTelefono),
      cedula: pagoCedula,
    };
    const problemas = erroresDatosPago(datosPago);
    const nuevos: Record<string, string> = { ...problemas };
    if (!pagoBanco) nuevos.banco = "Selecciona el banco de tu cuenta.";
    setErrores(nuevos);
    if (Object.keys(nuevos).length > 0) return;
    void registrarCuenta(datosPago);
  }

  return (
    <div className="acceso">
      <div className="acceso__fondo" aria-hidden="true" />

      {alVolver && (
        <button
          type="button"
          className="acceso__volver"
          onClick={alVolver}
          aria-label="Volver a la página de inicio de Blink Pay"
        >
          <Icon name="atras" tamano="sm" />
          Volver
        </button>
      )}

      <header className="acceso__marca">
        <MarcaPay />
        <h1 className="acceso__lema">Tu transporte.<br />Siempre contigo.</h1>
      </header>

      <section className="acceso__panel">
        <div className="segmentado" role="tablist" aria-label="Acceso">
          <button
            type="button"
            role="tab"
            aria-selected={modo === "entrar"}
            className={`segmentado__opcion${modo === "entrar" ? " segmentado__opcion--activa" : ""}`}
            onClick={() => cambiarModo("entrar")}
          >
            Entrar
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={modo === "registro"}
            className={`segmentado__opcion${modo === "registro" ? " segmentado__opcion--activa" : ""}`}
            onClick={() => cambiarModo("registro")}
          >
            Crear cuenta
          </button>
        </div>

        {modo === "entrar" ? (
          <form className="acceso__form" onSubmit={enviarLogin} noValidate>
            {biometria && alEntrarConBiometria && (
              <button
                type="button"
                className="boton--biometria"
                onClick={() => void entrarConBiometria()}
                disabled={enviando}
              >
                <span className="boton--biometria__icono">
                  <Icon name="huella" />
                </span>
                <span className="boton--biometria__texto">
                  <strong>Entrar con huella</strong>
                  <span>
                    {biometria.nombre}
                  </span>
                </span>
                <Icon name="adelante" />
              </button>
            )}

            <div className="campo">
              <label className="campo__etiqueta" htmlFor="cedula">
                Cédula del titular
              </label>
              <input
                id="cedula"
                className="entrada mono"
                inputMode="numeric"
                autoComplete="off"
                spellCheck={false}
                maxLength={8}
                placeholder="12345678"
                value={cedula}
                onChange={(evento) => setCedula(formatearCedula(evento.target.value))}
                aria-invalid={errores.cedula ? true : undefined}
                aria-describedby={errores.cedula ? "cedula-error" : undefined}
              />
              {errores.cedula && (
                <p className="campo__error" id="cedula-error">
                  {errores.cedula}
                </p>
              )}
            </div>

            <div className="campo">
              <span className="campo__etiqueta" id="pin-etiqueta">
                PIN de acceso
              </span>
              <PinEntrada
                valor={pin}
                alCambiar={setPin}
                alCompletar={(completo) => void enviarLogin(undefined, completo)}
                error={Boolean(errores.pin)}
                etiqueta="PIN de acceso"
              />
              {errores.pin && <p className="campo__error">{errores.pin}</p>}
            </div>

            {aviso && (
              <div className="aviso aviso--peligro" role="alert">
                <Icon name="alerta" />
                <p>{aviso}</p>
              </div>
            )}

            <button type="submit" className="boton boton--primario" disabled={enviando}>
              {enviando ? (
                <span className="girador" aria-label="Verificando" />
              ) : (
                <>
                  <Icon name="candado" />
                  Entrar a mi cuenta
                </>
              )}
            </button>

            <button type="button" className="enlace-sutil" onClick={() => setAyuda(true)}>
              ¿Olvidaste tu PIN o no tienes cuenta?
            </button>
          </form>
        ) : (
          <div className="acceso__form">
            <ol className="registro__pasos" aria-label={`Paso ${paso === "datos" ? 1 : 2} de 2`}>
              <li className={`registro__paso${paso === "datos" ? " registro__paso--actual" : " registro__paso--hecho"}`}>
                <span>1</span> Tus datos
              </li>
              <li className={`registro__paso${paso === "pago" ? " registro__paso--actual" : ""}`}>
                <span>2</span> Pago Móvil
              </li>
            </ol>

            {paso === "datos" ? (
              <form className="registro" onSubmit={continuarDatos} noValidate>
                <div className="form-grid">
                  <div className="campo">
                    <label className="campo__etiqueta" htmlFor="nombres">
                      Nombres
                    </label>
                    <input
                      id="nombres"
                      className="entrada"
                      autoComplete="given-name"
                      placeholder="María Fernanda"
                      value={nombres}
                      onChange={(evento) => setNombres(evento.target.value)}
                      aria-invalid={errores.nombres ? true : undefined}
                    />
                    {errores.nombres && <p className="campo__error">{errores.nombres}</p>}
                  </div>

                  <div className="campo">
                    <label className="campo__etiqueta" htmlFor="apellidos">
                      Apellidos
                    </label>
                    <input
                      id="apellidos"
                      className="entrada"
                      autoComplete="family-name"
                      placeholder="Fernández"
                      value={apellidos}
                      onChange={(evento) => setApellidos(evento.target.value)}
                      aria-invalid={errores.apellidos ? true : undefined}
                    />
                    {errores.apellidos && <p className="campo__error">{errores.apellidos}</p>}
                  </div>
                </div>

                <div className="campo">
                  <label className="campo__etiqueta" htmlFor="documento">
                    Cédula de identidad
                  </label>
                  <input
                    id="documento"
                    className="entrada mono"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="12345678"
                    maxLength={8}
                    value={documento}
                    onChange={(evento) => setDocumento(formatearCedula(evento.target.value))}
                    aria-invalid={errores.documento ? true : undefined}
                  />
                  {errores.documento && <p className="campo__error">{errores.documento}</p>}
                </div>

                <div className="campo">
                  <label className="campo__etiqueta" htmlFor="telefono">
                    Teléfono móvil
                  </label>
                  <input
                    id="telefono"
                    className="entrada mono"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel-national"
                    placeholder="0414-1234567"
                    maxLength={12}
                    value={telefono}
                    onChange={(evento) => setTelefono(formatearTelefono(evento.target.value))}
                    aria-invalid={errores.telefono ? true : undefined}
                  />
                  {errores.telefono && <p className="campo__error">{errores.telefono}</p>}
                </div>

                <div className="campo">
                  <label className="campo__etiqueta" htmlFor="correo">
                    Correo electrónico
                  </label>
                  <input
                    id="correo"
                    className="entrada"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    placeholder="tucorreo@ejemplo.com"
                    value={correo}
                    onChange={(evento) => setCorreo(evento.target.value)}
                    aria-invalid={errores.correo ? true : undefined}
                  />
                  <span className="campo__ayuda">
                    Recibirás avisos de recarga y podrás recuperar el acceso con él.
                  </span>
                  {errores.correo && <p className="campo__error">{errores.correo}</p>}
                </div>

                <div className="campo">
                  <span className="campo__etiqueta">PIN de acceso de 6 dígitos</span>
                  <PinEntrada
                    valor={pinNuevo}
                    alCambiar={setPinNuevo}
                    error={Boolean(errores.pinNuevo)}
                    etiqueta="PIN nuevo de 6 dígitos"
                  />
                  {errores.pinNuevo && <p className="campo__error">{errores.pinNuevo}</p>}
                </div>

                <div className="campo">
                  <span className="campo__etiqueta">Repite el PIN</span>
                  <PinEntrada
                    valor={pinRepetido}
                    alCambiar={setPinRepetido}
                    error={Boolean(errores.pinRepetido)}
                    etiqueta="Repite el PIN"
                  />
                  {errores.pinRepetido && <p className="campo__error">{errores.pinRepetido}</p>}
                </div>

                {aviso && (
                  <div className="aviso aviso--peligro" role="alert">
                    <Icon name="alerta" />
                    <p>{aviso}</p>
                  </div>
                )}

                <button type="submit" className="boton boton--primario">
                  Continuar
                  <Icon name="adelante" />
                </button>
              </form>
            ) : (
              <div className="registro">
                <section className="pregunta-pago">
                  <span className="pregunta-pago__icono">
                    <Icon name="banco" />
                  </span>
                  <h2 className="pregunta-pago__titulo">
                    ¿Vas a hacer tus recargas (Pago Móvil) desde la misma cuenta con la que te
                    registraste?
                  </h2>
                  <p className="pregunta-pago__texto">
                    Muchas familias pagan las recargas con el banco o el teléfono de un familiar.
                    Puedes usar los datos de tu cuenta o configurar una alterna.
                  </p>

                  {pagoPropio === null ? (
                    <div className="pregunta-pago__acciones">
                      <button
                        type="button"
                        className="boton boton--primario"
                        onClick={usarMisDatos}
                        disabled={enviando}
                      >
                        {enviando ? (
                          <span className="girador" aria-label="Creando cuenta" />
                        ) : (
                          <>
                            <Icon name="check" />
                            Sí, usar mis datos
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        className="boton boton--secundario"
                        onClick={() => setPagoPropio(false)}
                      >
                        No, configurar otra cuenta
                      </button>
                    </div>
                  ) : (
                    <form className="registro" onSubmit={guardarOtraCuenta} noValidate>
                      <p className="campo__ayuda">
                        Usaremos estos datos solo para conciliar tu Pago Móvil con la recarga.
                      </p>

                      <div className="campo">
                        <label className="campo__etiqueta" htmlFor="pago-banco">
                          Banco emisor
                        </label>
                        <select
                          id="pago-banco"
                          className="entrada"
                          value={pagoBanco}
                          onChange={(evento) => setPagoBanco(evento.target.value)}
                          aria-invalid={errores.banco ? true : undefined}
                        >
                          <option value="">Selecciona tu banco…</option>
                          {BANCOS.map((banco) => (
                            <option key={banco.codigo} value={banco.nombre}>
                              {banco.codigo} · {banco.nombre}
                            </option>
                          ))}
                        </select>
                        {errores.banco && <p className="campo__error">{errores.banco}</p>}
                      </div>

                      <div className="campo">
                        <label className="campo__etiqueta" htmlFor="pago-telefono">
                          Teléfono afiliado al Pago Móvil
                        </label>
                        <input
                          id="pago-telefono"
                          className="entrada mono"
                          type="tel"
                          inputMode="tel"
                          placeholder="0414-1234567"
                          maxLength={12}
                          value={pagoTelefono}
                          onChange={(evento) =>
                            setPagoTelefono(formatearTelefono(evento.target.value))
                          }
                          aria-invalid={errores.telefono ? true : undefined}
                        />
                        {errores.telefono && <p className="campo__error">{errores.telefono}</p>}
                      </div>

                      <div className="campo">
                        <label className="campo__etiqueta" htmlFor="pago-cedula">
                          Cédula del titular de la cuenta
                        </label>
                        <input
                          id="pago-cedula"
                          className="entrada mono"
                          inputMode="numeric"
                          placeholder="12345678"
                          maxLength={8}
                          value={pagoCedula}
                          onChange={(evento) => setPagoCedula(formatearCedula(evento.target.value))}
                          aria-invalid={errores.cedula ? true : undefined}
                        />
                        {errores.cedula && <p className="campo__error">{errores.cedula}</p>}
                      </div>

                      {aviso && (
                        <div className="aviso aviso--peligro" role="alert">
                          <Icon name="alerta" />
                          <p>{aviso}</p>
                        </div>
                      )}

                      <div className="acciones-paso">
                        <button
                          type="button"
                          className="boton boton--fantasma"
                          onClick={() => {
                            setPagoPropio(null);
                            setErrores({});
                          }}
                        >
                          <Icon name="atras" />
                          Atrás
                        </button>
                        <button
                          type="submit"
                          className="boton boton--primario"
                          disabled={enviando}
                        >
                          {enviando ? (
                            <span className="girador" aria-label="Creando cuenta" />
                          ) : (
                            <>
                              <Icon name="check-circulo" />
                              Crear mi cuenta
                            </>
                          )}
                        </button>
                      </div>
                    </form>
                  )}

                  <button
                    type="button"
                    className="enlace-sutil"
                    onClick={() => {
                      setPaso("datos");
                      setPagoPropio(null);
                      setAviso(null);
                    }}
                  >
                    <Icon name="atras" />
                    Volver a mis datos
                  </button>
                </section>

                {aviso && pagoPropio === null && (
                  <div className="aviso aviso--peligro" role="alert">
                    <Icon name="alerta" />
                    <p>{aviso}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      <footer className="acceso__pie">
        {demo && (
          <p className="acceso__demo">
            <Icon name="rayo" />
            Demostración: <strong className="mono">12345678</strong> · PIN{" "}
            <strong className="mono">194628</strong>
          </p>
        )}
        <p className="acceso__legal">
          Al entrar aceptas los{" "}
          <button
            type="button"
            className="enlace-legal"
            onClick={() => setLegalAbierto(true)}
          >
            términos y condiciones
          </button>{" "}
          de Blink Pay. Tus datos se tratan según la sección de datos personales de
          esos términos.
        </p>
      </footer>

      <HojaLegal
        abierta={legalAbierto}
        alCerrar={() => setLegalAbierto(false)}
        tarifa={tarifa}
      />

      <Hoja
        abierta={ayuda}
        alCerrar={() => setAyuda(false)}
        titulo="¿Necesitas ayuda?"
        descripcion="Tres caminos según lo que te pase."
      >
        <ul className="ayuda-lista">
          <li>
            <span className="ayuda-lista__icono">
              <Icon name="candado" />
            </span>
            <div>
              <strong>Olvidaste el PIN</strong>
              <p>
                Acércate a un punto de atención con tu cédula. Un agente verifica tu identidad y
                restablece el PIN en el momento.
              </p>
            </div>
          </li>
          <li>
            <span className="ayuda-lista__icono">
              <Icon name="tarjeta" />
            </span>
            <div>
              <strong>Todavía no tienes cuenta</strong>
              <p>
                La primera tarjeta se entrega en taquilla al comprar el primer viaje. Crea tu
                cuenta aquí y vincula el serial impreso al reverso del plástico.
              </p>
            </div>
          </li>
          <li>
            <span className="ayuda-lista__icono">
              <Icon name="autobus" />
            </span>
            <div>
              <strong>Tu tarjeta no pasa en el lector</strong>
              <p>
                Acércala de nuevo al lector por 2 segundos. Si sigue sin responder, está
                dañada: te la reponen sin costo conservando el saldo.
              </p>
            </div>
          </li>
        </ul>
      </Hoja>
    </div>
  );
}
