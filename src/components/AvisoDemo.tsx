import { nubeConfigurada } from "../lib/nube";
import { Icon } from "./Icon";

/**
 * Sin `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` el repositorio que carga
 * es el de demostración: los seriales, saldos y movimientos son ficticios y no
 * existe cobro real. Un aviso permanente evita que alguien lea «1.000 Bs» y
 * crea que tiene dinero disponible.
 */
export function AvisoDemo() {
  if (nubeConfigurada) return null;

  return (
    <div className="aviso aviso--peligro demo-aviso" role="alert">
      <Icon name="alerta" />
      <span>
        Modo demostración: las tarjetas y los saldos que ves son de prueba y no
        hay cobro real. Blink Pay maneja dinero únicamente conectada a la
        nube.
      </span>
    </div>
  );
}
