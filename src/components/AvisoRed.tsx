import { formatearHora } from "../lib/formato";
import { leerCopia } from "../lib/offline";
import { Icon } from "./Icon";

interface Props {
  enLinea: boolean;
}

/**
 * Estado de red siempre visible. Sin red, la app sirve la última copia
 * verificada por el servidor (ver `lib/offline.ts`), así que además de avisar
 * dice a qué hora se tomó ese saldo: el pasajero no puede confundir un dato
 * viejo con uno recién leído.
 */
export function AvisoRed({ enLinea }: Props) {
  if (enLinea) return null;
  const copia = leerCopia();
  const hora = copia ? formatearHora(new Date(copia.guardado).toISOString()) : "";

  return (
    <div className="aviso aviso--info aviso--red" role="status" aria-live="polite">
      <Icon name="reloj" />
      <p>
        Estás sin conexión.
        {hora
          ? ` Mostramos el último saldo conocido a las ${hora}; al recuperar la red se actualiza solo.`
          : " El saldo que ves puede no ser el actual."}{" "}
        Recargar y transferir necesitan red.
      </p>
    </div>
  );
}
