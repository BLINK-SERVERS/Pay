import { memo, useId, useState } from "react";
import { Icon } from "./Icon";
import { partesBs } from "../lib/formato";
import { pasajesEquivalentes } from "../lib/dominio";
import { useNumeroAnimado, vibrar } from "../lib/hooks";
import type { Tarjeta } from "../lib/tipos";

interface Props {
  tarjeta: Tarjeta;
}

type NivelPasajes = "ok" | "bajo" | "sin-saldo";

function nivelPasajes(pasajes: number): NivelPasajes {
  if (pasajes === 0) return "sin-saldo";
  return pasajes <= 2 ? "bajo" : "ok";
}

function textoPasajes(pasajes: number): string {
  if (pasajes === 0) return "Sin pasajes — Recarga ahora";
  if (pasajes === 1) return "Te queda 1 pasaje";
  return `Te quedan ${pasajes} pasajes`;
}

export const TarjetaVirtual = memo(function TarjetaVirtual({ tarjeta }: Props) {
  const [girado, setGirado] = useState(false);
  const tarjetaId = useId();
  const saldo = useNumeroAnimado(tarjeta.saldo);
  const { entero, decimal } = partesBs(saldo);
  const pasajes = pasajesEquivalentes(tarjeta.saldo, tarjeta.tarifa);

  return (
    <div className="tarjeta-caja">
      <div className="tarjeta" id={tarjetaId} role="group" aria-label="Tu tarjeta Blink Pay">
        <div className={`tarjeta__giro${girado ? " tarjeta__giro--volteada" : ""}`}>
          <div className="tarjeta__cara tarjeta__cara--anverso" inert={girado} aria-hidden={girado}>
            <img
              className="tarjeta__arte"
              src={`${import.meta.env.BASE_URL}brand/blink-pay-tarjeta.svg`}
              width="1011"
              height="638"
              alt=""
              draggable={false}
            />
            <p className="tarjeta__saldo">
              <span className="tarjeta__moneda">Bs</span>
              {entero}
              {decimal ? <span className="tarjeta__decimalos">,{decimal}</span> : null}
            </p>
            <p className={`tarjeta__pasajes tarjeta__pasajes--${nivelPasajes(pasajes)}`}>
              {textoPasajes(pasajes)}
            </p>
            <p className="tarjeta__titular">{tarjeta.titular.nombre}</p>
          </div>
          <div className="tarjeta__cara tarjeta__cara--reverso" inert={!girado} aria-hidden={!girado}>
            <span className="tarjeta__serial mono">{tarjeta.serial}</span>
          </div>
        </div>
      </div>

      <div className="tarjeta__herramientas">
        <button
          type="button"
          className="tarjeta__voltear"
          onClick={() => { setGirado((valor) => !valor); vibrar(6); }}
          aria-pressed={girado}
          aria-controls={tarjetaId}
          aria-label={girado ? "Volver al frente de la tarjeta" : "Ver el reverso de la tarjeta"}
        >
          <Icon name="qr" />
          {girado ? "Ver frente" : "Ver reverso"}
        </button>
      </div>

      <span className="visualmente-oculto" role="status">
        {girado ? "Mostrando el reverso de la tarjeta" : "Mostrando el frente de la tarjeta"}
      </span>
    </div>
  );
});
