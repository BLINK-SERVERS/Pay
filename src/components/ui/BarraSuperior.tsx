import { useEffect, useState } from "react";
import type { Pestana } from "../BarraTabs";
import { BlinkSymbol } from "./BlinkSymbol";
import { useEnLinea } from "../../lib/hooks";
import { iniciales, nombreCompleto } from "../../lib/formato";
import type { Cuenta } from "../../lib/tipos";

const TITULOS: Record<Pestana, string> = {
  inicio: "Inicio",
  movimientos: "Movimientos",
  recargar: "Recargar",
  perfil: "Mi cuenta",
};

interface Props {
  pestana: Pestana;
  cuenta: Cuenta;
  alRecargar: () => void;
  alVerPerfil: () => void;
}

/**
 * Barra de navegación unificada.
 *
 * En el teléfono imita la navigation bar de iOS: empieza transparente
 * sobre el título grande y, al desplazar, se vuelve translúcida y
 * muestra el título compacto. En macOS es la toolbar de 52 px.
 */
export function BarraSuperior({ pestana, cuenta, alRecargar, alVerPerfil }: Props) {
  const [compacta, setCompacta] = useState(false);
  const enLinea = useEnLinea();
  const nombre = nombreCompleto(cuenta.nombres, cuenta.apellidos);

  useEffect(() => {
    const alDesplazar = () => setCompacta(window.scrollY > 24);
    alDesplazar();
    window.addEventListener("scroll", alDesplazar, { passive: true });
    return () => window.removeEventListener("scroll", alDesplazar);
  }, []);

  return (
    <header
      className={`barra-sup${compacta ? " barra-sup--compacta" : ""}`}
      aria-label="Barra de navegación"
    >
      <div className="barra-sup__identidad">
        <span
          className={`barra-sup__senal${enLinea ? "" : " barra-sup__senal--offline"}`}
          aria-hidden="true"
        />
        <span className="barra-sup__titulo">{TITULOS[pestana]}</span>
        <span className="barra-sup__contexto mono">
          {pestana === "perfil" ? cuenta.cedula : "BLINK TARJETA"}
        </span>
      </div>

      <div className="barra-sup__acciones">
        <button
          type="button"
          className="barra-sup__boton"
          onClick={alRecargar}
          aria-label="Recargar saldo"
        >
          <BlinkSymbol nombre="mas" tamano="sm" />
          <span>Recargar</span>
        </button>
        <button
          type="button"
          className="barra-sup__avatar"
          onClick={alVerPerfil}
          aria-label={`Perfil de ${nombre}`}
        >
          {iniciales(nombre)}
        </button>
      </div>
    </header>
  );
}
