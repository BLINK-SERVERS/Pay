import { useId, useMemo, useState } from "react";
import { Icon } from "./Icon";
import { formatearBs, formatearVence, partesBs, serialCompacto } from "../lib/formato";
import { pasajesEquivalentes, perfilTarifa } from "../lib/dominio";
import { useCopiar, useEnLinea, useNumeroAnimado, vibrar } from "../lib/hooks";
import { QR_PORTAL, svgCode128 } from "../lib/codigos";
import type { Tarjeta } from "../lib/tipos";

interface Props {
  tarjeta: Tarjeta;
  saldoOculto: boolean;
  alAlternarSaldo: () => void;
}

function textoPasajes(pasajes: number): string {
  if (pasajes === 0) return "Saldo insuficiente — Recarga ahora";
  if (pasajes === 1) return "Te alcanza para 1 pasaje";
  return `Te alcanza para ${pasajes} pasajes`;
}

export function TarjetaVirtual({ tarjeta, saldoOculto, alAlternarSaldo }: Props) {
  const [girado, setGirado] = useState(false);
  const [copiado, copiar] = useCopiar();
  const enLinea = useEnLinea();
  const tarjetaId = useId();
  const saldo = useNumeroAnimado(tarjeta.saldo);
  const { entero, decimal } = partesBs(saldo);
  const pasajes = pasajesEquivalentes(tarjeta.saldo, tarjeta.tarifa);
  const perfil = perfilTarifa(tarjeta.serial);
  const bloqueada = tarjeta.estado === "bloqueada";
  const nivel = pasajes === 0 ? "sin-saldo" : pasajes <= 2 ? "bajo" : "ok";
  const barras = useMemo(() => svgCode128(tarjeta.serial), [tarjeta.serial]);

  return (
    <div className="tarjeta-caja">
      <div className="tarjeta" id={tarjetaId} role="group" aria-label={`Tarjeta Blink Pay de ${tarjeta.titular.nombre}`}>
        <div className={`tarjeta__giro${girado ? " tarjeta__giro--volteada" : ""}`}>
          <div className="tarjeta__cara tarjeta__cara--anverso" inert={girado} aria-hidden={girado}>
            <img
              className="tarjeta__arte"
              src={`${import.meta.env.BASE_URL}brand/blink-pay-tarjeta.svg`}
              width="1011"
              height="638"
              alt="Blink Pay"
              draggable={false}
            />
          </div>
          <div className="tarjeta__cara tarjeta__cara--reverso" inert={!girado} aria-hidden={!girado}>
            <div className="tarjeta__reverso">
              <div className="tarjeta__reverso-texto">
                <h3 className="tarjeta__lema">Tu tarjeta de transporte</h3>
                <div className="tarjeta__recarga">
                  <div className="tarjeta__qr">
                    <img src={QR_PORTAL} alt="Código QR para recargar en el portal Blink Pay" />
                  </div>
                  <div>
                    <p className="tarjeta__recarga-titulo">Código de recarga</p>
                    <p className="tarjeta__recarga-texto">
                      Muestra este código o usa tu ID para recargar por Pago Móvil.
                    </p>
                  </div>
                </div>
                <div className="tarjeta__reverso-pie">
                  <span>Vence {formatearVence(tarjeta.vence)} · protegida con validación ISO Luhn</span>
                </div>
              </div>
              <div className="tarjeta__franja">
                <span className="tarjeta__franja-serial mono">{tarjeta.serial}</span>
                {barras ? (
                  <img className="tarjeta__barras" src={barras} alt={`Código de barras de la tarjeta ${tarjeta.serial}`} />
                ) : (
                  <span className="tarjeta__barras-espera" aria-hidden="true" />
                )}
                <span className="tarjeta__franja-etiqueta">Número de tarjeta</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="tarjeta__herramientas">
        <span className={`tarjeta__estado${bloqueada ? " tarjeta__estado--bloqueada" : ""}`}>
          <Icon name={bloqueada ? "candado" : "check-circulo"} />
          {bloqueada ? "Bloqueada" : "Activa"} · {perfil}
        </span>
        <button
          type="button"
          className="tarjeta__voltear"
          onClick={() => { setGirado((valor) => !valor); vibrar(6); }}
          aria-pressed={girado}
          aria-controls={tarjetaId}
          aria-label={girado ? "Volver al frente de la tarjeta" : "Ver reverso y código de barras"}
        >
          <Icon name={girado ? "tarjeta" : "qr"} />
          {girado ? "Ver frente" : "Ver códigos"}
        </button>
      </div>

      <section className="tarjeta__datos" aria-label="Datos de la tarjeta">
        <div className="tarjeta__nucleo">
          <div>
            <span className="tarjeta__etiqueta">Saldo disponible</span>
            <div className="tarjeta__monto">
              {saldoOculto ? (
                <strong aria-label="Saldo oculto">••••</strong>
              ) : (
                <strong>{entero}{decimal ? <span className="tarjeta__decimalos">,{decimal}</span> : null}</strong>
              )}
              <span className="tarjeta__moneda">Bs</span>
            </div>
          </div>
          <button
            type="button"
            className="boton-icono tarjeta__ojo"
            onClick={alAlternarSaldo}
            aria-pressed={saldoOculto}
            aria-label={saldoOculto ? "Mostrar saldo" : "Ocultar saldo"}
          >
            <Icon name={saldoOculto ? "ojo-tachado" : "ojo"} />
          </button>
        </div>
        {!saldoOculto && <p className={`tarjeta__capsula tarjeta__capsula--${nivel}`}>{textoPasajes(pasajes)}</p>}
        <dl className="tarjeta__identidad">
          <div><dt>Titular</dt><dd>{tarjeta.titular.nombre}</dd></div>
          <div>
            <dt>Número</dt>
            <dd className="tarjeta__serial">
              <span className="mono">{tarjeta.serial}</span>
              <button
                type="button"
                className="boton-copiar"
                onClick={() => void copiar(serialCompacto(tarjeta.serial), "serial")}
                aria-label={copiado === "serial" ? "Número copiado" : "Copiar número de tarjeta"}
              >
                <Icon name={copiado === "serial" ? "check" : copiado === "error" ? "alerta" : "copiar"} />
              </button>
            </dd>
          </div>
        </dl>
      </section>
      <p className={`tarjeta__sincro${enLinea ? "" : " tarjeta__sincro--offline"}`}>
        <Icon name={enLinea ? "escudo" : "alerta"} />
        {enLinea
          ? `Sincronizado con Blink Pay · Tarifa actual ${formatearBs(tarjeta.tarifa)}`
          : "Saldo guardado en este teléfono · sin conexión"}
      </p>
      <span className="visualmente-oculto" role="status">
        {girado ? "Mostrando el reverso de la tarjeta" : "Mostrando el frente de la tarjeta"}
        {copiado === "serial" ? ". Número copiado" : copiado === "error" ? ". No se pudo copiar el número" : ""}
      </span>
    </div>
  );
}
