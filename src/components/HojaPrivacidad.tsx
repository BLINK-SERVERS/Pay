import { Hoja } from "./Hoja";

interface Props {
  abierta: boolean;
  alCerrar: () => void;
}

/**
 * Política de privacidad de pay.blink.com.ve (LEG-PRI-001).
 *
 * Explica en claro qué datos se tratan y, sobre todo, qué queda guardado en el
 * dispositivo: el aviso de cookies enlaza aquí para que la decisión se tome con
 * la información a la vista.
 */
export function HojaPrivacidad({ abierta, alCerrar }: Props) {
  return (
    <Hoja
      abierta={abierta}
      alCerrar={alCerrar}
      titulo="Política de privacidad"
      descripcion="Versión 1.0 · 8 de noviembre de 2026"
      pie={
        <button type="button" className="boton boton--primario" onClick={alCerrar}>
          Entendido
        </button>
      }
    >
      <div className="legal">
        <p className="legal__aviso">
          Blink Pay guarda en tu dispositivo solo lo necesario para la sesión y tus
          preferencias. No usamos cookies publicitarias ni seguimiento de terceros.
        </p>

        <section>
          <h3>1. Datos que tratamos</h3>
          <p>
            Para operar la billetera usamos los datos de tu cuenta: cédula, nombre,
            teléfono, correo electrónico, saldo y el reporte del Pago Móvil de cada
            recarga. También guardamos el historial de recargas y de viajes con su fecha,
            banco y referencia.
          </p>
        </section>

        <section>
          <h3>2. Para qué los usamos</h3>
          <p>
            Autenticar tu acceso, acreditar el saldo de tu tarjeta, conciliar cada recarga
            con el banco, mostrar tu extracto y atenderte por los canales de soporte. Tu
            PIN se guarda cifrado y no se comparte con terceros.
          </p>
        </section>

        <section>
          <h3>3. Cookies y almacenamiento local</h3>
          <p>
            pay.blink.com.ve no instala cookies publicitarias ni de seguimiento. En tu
            navegador solo queda información técnica que la app necesita para funcionar:
            la sesión iniciada, si ya descartaste el aviso de instalación y la
            respuesta que diste en el aviso de cookies.
          </p>
          <p>
            Puedes borrar todo eso cuando quieras desde los ajustes de tu navegador; la
            app volverá a pedirte el aviso de cookies y, si hiciera falta, la sesión.
          </p>
        </section>

        <section>
          <h3>4. Terceros</h3>
          <p>
            Solo compartimos información con los proveedores estrictamente necesarios para
            operar el servicio: el alojamiento de base de datos y autenticación, la pasarela
            de pago y el banco que procesa el Pago Móvil. No vendemos, alquilamos ni
            cedemos tus datos con fines publicitarios.
          </p>
        </section>

        <section>
          <h3>5. Tus derechos</h3>
          <p>
            Puedes acceder a tus datos, corregirlos, exportarlos o solicitar su eliminación
            escribiendo a atención al cliente. Conservamos los registros contables durante
            el tiempo que exija la normativa aplicable.
          </p>
        </section>

        <section>
          <h3>6. Cambios</h3>
          <p>
            Esta política puede actualizarse. Publicaremos la versión vigente en la landing
            y, ante cambios sustanciales, volveremos a pedirte la decisión sobre las cookies.
          </p>
        </section>
      </div>
    </Hoja>
  );
}
