import { useMemo, useRef, useState, type FormEvent } from "react";
import { Icon } from "../components/Icon";
import { ErrorBlink } from "../lib/repo";
import { CAMPOS_RECARGA, buscarRecargaDuplicada, erroresRecarga, pasajesEquivalentes } from "../lib/dominio";
import type { BorradorRecarga, CampoRecarga, ErroresRecarga } from "../lib/dominio";
import { formatearBs, formatearMovimiento, formatearTelefono, soloDigitos } from "../lib/formato";
import { useCopiar } from "../lib/hooks";
import { cotizarRecarga, maximoPasajes, type Cotizacion } from "../lib/tarifa";
import { BANCOS } from "../lib/tipos";
import type { Ajustes, DatosPago, Movimiento, RecargaNueva, Tarjeta } from "../lib/tipos";

type Paso = "pasajes" | "pago" | "revision" | "listo";

const BLOQUES = [1, 2, 3, 5, 10];
const PASOS: { id: Paso; etiqueta: string }[] = [
  { id: "pasajes", etiqueta: "Pasajes" },
  { id: "pago", etiqueta: "Pago" },
  { id: "revision", etiqueta: "Confirmar" },
];

interface Props {
  tarjeta: Tarjeta;
  datosPago: DatosPago;
  ajustes: Ajustes;
  movimientos: Movimiento[];
  alReportar: (recarga: RecargaNueva) => Promise<Movimiento>;
  alInicio: () => void;
  alVerMovimientos: () => void;
  alEditarPago: () => void;
}

