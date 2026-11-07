import type { Pestana } from "../BarraTabs";
import { BlinkSymbol, type NombreSimbolo } from "./BlinkSymbol";
import { MarcaPay } from "../MarcaPay";

const SECCIONES: { id: Pestana; etiqueta: string; icono: NombreSimbolo }[] = [
  { id: "inicio", etiqueta: "Inicio", icono: "inicio" },
  { id: "movimientos", etiqueta: "Movimientos", icono: "movimientos" },
  { id: "recargar", etiqueta: "Recargar", icono: "recargar" },
  { id: "transferir", etiqueta: "Transferir", icono: "transferir" },
  { id: "perfil", etiqueta: "Mi cuenta", icono: "perfil" },
];

interface Props {
  pestana: Pestana;
  alCambiar: (pestana: Pestana) => void;
}

/** Barra lateral translúcida de macOS (240 px). */
export function BarraLateral({ pestana, alCambiar }: Props) {
  return (
    <aside className="barra-lateral" aria-label="Navegación principal">
      <div className="barra-lateral__marca">
        <MarcaPay />
      </div>

      <nav className="barra-lateral__nav" aria-label="Secciones">
        {SECCIONES.map((seccion) => {
          const activa = seccion.id === pestana;
          return (
            <button
              key={seccion.id}
              type="button"
              className={`barra-lateral__item${activa ? " barra-lateral__item--activa" : ""}`}
              aria-current={activa ? "page" : undefined}
              onClick={() => alCambiar(seccion.id)}
            >
              <BlinkSymbol nombre={seccion.icono} tamano="sm" />
              <span>{seccion.etiqueta}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
