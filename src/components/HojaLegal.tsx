import { Hoja } from "./Hoja";
import { formatearBs } from "../lib/formato";

interface Props {
  abierta: boolean;
  alCerrar: () => void;
  /** Tarifa del pasaje que se acredita al transportista. */
  tarifa: number;
}

/**
 * Términos y condiciones (LEG-TER-001).
 *
 * La tarifa del pasaje se muestra con el valor vigente de la tarjeta y se
 * separa de la tasa administrativa, tal como exige la cláusula segunda.
 */
export function HojaLegal({ abierta, alCerrar, tarifa }: Props) {
  return (
    <Hoja
      abierta={abierta}
      alCerrar={alCerrar}
      titulo="Términos y condiciones"
      descripcion="LEG-TER-001 · versión 1.0 · 1 de noviembre de 2026"
      pie={
        <button type="button" className="boton boton--primario" onClick={alCerrar}>
          Entendido
        </button>
      }
    >
      <div className="legal">
        <p className="legal__aviso">
          BLINK no presta el servicio de transporte ni fija la tarifa del pasaje. La
          tarifa se acredita al transportista y la tasa administrativa es independiente.
        </p>

        <section>
          <h3>1. Naturaleza del servicio</h3>
          <p>
            BLINK es una plataforma tecnológica de intermediación de pagos y gestión de
            billeteras digitales. El servicio de traslado lo presta el transportista y la
            tarifa del pasaje la homologa la autoridad municipal competente, conforme al
            artículo 178, numeral 2, de la Constitución.
          </p>
          <p>
            La tarifa aplicada en esta operación es de <strong>{formatearBs(tarifa)}</strong>{" "}
            por pasaje. Ese valor se acredita íntegramente al saldo del pasajero y se
            liquida al transportista; BLINK no retiene parte de él.
          </p>
        </section>

        <section>
          <h3>2. Tasa administrativa</h3>
          <p>
            Por usar los canales digitales, la pasarela de pago y la infraestructura sin
            conexión, BLINK cobra una <strong>Tasa Administrativa por Servicio Digital de
            Recarga y Mantenimiento de Billetera</strong>. Es independiente del pasaje y
            retribuye el procesamiento electrónico, la disponibilidad de la plataforma y
            los costos operativos de pasarela.
          </p>
          <p>
            La tasa es variable: el monto exacto se calcula antes de confirmar y queda
            discriminado en el recibo de cada recarga.
          </p>
        </section>

        <section>
          <h3>3. Desglose de cada recarga</h3>
          <ul>
            <li>
              <strong>Pasaje urbano:</strong> cantidad comprada × {formatearBs(tarifa)}; se
              acredita al transportista.
            </li>
            <li>
              <strong>Tasa administrativa:</strong> monto variable correspondiente al
              servicio digital.
            </li>
            <li>
              <strong>Monto total pagado:</strong> suma de ambos conceptos, aceptada por el
              usuario al confirmar la operación.
            </li>
          </ul>
        </section>

        <section>
          <h3>4. Tarjeta inteligente MIFARE Classic 1K</h3>
          <p>
            La tarjeta es un soporte físico de almacenamiento local que permite el acceso
            rápido por proximidad. El saldo representa fondos del usuario para pagar
            pasajes. Al validar a bordo no se cobra comisión: se debita exactamente la
            tarifa del pasaje.
          </p>
        </section>

        <section>
          <h3>5. Datos personales</h3>
          <p>
            Usamos los datos de la cuenta y el reporte del Pago Móvil para operar la
            billetera y conciliar cada recarga. El PIN se guarda como hash y no se comparte
            con terceros. Puedes solicitar acceso, corrección o eliminación de tus datos
            por atención al cliente.
          </p>
        </section>

        <section>
          <h3>6. Base normativa y vigencia</h3>
          <p>
            Estos términos se apoyan en la Ley de Transporte Terrestre, la Ley Orgánica de
            Precios Justos, la Gaceta Oficial N.º 43.335 del 13 de marzo de 2026 y las
            providencias tarifarias municipales aplicables. Rigen desde el 1 de noviembre
            de 2026; los cambios se publican en la aplicación.
          </p>
          <p className="legal__nota">
            La Gaceta Oficial N.º 43.335 fija una referencia nacional de Bs 100,00 para el
            pasaje urbano, Bs 80,00 para metro y ferrocarril y entre Bs 100,00 y Bs 145,00
            para el suburbano según la distancia, y exhorta a las alcaldías a armonizar sus
            tarifas. La tarifa aplicable en cada ruta es la que homologa la autoridad
            municipal correspondiente.
          </p>
        </section>
      </div>
    </Hoja>
  );
}
