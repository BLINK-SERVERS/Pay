import type { Pestana } from "../BarraTabs";
import { BlinkSymbol, type NombreSimbolo } from "./BlinkSymbol";
import { useEnLinea } from "../../lib/hooks";
import { iniciales, nombreCompleto } from "../../lib/formato";
import type { Cuenta, Tarjeta } from "../../lib/tipos";

const SECCIONES: { id: Pestana; etiqueta: string; icono: NombreSimbolo }[] = [
  { id: "inicio", etiqueta: "Inicio", icono: "inicio" },
  { id: "movimientos", etiqueta: "Movimientos", icono: "movimientos" },
  { id: "recargar", etiqueta: "Recargar", icono: "recargar" },
  { id: "transferir", etiqueta: "Transferir", icono: "transferir" },
  { id: "perfil", etiqueta: "Mi cuenta", icono: "perfil" },
];

interface Props {
  pestana: Pestana;
  cuenta: Cuenta;
  tarjetas: Tarjeta[];
  alCambiar: (pestana: Pestana) => void;
}

/** Barra lateral translúcida de macOS (240 px). */
export function BarraLateral({ pestana, cuenta, tarjetas, alCambiar }: Props) {
  const enLinea = useEnLinea();
  const nombre = nombreCompleto(cuenta.nombres, cuenta.apellidos);

  return (
    <aside className="barra-lateral" aria-label="Navegación principal">
      <div className="barra-lateral__ventana" aria-hidden="true">
        <span className="barra-lateral__semaforo barra-lateral__semaforo--cerrar" />
        <span className="barra-lateral__semaforo barra-lateral__semaforo--minimizar" />
        <span className="barra-lateral__semaforo barra-lateral__semaforo--ampliar" />
      </div>

      <div className="barra-lateral__marca">
        <span className="barra-lateral__logo" aria-hidden="true">
          <BlinkSymbol nombre="tarjeta" tamano="md" variante="paleta" />
        </span>
        <span>
          BLINK<em>TARJETA</em>
        </span>
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
              {seccion.id === "movimientos" && tarjetas.length > 0 && (
                <span className="barra-lateral__cuenta">{tarjetas.length}</span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="barra-lateral__pie">
        <button
          type="button"
          className="barra-lateral__perfil"
          onClick={() => alCambiar("perfil")}
          aria-label={`Abrir el perfil de ${nombre}`}
        >
          <span className="barra-lateral__avatar">{iniciales(nombre)}</span>
          <span className="barra-lateral__datos">
            <strong>{nombre}</strong>
            <span className="mono">{cuenta.cedula}</span>
          </span>
        </button>
        <p className={`barra-lateral__red${enLinea ? "" : " barra-lateral__red--offline"}`}>
          <BlinkSymbol nombre={enLinea ? "escudo" : "alerta"} tamano="xs" />
          {enLinea ? "Sincronizado con BLINK" : "Trabajando sin conexión"}
        </p>
      </div>
    </aside>
  );
}
