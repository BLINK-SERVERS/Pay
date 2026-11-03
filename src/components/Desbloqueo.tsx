import { useState } from "react";
import { Icon } from "./Icon";
import { mensajeBiometria } from "../lib/biometria";

interface Props {
  nombre: string;
  cedula: string;
  alDesbloquear: () => Promise<void>;
  alUsarPin: () => void;
}

export function Desbloqueo({ nombre, cedula, alDesbloquear, alUsarPin }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const primerNombre = nombre.split(" ")[0] || "de nuevo";

  async function desbloquear() {
    if (ocupado) return;
    setOcupado(true);
    setError(null);
    try {
      await alDesbloquear();
    } catch (fallo) {
      setError(mensajeBiometria(fallo));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="acceso acceso--desbloqueo">
      <div className="acceso__fondo" aria-hidden="true">
        <span className="acceso__orbe acceso__orbe--uno" />
        <span className="acceso__orbe acceso__orbe--dos" />
      </div>

      <header className="acceso__marca">
        <span className="marca">
          BLINK<em>TARJETA</em>
        </span>
        <p className="acceso__lema">
          Hola de nuevo,
          <br />
          {primerNombre}.
        </p>
      </header>

      <section className="acceso__panel desbloqueo">
        <span className="desbloqueo__icono">
          <Icon name="huella" />
        </span>
        <div className="desbloqueo__texto">
          <h1>Desbloquea tu tarjeta</h1>
          <p>
            Confirma tu huella o rostro para entrar con la cuenta{" "}
            <span className="mono">{cedula}</span>.
          </p>
        </div>

        {error && (
          <div className="aviso aviso--peligro" role="alert">
            <Icon name="alerta" />
            <p>{error}</p>
          </div>
        )}

        <button
          type="button"
          className="boton boton--primario boton--bloque"
          onClick={() => void desbloquear()}
          disabled={ocupado}
        >
          {ocupado ? (
            <span className="girador" aria-label="Verificando" />
          ) : (
            <>
              <Icon name="huella" />
              Desbloquear con huella o rostro
            </>
          )}
        </button>

        <button type="button" className="enlace-sutil" onClick={alUsarPin}>
          Entrar con PIN y cédula
        </button>
      </section>

      <footer className="acceso__pie">
        <p className="acceso__legal">
          La huella o el rostro se verifican en tu teléfono. BLINK no los recibe ni los
          guarda.
        </p>
      </footer>
    </div>
  );
}
