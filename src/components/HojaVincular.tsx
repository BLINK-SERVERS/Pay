import { useEffect, useState, type FormEvent } from "react";
import { Hoja } from "./Hoja";
import { Icon } from "./Icon";
import { ErrorBlink } from "../lib/repo";
import { formatearSerial } from "../lib/formato";
import { validarSerial } from "../lib/dominio";

interface Props {
  abierta: boolean;
  alCerrar: () => void;
  alVincular: (serial: string) => Promise<void>;
}

/** Vincular un plástico nuevo a la billetera con el serial del reverso. */
export function HojaVincular({ abierta, alCerrar, alVincular }: Props) {
  const [serial, setSerial] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!abierta) {
      setSerial("");
      setError(null);
      setEnviando(false);
    }
  }, [abierta]);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    if (enviando) return;
    const normalizado = formatearSerial(serial);
    const problema = validarSerial(normalizado);
    if (problema) {
      setError(problema);
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      await alVincular(normalizado);
      alCerrar();
    } catch (fallo) {
      setError(
        fallo instanceof ErrorBlink
          ? fallo.message
          : "No pudimos vincular la tarjeta. Inténtalo otra vez."
      );
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Hoja
      abierta={abierta}
      alCerrar={alCerrar}
      titulo="Vincular tarjeta"
      descripcion="Puedes tener varias tarjetas en tu cuenta: la tuya, la de tu hijo o la de un familiar."
    >
      <form className="form-vincular" onSubmit={enviar} noValidate>
        <div className="campo">
          <label className="campo__etiqueta" htmlFor="vinculo-serial">
            Serial de la tarjeta
          </label>
          <input
            id="vinculo-serial"
            className="entrada mono"
            inputMode="text"
            autoComplete="off"
            autoCapitalize="characters"
            autoFocus
            placeholder="G-00001-001-N"
            value={serial}
            onChange={(evento) => {
              setSerial(formatearSerial(evento.target.value));
              setError(null);
            }}
            aria-invalid={error ? true : undefined}
            aria-describedby="vinculo-serial-ayuda"
          />
          <span className="campo__ayuda" id="vinculo-serial-ayuda">
            Está impreso al reverso del plástico, debajo del código de barras: una letra, ocho
            dígitos y la letra final.
          </span>
        </div>

        {error && (
          <div className="aviso aviso--peligro" role="alert">
            <Icon name="alerta" />
            <p>{error}</p>
          </div>
        )}

        <div className="hoja-acciones">
          <button type="button" className="boton boton--fantasma" onClick={alCerrar}>
            Cancelar
          </button>
          <button type="submit" className="boton boton--primario" disabled={enviando}>
            {enviando ? (
              <span className="girador" aria-label="Vinculando" />
            ) : (
              <>
                <Icon name="mas" />
                Vincular
              </>
            )}
          </button>
        </div>
      </form>
    </Hoja>
  );
}
