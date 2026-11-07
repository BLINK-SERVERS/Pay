import { useMemo, useState, type FormEvent } from "react";
import { Icon } from "../components/Icon";
import { PinEntrada } from "../components/PinEntrada";
import { ErrorBlink } from "../lib/repo";
import { validarSerial } from "../lib/dominio";
import {
  formatearBs,
  formatearMovimiento,
  formatearSerial,
  soloDigitos,
} from "../lib/formato";
import { useCopiar } from "../lib/hooks";
import type {
  Ajustes,
  ResultadoTransferencia,
  Tarjeta,
  TransferenciaNueva,
} from "../lib/tipos";

const MONTOS = [500, 1000, 2000, 5000];

/** "G-00001-001-N" → "001-N": lo que distingue dos plásticos de la serie. */
function etiquetaSerial(serial: string): string {
  const partes = serial.split("-");
  return partes.length >= 2 ? partes.slice(-2).join("-") : serial;
}

interface Props {
  tarjeta: Tarjeta;
  tarjetas: Tarjeta[];
  ajustes: Ajustes;
  alSeleccionarOrigen: (serial: string) => void;
  alTransferir: (solicitud: TransferenciaNueva) => Promise<ResultadoTransferencia>;
  alInicio: () => void;
  alVerMovimientos: () => void;
}

