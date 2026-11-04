import { Icon, type IconName } from "./Icon";
import { vibrar } from "../lib/hooks";

export type Pestana = "inicio" | "movimientos" | "recargar" | "transferir" | "perfil";

const PESTANAS: { id: Pestana; etiqueta: string; icono: IconName }[] = [
  { id: "inicio", etiqueta: "Inicio", icono: "inicio" },
  { id: "movimientos", etiqueta: "Movimientos", icono: "movimientos" },
  { id: "recargar", etiqueta: "Recargar", icono: "recargar" },
  { id: "transferir", etiqueta: "Transferir", icono: "transferir" },
  { id: "perfil", etiqueta: "Perfil", icono: "perfil" },
];

interface Props {
  activa: Pestana;
  alCambiar: (pestana: Pestana) => void;
}

export function BarraTabs({ activa, alCambiar }: Props) {
  return (
    <nav className="tabs" aria-label="Secciones de la tarjeta">
      {PESTANAS.map((pestana) => {
        const seleccionada = activa === pestana.id;
        return (
          <button
            key={pestana.id}
            type="button"
            className={`tabs__item${seleccionada ? " tabs__item--activa" : ""}`}
            aria-current={seleccionada ? "page" : undefined}
            onClick={() => {
              if (!seleccionada) vibrar(6);
              alCambiar(pestana.id);
            }}
          >
            <span className="tabs__icono">
              <Icon name={pestana.icono} />
            </span>
            <span className="tabs__texto">{pestana.etiqueta}</span>
          </button>
        );
      })}
    </nav>
  );
}