export function Recargar({
  tarjeta,
  datosPago,
  ajustes,
  movimientos,
  alReportar,
  alInicio,
  alVerMovimientos,
  alEditarPago,
}: Props) {
  const [paso, setPaso] = useState<Paso>("pasajes");
  const [borrador, setBorrador] = useState<BorradorRecarga>(() => ({
    pasajes: "",
    telefono: formatearTelefono(datosPago.telefono),
    banco: datosPago.banco,
    referencia: "",
  }));
  const [errores, setErrores] = useState<ErroresRecarga>({});
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [reportada, setReportada] = useState<Movimiento | null>(null);
  const [copiado, copiar] = useCopiar();
  const titulo = useRef<HTMLHeadingElement>(null);

  const parametros = useMemo(
    () => ({ ...ajustes.tarifario, base: tarjeta.tarifa }),
    [ajustes.tarifario, tarjeta.tarifa]
  );
  const tope = ajustes.topeRecarga;
  const maximo = useMemo(() => maximoPasajes(tope, parametros), [tope, parametros]);

  const cantidad = Number(borrador.pasajes);
  const valida = Number.isInteger(cantidad) && cantidad >= 1;
  const cotizacion: Cotizacion | null = useMemo(() => {
    if (!valida) return null;
    try {
      return cotizarRecarga(cantidad, parametros);
    } catch {
      return null;
    }
  }, [cantidad, parametros, valida]);

  const saldoResultante = tarjeta.saldo + (cotizacion?.acreditado ?? 0);
  const pasajesNuevos = pasajesEquivalentes(saldoResultante, tarjeta.tarifa);

  const indicePaso = PASOS.findIndex((p) => p.id === paso);

  const pagoMovil = ajustes.pagoMovil;

  function irA(nuevo: Paso) {
    setPaso(nuevo);
    setAviso(null);
    window.setTimeout(() => titulo.current?.focus(), 40);
  }

  function cambiar(campo: CampoRecarga, valor: string) {
    setBorrador((actual) => ({ ...actual, [campo]: valor }));
    setErrores((actual) => {
      if (!actual[campo]) return actual;
      const siguiente = { ...actual };
      delete siguiente[campo];
      return siguiente;
    });
  }

  function enfocar(campo: CampoRecarga) {
    requestAnimationFrame(() => document.getElementById(`rc-${campo}`)?.focus());
  }

  function validarPasajes() {
    const problemas = erroresRecarga(
      { ...borrador, telefono: "04140000000", banco: "Otro", referencia: "0000" },
      ajustes,
      tarjeta.tarifa
    );
    if (problemas.pasajes) {
      setErrores({ pasajes: problemas.pasajes });
      enfocar("pasajes");
      return false;
    }
    setErrores({});
    return true;
  }

  function continuarPasajes(evento: FormEvent) {
    evento.preventDefault();
    if (validarPasajes()) irA("pago");
  }

  function continuarPago(evento: FormEvent) {
    evento.preventDefault();
    const problemas = erroresRecarga(borrador, ajustes, tarjeta.tarifa);
    const primerCampo = CAMPOS_RECARGA.find((campo) => problemas[campo]);
    if (primerCampo) {
      setErrores(problemas);
      enfocar(primerCampo);
      return;
    }

    const duplicada = buscarRecargaDuplicada(movimientos, {
      banco: borrador.banco,
      referencia: borrador.referencia,
    });
    if (duplicada) {
      setErrores({
        referencia: `Ya reportaste esta referencia el ${formatearMovimiento(duplicada.at)}. Revisa «Movimientos».`,
      });
      enfocar("referencia");
      return;
    }

    setErrores({});
    irA("revision");
  }

  async function confirmar() {
    if (enviando || !cotizacion) return;
    setEnviando(true);
    setAviso(null);
    try {
      const movimiento = await alReportar({
        pasajes: cotizacion.pasajes,
        monto: cotizacion.total,
        montoBase: cotizacion.acreditado,
        telefono: soloDigitos(borrador.telefono),
        banco: borrador.banco,
        referencia: soloDigitos(borrador.referencia).slice(-4),
      });
      setReportada(movimiento);
      irA("listo");
    } catch (error) {
      setAviso(
        error instanceof ErrorBlink
          ? error.message
          : "No pudimos registrar el reporte. Inténtalo otra vez."
      );
      if (error instanceof ErrorBlink && error.codigo === "duplicada") {
        setPaso("pago");
        enfocar("referencia");
      }
    } finally {
      setEnviando(false);
    }
  }

  function otraRecarga() {
    setBorrador({
      pasajes: "",
      telefono: formatearTelefono(datosPago.telefono),
      banco: datosPago.banco,
      referencia: "",
    });
    setReportada(null);
    setErrores({});
    irA("pasajes");
  }

  const comprobante = useMemo(() => {
    if (!reportada || !cotizacion) return "";
    return [
      "Blink Pay — reporte de recarga",
      `Titular: ${tarjeta.titular.nombre}`,
      `Pasajes: ${cotizacion.pasajes}`,
      `Tarifa por pasaje: ${formatearBs(cotizacion.tarifaBase)}`,
      `Pasaje urbano: ${formatearBs(cotizacion.acreditado)}`,
      `Tasa administrativa: ${formatearBs(cotizacion.total - cotizacion.acreditado)}`,
      `Transferido: ${formatearBs(cotizacion.total)}`,
      `A acreditar: ${formatearBs(cotizacion.acreditado)}`,
      `Banco: ${reportada.banco ?? ""}`,
      `Teléfono: ${formatearTelefono(borrador.telefono)}`,
      `Referencia: ${reportada.referencia ?? ""}`,
      `Fecha: ${formatearMovimiento(reportada.at)}`,
      "Estado: en revisión",
    ].join("\n");
  }, [reportada, cotizacion, tarjeta, borrador.telefono]);

  if (paso === "listo" && reportada && cotizacion) {
    return (
      <div className="vista">
        <section className="exito" aria-live="polite">
          <span className="exito__sello">
            <Icon name="check" />
          </span>
          <h1 className="exito__titulo">Recarga reportada</h1>
          <p className="exito__texto">
            Registramos tu Pago Móvil de <strong>{formatearBs(cotizacion.total)}</strong> por{" "}
            {cotizacion.pasajes} {cotizacion.pasajes === 1 ? "pasaje" : "pasajes"}. Al
            confirmarlo se acreditarán <strong>{formatearBs(cotizacion.acreditado)}</strong> a tu
            saldo.
          </p>
          <dl className="datos">
            <div>
              <dt>Pasajes</dt>
              <dd>
                {cotizacion.pasajes} a {formatearBs(cotizacion.tarifaBase)}
              </dd>
            </div>
            <div>
              <dt>Banco emisor</dt>
              <dd>{reportada.banco}</dd>
            </div>
            <div>
              <dt>Referencia</dt>
              <dd className="mono">{reportada.referencia}</dd>
            </div>
            <div>
              <dt>Fecha</dt>
              <dd>{formatearMovimiento(reportada.at)}</dd>
            </div>
            <div>
              <dt>Estado</dt>
              <dd>
                <span className="etiqueta etiqueta--espera">En revisión</span>
              </dd>
            </div>
          </dl>
          <div className="exito__acciones">
            <button
              type="button"
              className="boton boton--primario"
              onClick={() => void copiar(comprobante, "comprobante")}
            >
              <Icon name={copiado === "comprobante" ? "check" : "copiar"} />
              {copiado === "comprobante" ? "Comprobante copiado" : "Copiar comprobante"}
            </button>
            <button type="button" className="boton boton--secundario" onClick={otraRecarga}>
              Reportar otra recarga
            </button>
            <button type="button" className="enlace-sutil" onClick={alVerMovimientos}>
              Ver mis movimientos
            </button>
            <button type="button" className="enlace-sutil" onClick={alInicio}>
              Volver al inicio
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="vista">
      <header className="cabecera cabecera--titulo">
        <h1 className="cabecera__titulo cabecera__titulo--grande">Recargar</h1>
      </header>

      <ol className="progreso" aria-label={`Paso ${indicePaso + 1} de ${PASOS.length}`}>
        {PASOS.map((item, indice) => (
          <li
            key={item.id}
            className={`progreso__paso${indice <= indicePaso ? " progreso__paso--hecho" : ""}${
              indice === indicePaso ? " progreso__paso--actual" : ""
            }`}
            aria-current={indice === indicePaso ? "step" : undefined}
          >
            <span className="progreso__numero">{indice + 1}</span>
            <span className="progreso__nombre">{item.etiqueta}</span>
          </li>
        ))}
      </ol>

      <h2 className="paso-titulo" tabIndex={-1} ref={titulo}>
        {paso === "pasajes"
          ? "¿Cuántos pasajes deseas recargar?"
          : paso === "pago"
            ? "Datos del Pago Móvil"
            : "Revisa antes de reportar"}
      </h2>

      {paso === "pasajes" && (
        <form className="tarjeta-panel" onSubmit={continuarPasajes} noValidate>
          <p className="recarga__tarifa">
            <Icon name="autobus" />
            Pasaje a {formatearBs(tarjeta.tarifa)}. El monto a transferir incluye la tasa
            administrativa por el servicio digital.
          </p>

          <div className="chips chips--pasajes" role="group" aria-label="Cantidades frecuentes">
            {BLOQUES.map((valor) => {
              const disponible = valor <= maximo;
              return (
                <button
                  key={valor}
                  type="button"
                  className={`chip${borrador.pasajes === String(valor) ? " chip--activo" : ""}`}
                  aria-pressed={borrador.pasajes === String(valor)}
                  disabled={!disponible}
                  onClick={() => {
                    cambiar("pasajes", String(valor));
                    setErrores({});
                  }}
                >
                  {valor}
                  <span>{valor === 1 ? "pasaje" : "pasajes"}</span>
                </button>
              );
            })}
          </div>

          <div className="campo">
            <label className="campo__etiqueta" htmlFor="rc-pasajes">
              Otra cantidad de pasajes
            </label>
            <input
              id="rc-pasajes"
              className="entrada entrada--cifra"
              type="number"
              min="1"
              max={maximo || undefined}
              step="1"
              inputMode="numeric"
              placeholder="0"
              value={borrador.pasajes}
              onChange={(evento) => cambiar("pasajes", soloDigitos(evento.target.value))}
              aria-invalid={errores.pasajes ? true : undefined}
              aria-describedby={errores.pasajes ? "rc-pasajes-error" : "rc-pasajes-ayuda"}
            />
            <span className="campo__ayuda" id="rc-pasajes-ayuda">
              {maximo > 0
                ? `Hasta ${maximo} ${maximo === 1 ? "pasaje" : "pasajes"} por operación (tope ${formatearBs(
                    tope
                  )}).`
                : "La tarifa supera el tope por operación configurado."}
            </span>
            {errores.pasajes && (
              <p className="campo__error" id="rc-pasajes-error">
                {errores.pasajes}
              </p>
            )}
          </div>

          {cotizacion && (
            <div className="recibo" aria-live="polite">
              <div className="recibo__total">
                <span>Transfiere exactamente</span>
                <strong>{formatearBs(cotizacion.total)}</strong>
              </div>
              <div className="recibo__detalle">
                <div>
                  <span>Pasaje urbano</span>
                  <strong>
                    {cotizacion.pasajes} × {formatearBs(cotizacion.tarifaBase)} ·{" "}
                    {formatearBs(cotizacion.acreditado)}
                  </strong>
                </div>
                <div>
                  <span>Tasa administrativa digital</span>
                  <strong>{formatearBs(cotizacion.total - cotizacion.acreditado)}</strong>
                </div>
              </div>
            </div>
          )}

          {cotizacion && (
            <>
              <div className="proyeccion">
                <div>
                  <span>Saldo actual</span>
                  <strong>{formatearBs(tarjeta.saldo)}</strong>
                </div>
                <Icon name="adelante" />
                <div>
                  <span>Saldo al aprobarse</span>
                  <strong className="proyeccion__nuevo">{formatearBs(saldoResultante)}</strong>
                </div>
              </div>
              <p className="proyeccion__pasajes">
                <Icon name="autobus" />
                Te quedarían {pasajesNuevos} {pasajesNuevos === 1 ? "pasaje" : "pasajes"} a{" "}
                {formatearBs(tarjeta.tarifa)}.
              </p>
            </>
          )}

          <button type="submit" className="boton boton--primario">
            Continuar
            <Icon name="adelante" />
          </button>
        </form>
      )}

      {paso === "pago" && cotizacion && (
        <>
          <section className="pago-movil">
            <header className="pago-movil__cabecera">
              <span className="pago-movil__icono">
                <Icon name="banco" />
              </span>
              <div>
                <strong>Paga a BLINK</strong>
                <p>Desde tu banco, con Pago Móvil.</p>
              </div>
            </header>
            <dl className="datos datos--copiar">
              {[
                ["Banco", pagoMovil.banco, "banco"],
                ["RIF", pagoMovil.rif, "rif"],
                ["Teléfono", pagoMovil.telefono, "telefono-pm"],
                ["Titular", pagoMovil.titular, "titular"],
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
            <div className="pago-movil__monto">
              <div>
                <span>Transfiere exactamente</span>
                <strong>{formatearBs(cotizacion.total)}</strong>
                <small>
                  {cotizacion.pasajes} {cotizacion.pasajes === 1 ? "pasaje" : "pasajes"} · se
                  acreditan {formatearBs(cotizacion.acreditado)}
                </small>
              </div>
              <button
                type="button"
                className="boton boton--secundario boton--compacto"
                onClick={() => void copiar(String(cotizacion.total), "monto")}
              >
                <Icon name={copiado === "monto" ? "check" : "copiar"} />
                {copiado === "monto" ? "Monto copiado" : "Copiar monto"}
              </button>
            </div>
            <button
              type="button"
              className="boton boton--secundario boton--compacto"
              onClick={() =>
                void copiar(
                  `${pagoMovil.banco}\n${pagoMovil.rif}\n${pagoMovil.telefono}\n${pagoMovil.titular}\n${formatearBs(
                    cotizacion.total
                  )}`,
                  "todo"
                )
              }
            >
              <Icon name={copiado === "todo" ? "check" : "copiar"} />
              {copiado === "todo" ? "Datos copiados" : "Copiar datos y monto"}
            </button>
          </section>

          <form className="tarjeta-panel" onSubmit={continuarPago} noValidate>
            <p className="form-titulo">Ahora reporta el pago</p>

            <div className="fuente-pago">
              <span className="fuente-pago__icono">
                <Icon name="banco" />
              </span>
              <div className="fuente-pago__texto">
                <strong>
                  {datosPago.banco ? `Pagas desde ${datosPago.banco}` : "Elige tu banco emisor"}
                </strong>
                <span className="mono">
                  {formatearTelefono(datosPago.telefono)} · {datosPago.cedula}
                </span>
              </div>
              <button type="button" className="seccion__enlace" onClick={alEditarPago}>
                Cambiar
              </button>
            </div>

            <div className="campo">
              <label className="campo__etiqueta" htmlFor="rc-banco">
                Banco emisor
              </label>
              <select
                id="rc-banco"
                className="entrada"
                value={borrador.banco}
                onChange={(evento) => cambiar("banco", evento.target.value)}
                aria-invalid={errores.banco ? true : undefined}
                aria-describedby={errores.banco ? "rc-banco-error" : undefined}
              >
                <option value="">Selecciona…</option>
                {BANCOS.map((banco) => (
                  <option key={banco.codigo} value={banco.nombre}>
                    {banco.codigo} · {banco.nombre}
                  </option>
                ))}
              </select>
              {errores.banco && (
                <p className="campo__error" id="rc-banco-error">
                  {errores.banco}
                </p>
              )}
            </div>

            <div className="campo">
              <label className="campo__etiqueta" htmlFor="rc-telefono">
                Teléfono desde el que pagaste
              </label>
              <input
                id="rc-telefono"
                className="entrada mono"
                type="tel"
                inputMode="tel"
                autoComplete="tel-national"
                placeholder="0414-1234567"
                maxLength={12}
                value={borrador.telefono}
                onChange={(evento) => cambiar("telefono", formatearTelefono(evento.target.value))}
                aria-invalid={errores.telefono ? true : undefined}
                aria-describedby={errores.telefono ? "rc-telefono-error" : undefined}
              />
              {errores.telefono && (
                <p className="campo__error" id="rc-telefono-error">
                  {errores.telefono}
                </p>
              )}
            </div>

            <div className="campo">
              <label className="campo__etiqueta" htmlFor="rc-referencia">
                Últimos 4 dígitos de la referencia
              </label>
              <input
                id="rc-referencia"
                className="entrada mono"
                inputMode="numeric"
                autoComplete="off"
                maxLength={4}
                placeholder="1234"
                value={borrador.referencia}
                onChange={(evento) =>
                  cambiar("referencia", soloDigitos(evento.target.value).slice(0, 4))
                }
                aria-invalid={errores.referencia ? true : undefined}
                aria-describedby={errores.referencia ? "rc-referencia-error" : "rc-referencia-ayuda"}
              />
              <span className="campo__ayuda" id="rc-referencia-ayuda">
                Aparece en el comprobante que te dio tu banco.
              </span>
              {errores.referencia && (
                <p className="campo__error" id="rc-referencia-error">
                  {errores.referencia}
                </p>
              )}
            </div>

            {aviso && (
              <div className="aviso aviso--peligro" role="alert">
                <Icon name="alerta" />
                <p>{aviso}</p>
              </div>
            )}

            <div className="acciones-paso">
              <button type="button" className="boton boton--fantasma" onClick={() => irA("pasajes")}>
                <Icon name="atras" />
                Atrás
              </button>
              <button type="submit" className="boton boton--primario">
                Revisar
                <Icon name="adelante" />
              </button>
            </div>
          </form>
        </>
      )}

      {paso === "revision" && cotizacion && (
        <section className="tarjeta-panel">
          <dl className="datos">
            <div>
              <dt>Pasajes</dt>
              <dd>
                {cotizacion.pasajes} a {formatearBs(cotizacion.tarifaBase)}
              </dd>
            </div>
            <div>
              <dt>Tasa administrativa digital</dt>
              <dd className="mono">
                {formatearBs(cotizacion.total - cotizacion.acreditado)}
              </dd>
            </div>
            <div>
              <dt>Monto a transferir</dt>
              <dd className="mono">{formatearBs(cotizacion.total)}</dd>
            </div>
            <div>
              <dt>Se acredita a tu saldo</dt>
              <dd className="mono">{formatearBs(cotizacion.acreditado)}</dd>
            </div>
            <div>
              <dt>Banco emisor</dt>
              <dd>{borrador.banco}</dd>
            </div>
            <div>
              <dt>Teléfono</dt>
              <dd className="mono">{formatearTelefono(borrador.telefono)}</dd>
            </div>
            <div>
              <dt>Referencia</dt>
              <dd className="mono">…{borrador.referencia}</dd>
            </div>
          </dl>

          {aviso && (
            <div className="aviso aviso--peligro" role="alert">
              <Icon name="alerta" />
              <p>{aviso}</p>
            </div>
          )}

          <div className="aviso aviso--info">
            <Icon name="escudo" />
            <p>
              Al confirmar, tu reporte queda en revisión. Admin verifica el Pago Móvil y
              acredita {formatearBs(cotizacion.acreditado)} a tu saldo; normalmente en minutos.
            </p>
          </div>

          <div className="acciones-paso">
            <button type="button" className="boton boton--fantasma" onClick={() => irA("pago")}>
              <Icon name="atras" />
              Editar
            </button>
            <button
              type="button"
              className="boton boton--primario"
              onClick={() => void confirmar()}
              disabled={enviando}
            >
              {enviando ? (
                <span className="girador" aria-label="Enviando" />
              ) : (
                <>
                  <Icon name="check" />
                  Confirmar recarga
                </>
              )}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