export function Transferir({
  tarjeta,
  tarjetas,
  ajustes,
  alSeleccionarOrigen,
  alTransferir,
  alInicio,
  alVerMovimientos,
}: Props) {
  const [destino, setDestino] = useState("");
  const [monto, setMonto] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoTransferencia | null>(null);
  const [clave, setClave] = useState(() => crypto.randomUUID());
  const [copiado, copiar] = useCopiar();

  const otras = tarjetas.filter((t) => t.serial !== tarjeta.serial);
  const disponible = Math.max(0, Math.min(tarjeta.saldo, ajustes.topeTransferencia));
  const destinoSerial = formatearSerial(destino);
  const montoNumero = Number(soloDigitos(monto));
  const montoValido = Number.isInteger(montoNumero) && montoNumero > 0;

  const destinoElegido = useMemo(
    () => otras.find((t) => t.serial === destinoSerial) ?? null,
    [otras, destinoSerial]
  );

  function reiniciarClave() {
    setClave(crypto.randomUUID());
  }

  function elegirDestino(serial: string) {
    setDestino(serial);
    setError(null);
    reiniciarClave();
  }

  function cambiarMonto(valor: string) {
    setMonto(soloDigitos(valor).slice(0, 6));
    setError(null);
    reiniciarClave();
  }

  async function confirmar(evento: FormEvent) {
    evento.preventDefault();
    if (enviando) return;

    const problemaSerial = destinoSerial ? validarSerial(destinoSerial) : null;
    if (!destinoSerial) {
      setError("Escribe el serial de la tarjeta que recibe el saldo.");
      return;
    }
    if (problemaSerial) {
      setError(problemaSerial);
      return;
    }
    if (destinoSerial === tarjeta.serial) {
      setError("Elige una tarjeta distinta a la de origen.");
      return;
    }
    if (!montoValido) {
      setError("Escribe un monto mayor que cero.");
      return;
    }
    if (montoNumero > ajustes.topeTransferencia) {
      setError(
        `El tope por transferencia es ${formatearBs(
          ajustes.topeTransferencia
        )}. Divide el monto en varias operaciones.`
      );
      return;
    }
    if (montoNumero > tarjeta.saldo) {
      setError(`Solo puedes transferir ${formatearBs(tarjeta.saldo)} de esta tarjeta.`);
      return;
    }
    if (pin.length !== 6) {
      setError("Escribe tu PIN de 6 dígitos para confirmar.");
      return;
    }

    setEnviando(true);
    setError(null);
    try {
      const respuesta = await alTransferir({
        origen: tarjeta.serial,
        destino: destinoSerial,
        monto: montoNumero,
        pin,
        clave,
      });
      setResultado(respuesta);
      setPin("");
    } catch (fallo) {
      setError(
        fallo instanceof ErrorBlink
          ? fallo.message
          : "No pudimos completar la transferencia. Inténtalo otra vez."
      );
      if (fallo instanceof ErrorBlink && fallo.codigo === "credenciales") {
        setPin("");
      }
    } finally {
      setEnviando(false);
    }
  }

  function otra() {
    setResultado(null);
    setDestino("");
    setMonto("");
    setPin("");
    setError(null);
    reiniciarClave();
  }

  const comprobante = useMemo(() => {
    if (!resultado) return "";
    return [
      "Blink Pay — transferencia de saldo",
      `Origen: ${resultado.transferencia.origen.serial}`,
      `Destino: ${resultado.transferencia.destino.serial}`,
      `Titular destino: ${resultado.transferencia.destino.titular ?? "—"}`,
      `Monto: ${formatearBs(resultado.transferencia.monto)}`,
      `Saldo destino: ${formatearBs(resultado.transferencia.destino.saldo)}`,
      `Fecha: ${formatearMovimiento(resultado.transferencia.at)}`,
      `Comprobante: ${resultado.transferencia.id}`,
    ].join("\n");
  }, [resultado]);

  if (resultado) {
    const { transferencia, repetida } = resultado;
    return (
      <div className="vista">
        <section className="exito" aria-live="polite">
          <span className="exito__sello">
            <Icon name="check" />
          </span>
          <h1 className="exito__titulo">
            {repetida ? "Transferencia ya registrada" : "Saldo transferido"}
          </h1>
          <p className="exito__texto">
            {repetida ? (
              <>Esta operación ya se había aplicado; no se descontó dos veces.</>
            ) : (
              <>
                Movimos <strong>{formatearBs(transferencia.monto)}</strong> de la tarjeta{" "}
                <strong>{transferencia.origen.serial}</strong> a la tarjeta{" "}
                <strong>{transferencia.destino.serial}</strong>.
              </>
            )}
          </p>
          <dl className="datos">
            <div>
              <dt>Sale de</dt>
              <dd className="mono">
                {transferencia.origen.serial} · {formatearBs(transferencia.origen.saldo)}
              </dd>
            </div>
            <div>
              <dt>Entra a</dt>
              <dd>
                <span className="mono">{transferencia.destino.serial}</span>
                <span className="mono">
                  {" · "}
                  {transferencia.destino.titular ?? "Titular de la tarjeta"}
                </span>
              </dd>
            </div>
            <div>
              <dt>Saldo del destino</dt>
              <dd className="mono">{formatearBs(transferencia.destino.saldo)}</dd>
            </div>
            <div>
              <dt>Fecha</dt>
              <dd>{formatearMovimiento(transferencia.at)}</dd>
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
            <button type="button" className="boton boton--secundario" onClick={otra}>
              Hacer otra transferencia
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
        <h1 className="cabecera__titulo cabecera__titulo--grande">Transferir saldo</h1>
        <p className="cabecera__sub">
          Mueve saldo entre plásticos BLINK al instante, sin comisión.
        </p>
      </header>

      <form className="tarjeta-panel" onSubmit={confirmar} noValidate>
        {tarjetas.length > 1 && (
          <div className="campo">
            <span className="campo__etiqueta">Sale de</span>
            <div className="chips chips--pasajes" role="group" aria-label="Tarjeta de origen">
              {tarjetas.map((opcion) => {
                const activa = opcion.serial === tarjeta.serial;
                return (
                  <button
                    key={opcion.serial}
                    type="button"
                    className={`chip${activa ? " chip--activo" : ""}`}
                    aria-pressed={activa}
                    disabled={opcion.estado !== "activa"}
                    onClick={() => {
                      alSeleccionarOrigen(opcion.serial);
                      setError(null);
                      reiniciarClave();
                    }}
                  >
                    …{etiquetaSerial(opcion.serial)}
                    <span>{formatearBs(opcion.saldo)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="campo">
          <label className="campo__etiqueta" htmlFor="tr-destino">
            Serial de la tarjeta que recibe
          </label>
          <input
            id="tr-destino"
            className="entrada mono"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="G-00001-001-N"
            maxLength={15}
            value={destino}
            onChange={(evento) => {
              setDestino(formatearSerial(evento.target.value));
              setError(null);
              reiniciarClave();
            }}
          />
          <span className="campo__ayuda">
            Está impreso al reverso del plástico. Puedes escribirlo con o sin guiones.
          </span>
          {otras.length > 0 && (
            <div className="chips" role="group" aria-label="Tus otras tarjetas">
              {otras.map((opcion) => (
                <button
                  key={opcion.serial}
                  type="button"
                  className={`chip${
                    opcion.serial === destinoSerial ? " chip--activo" : ""
                  }`}
                  aria-pressed={opcion.serial === destinoSerial}
                  disabled={opcion.estado !== "activa"}
                  onClick={() => elegirDestino(opcion.serial)}
                >
                  …{etiquetaSerial(opcion.serial)}
                  <span>{formatearBs(opcion.saldo)}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="campo">
          <label className="campo__etiqueta" htmlFor="tr-monto">
            Monto a transferir
          </label>
          <div className="chips" role="group" aria-label="Montos frecuentes">
            {MONTOS.map((valor) => {
              const posible = valor <= disponible;
              return (
                <button
                  key={valor}
                  type="button"
                  className={`chip${monto === String(valor) ? " chip--activo" : ""}`}
                  aria-pressed={monto === String(valor)}
                  disabled={!posible}
                  onClick={() => cambiarMonto(String(valor))}
                >
                  {valor}
                  <span>Bs</span>
                </button>
              );
            })}
          </div>
          <input
            id="tr-monto"
            className="entrada entrada--cifra"
            type="number"
            min="1"
            max={disponible || undefined}
            step="1"
            inputMode="numeric"
            placeholder="0"
            value={monto}
            onChange={(evento) => cambiarMonto(evento.target.value)}
          />
          <span className="campo__ayuda">
            Hasta {formatearBs(disponible)} disponibles en esta tarjeta, en bolívares
            enteros y sin céntimos
            {tarjeta.saldo > ajustes.topeTransferencia
              ? ` · tope de ${formatearBs(ajustes.topeTransferencia)} por operación`
              : ""}
            .
          </span>
        </div>

        {destinoElegido && (
          <div className="proyeccion" aria-live="polite">
            <div>
              <span>{destinoElegido.serial}</span>
              <strong>{formatearBs(destinoElegido.saldo)}</strong>
            </div>
            <Icon name="adelante" />
            <div>
              <span>Al recibir</span>
              <strong className="proyeccion__nuevo">
                {formatearBs(destinoElegido.saldo + (montoValido ? montoNumero : 0))}
              </strong>
            </div>
          </div>
        )}

        <div className="campo">
          <span className="campo__etiqueta">PIN de tu cuenta</span>
          <PinEntrada
            valor={pin}
            alCambiar={(valor) => {
              setPin(valor);
              setError(null);
            }}
            etiqueta="PIN de 6 dígitos para transferir"
          />
          <span className="campo__ayuda">
            Confirma la operación con el PIN con el que entras a Blink Pay.
          </span>
        </div>

        {error && (
          <div className="aviso aviso--peligro" role="alert">
            <Icon name="alerta" />
            <p>{error}</p>
          </div>
        )}

        <div className="aviso aviso--info">
          <Icon name="escudo" />
          <p>
            La transferencia es inmediata y sin comisión. El plástico que entrega el saldo
            necesita conectarse al validador para reflejar el nuevo monto.
          </p>
        </div>

        <button type="submit" className="boton boton--primario" disabled={enviando}>
          {enviando ? (
            <span className="girador" aria-label="Transfiriendo" />
          ) : (
            <>
              <Icon name="transferir" />
              Transferir {montoValido ? formatearBs(montoNumero) : "saldo"}
            </>
          )}
        </button>
      </form>
    </div>
  );
}
