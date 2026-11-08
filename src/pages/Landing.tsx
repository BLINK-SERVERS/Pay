import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { AvisoCookies } from "../components/AvisoCookies";
import { AvisoDemo } from "../components/AvisoDemo";
import { HojaLegal } from "../components/HojaLegal";
import { HojaPrivacidad } from "../components/HojaPrivacidad";
import { Icon } from "../components/Icon";
import { useConsultaMedio } from "../lib/hooks";
import marca from "../assets/marca-blink-pay.svg?raw";
import isotipo from "../assets/marca-blink-isotipo.svg?raw";
import ondas from "../assets/ondas-nfc.svg?raw";
import sinContacto from "../../marca/blink-pay-sin-contacto.svg";
import "../styles/landing.css";

/**
 * Landing de pay.blink.com.ve — la puerta de entrada.
 *
 * La referencia es https://www.apple.com/la/apple-pay/ (HTML guardado por la
 * dirección). Se replica su orden y su vocabulario: cinta → hero con logo →
 * cuatro beneficios en oscuro → configuración con hardware pegajoso → «Tu
 * vida, más simple» → seguridad en oscuro → preguntas en acordeón → notas →
 * pie. Las secciones llevan tema FIJO (claro u oscuro), igual que la
 * referencia: no siguen la apariencia del sistema.
 *
 * Todo el color, la tipografía, los radios y los materiales salen de
 * `tokens.css`; los iconos son SF Symbols vía `Icon`. La geometría de marca
 * se reutiliza tal cual desde los SVG aprobados: aquí solo se quitan los
 * `id` al insertarlos en línea para no duplicarlos en el documento (la
 * landing muestra el lockup dos veces) y se reencuadran las ondas en su
 * propia caja de tinta. Ninguna path se modifica.
 *
 * Los mockups de teléfono y validador son composiciones CSS con la interfaz
 * real y las pantallas del firmware; no son fotografías. Sustituirlos por
 * fotografía generada está pendiente (ImageGen devolvió 403 en esta cuenta).
 */

const BASE = import.meta.env.BASE_URL;

/** El lockup aprobado, sin `id` repetidos al insertarlo en línea. */
const MARCA = marca.replace(/\sid="[^"]*"/g, "");
const ISOTIPO = isotipo.replace(/\sid="[^"]*"/g, "");
/** Las mismas tres ondas, con clase en vez de id para poder animarlas. */
const ONDAS = ondas
  .replace(/id="nfc-(\d)"/g, 'class="lp-onda lp-onda--$1"')
  .replace(/\sid="[^"]*"/g, "");

interface Props {
  /** «Configura tu tarjeta» → acceso en modo registro. */
  alConfigurar: () => void;
  /** «Ya tengo cuenta» → acceso en modo entrar. */
  alEntrar: () => void;
  /** Tarifa vigente que muestran los términos legales. */
  tarifa: number;
}

/* ------------------------------------------------------------------ *
 * Piezas de marca
 * ------------------------------------------------------------------ */

function Marca({ className = "" }: { className?: string }) {
  return (
    <span
      className={`lp-marca ${className}`.trim()}
      role="img"
      aria-label="Blink Pay"
      dangerouslySetInnerHTML={{ __html: MARCA }}
    />
  );
}

function Isotipo({ className = "" }: { className?: string }) {
  return (
    <span
      className={`lp-isotipo ${className}`.trim()}
      role="img"
      aria-label="Blink"
      dangerouslySetInnerHTML={{ __html: ISOTIPO }}
    />
  );
}

/**
 * El símbolo que se busca al pagar: las tres ondas de la marca. En la
 * referencia es el glifo NFC inline; aquí es la pieza aprobada del lockup,
 * que sí cabe en una línea de texto.
 */
function Ondas({ titulo, animadas = false }: { titulo?: string; animadas?: boolean }) {
  return (
    <span
      className={`lp-ondas${animadas ? " lp-ondas--vivas" : ""}`}
      role={titulo ? "img" : undefined}
      aria-label={titulo}
      aria-hidden={titulo ? undefined : true}
      dangerouslySetInnerHTML={{ __html: ONDAS }}
    />
  );
}

/* ------------------------------------------------------------------ *
 * Mockups (composiciones CSS, no fotografías)
 * ------------------------------------------------------------------ */

function Telefono({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div className="lp-telefono" role="img" aria-label={etiqueta}>
      <div className="lp-telefono__marco">
        <span className="lp-telefono__isla" />
        <div className="lp-telefono__pantalla">{children}</div>
        <span className="lp-telefono__barra" />
      </div>
    </div>
  );
}

/** La billetera tal como se ve en la app: saludo, tarjeta, saldo y extracto. */
function MiniBilletera() {
  return (
    <div className="lp-mini lp-mini--billetera">
      <p className="lp-mini__titulo">Buenas noches, María</p>
      <div className="lp-mini__tarjeta">
        <img
          className="lp-mini__arte"
          src={`${BASE}brand/blink-pay-tarjeta.svg`}
          width="1011"
          height="638"
          alt=""
          draggable={false}
        />
        <span className="lp-mini__saldo">
          <span className="lp-mini__moneda">Bs</span>1.500
        </span>
        <span className="lp-mini__pasajes">3 pasajes</span>
        <span className="lp-mini__titular">María Pérez</span>
      </div>
      <span className="lp-mini__reverso">
        <Icon name="qr" tamano="sm" />
        Ver reverso
      </span>
      <div className="lp-mini__carrusel">
        <span className="lp-mini__puntos" aria-hidden="true">
          <i className="lp-mini__punto lp-mini__punto--activo" />
          <i className="lp-mini__punto" />
        </span>
        <span className="lp-mini__vincular">
          <Icon name="mas" tamano="sm" />
          Vincular tarjeta
        </span>
      </div>
      <p className="lp-mini__rotulo">Últimos movimientos</p>
      <div className="lp-mini__lista">
        <div className="lp-mini__fila">
          <Icon name="autobus" tamano="sm" />
          <span className="lp-mini__fila-texto">
            <strong>Pasaje en la línea</strong>
            <em>Hoy · 07:42 · Demo-01</em>
          </span>
          <span className="lp-mini__monto">−500</span>
        </div>
        <div className="lp-mini__fila">
          <Icon name="autobus" tamano="sm" />
          <span className="lp-mini__fila-texto">
            <strong>Pasaje en la línea</strong>
            <em>Hoy · 06:58 · Demo-01</em>
          </span>
          <span className="lp-mini__monto">−500</span>
        </div>
        <div className="lp-mini__fila lp-mini__fila--entra">
          <Icon name="rayo" tamano="sm" />
          <span className="lp-mini__fila-texto">
            <strong>Pago Móvil aprobado</strong>
            <em>Ayer · 06:20 · Banesco</em>
          </span>
          <span className="lp-mini__monto">+1.000</span>
        </div>
        <div className="lp-mini__fila">
          <Icon name="autobus" tamano="sm" />
          <span className="lp-mini__fila-texto">
            <strong>Pasaje en la línea</strong>
            <em>05-nov · 05:05 · Demo-02</em>
          </span>
          <span className="lp-mini__monto">−500</span>
        </div>
        <div className="lp-mini__fila">
          <Icon name="autobus" tamano="sm" />
          <span className="lp-mini__fila-texto">
            <strong>Pasaje en la línea</strong>
            <em>04-nov · 07:15 · Demo-01</em>
          </span>
          <span className="lp-mini__monto">−500</span>
        </div>
        <div className="lp-mini__fila">
          <Icon name="autobus" tamano="sm" />
          <span className="lp-mini__fila-texto">
            <strong>Pasaje en la línea</strong>
            <em>03-nov · 06:50 · Demo-02</em>
          </span>
          <span className="lp-mini__monto">−500</span>
        </div>
        <div className="lp-mini__fila">
          <Icon name="autobus" tamano="sm" />
          <span className="lp-mini__fila-texto">
            <strong>Pasaje en la línea</strong>
            <em>02-nov · 07:30 · Demo-01</em>
          </span>
          <span className="lp-mini__monto">−500</span>
        </div>
      </div>
      <div className="lp-mini__tabs">
        <span className="lp-mini__tab lp-mini__tab--activa">
          <Icon name="inicio" tamano="sm" />
          Inicio
        </span>
        <span className="lp-mini__tab">
          <Icon name="movimientos" tamano="sm" />
          Movimientos
        </span>
        <span className="lp-mini__tab">
          <Icon name="recargar" tamano="sm" />
          Recargar
        </span>
        <span className="lp-mini__tab">
          <Icon name="transferir" tamano="sm" />
          Transferir
        </span>
        <span className="lp-mini__tab">
          <Icon name="perfil" tamano="sm" />
          Perfil
        </span>
      </div>
    </div>
  );
}

/** El alta de la cuenta: cédula y PIN, sin teclado desplegado. */
function MiniRegistro() {
  return (
    <div className="lp-mini lp-mini--registro">
      <p className="lp-mini__titulo">Crear cuenta</p>
      <ol className="lp-mini__pasos" aria-hidden="true">
        <li className="lp-mini__paso lp-mini__paso--actual">
          <i>1</i> Tus datos
        </li>
        <li className="lp-mini__paso">
          <i>2</i> Pago Móvil
        </li>
      </ol>
      <div className="lp-mini__dupla">
        <div className="lp-mini__campo">
          <em>Nombres</em>
          <span className="lp-mini__valor">María Fernanda</span>
        </div>
        <div className="lp-mini__campo">
          <em>Apellidos</em>
          <span className="lp-mini__valor">Pérez</span>
        </div>
      </div>
      <div className="lp-mini__campo">
        <em>Cédula</em>
        <span className="lp-mini__valor">12.345.678</span>
      </div>
      <div className="lp-mini__campo">
        <em>Teléfono</em>
        <span className="lp-mini__valor">0414-1234567</span>
      </div>
      <div className="lp-mini__campo">
        <em>Correo</em>
        <span className="lp-mini__valor">maria@ejemplo.com</span>
        <span className="lp-mini__ayuda">Avisos de recarga y recuperación de acceso.</span>
      </div>
      <div className="lp-mini__campo">
        <em>PIN de 6 dígitos</em>
        <span className="lp-mini__pin" aria-hidden="true">
          <i /><i /><i /><i /><i /><i />
        </span>
      </div>
      <div className="lp-mini__campo">
        <em>Repite el PIN</em>
        <span className="lp-mini__pin" aria-hidden="true">
          <i /><i /><i /><i /><i /><i />
        </span>
      </div>
      <span className="lp-mini__boton">Continuar</span>
      <p className="lp-mini__nota">Tu PIN es la llave de respaldo. Anótalo.</p>
    </div>
  );
}

/**
 * La pantalla de inicio del teléfono con Blink Pay añadido. Los demás
 * iconos son genéricos (SF Symbols sobre un velo neutro): no se reproducen
 * marcas de terceros.
 */
function MiniPantallaInicio() {
  // Rejilla de 4×4 como una pantalla de inicio real: catorce apps genéricas
  // (sin logos de terceros) y Blink Pay en el segundo renglón, destacado.
  const genericas = [
    { nombre: "correo", etiqueta: "Correo" },
    { nombre: "reloj", etiqueta: "Reloj" },
    { nombre: "sol", etiqueta: "Clima" },
    { nombre: "banco", etiqueta: "Banco" },
    { nombre: "documento", etiqueta: "Notas" },
    { nombre: "qr", etiqueta: "Código" },
    { nombre: "autobus", etiqueta: "Rutas" },
    { nombre: "personas", etiqueta: "Contactos" },
    { nombre: "barras", etiqueta: "Bolsa" },
    { nombre: "luna", etiqueta: "Descanso" },
    { nombre: "escudo", etiqueta: "Seguridad" },
    { nombre: "tarjeta", etiqueta: "Cartera" },
    { nombre: "actualizar", etiqueta: "Tienda" },
    { nombre: "ayuda", etiqueta: "Soporte" },
    { nombre: "compartir", etiqueta: "Compartir" },
  ] as const;
  const celdaGenerica = (app: (typeof genericas)[number]) => (
    <span key={app.nombre} className="lp-mini__celda">
      <span className="lp-mini__app lp-mini__app--generica">
        <Icon name={app.nombre} tamano="sm" />
      </span>
      <span className="lp-mini__etiqueta-app">{app.etiqueta}</span>
    </span>
  );
  return (
    <div className="lp-mini lp-mini--inicio">
      <div className="lp-mini--inicio__rejilla">
        {genericas.slice(0, 7).map(celdaGenerica)}
        <span className="lp-mini__celda">
          <span className="lp-mini__app lp-mini__app--blink">
            <img src={`${BASE}icon.png`} width="512" height="512" alt="" draggable={false} />
          </span>
          <span className="lp-mini__etiqueta-app">Blink Pay</span>
        </span>
        {genericas.slice(7).map(celdaGenerica)}
      </div>
      <span className="lp-mini--inicio__buscar">Buscar</span>
      <div className="lp-mini--inicio__dock">
        <span className="lp-mini__app lp-mini__app--generica">
          <Icon name="telefono" tamano="sm" />
        </span>
        <span className="lp-mini__app lp-mini__app--generica">
          <Icon name="movimientos" tamano="sm" />
        </span>
        <span className="lp-mini__app lp-mini__app--generica">
          <Icon name="destello" tamano="sm" />
        </span>
        <span className="lp-mini__app lp-mini__app--generica">
          <Icon name="persona" tamano="sm" />
        </span>
      </div>
    </div>
  );
}

type EscenaValidador = "reposo" | "aprobado" | "saldo";

/**
 * Las tres escenas del validador ESP32 (firmware 13): reposo con el símbolo
 * sin contacto, aprobado a pantalla completa y el saldo con el isotipo.
 * Los colores de pantalla son los del firmware (`pantalla.cpp`), no los de
 * la landing: #000000 reposo, #00C853 aprobado, #FFFFFF tinta.
 */
function Validador({ escena, pie }: { escena: EscenaValidador; pie: string }) {
  return (
    <div className="lp-validador">
      <div
        className={`lp-validador__pantalla lp-validador__pantalla--${escena}`}
        role="img"
        aria-label={
          escena === "reposo"
            ? "Pantalla del validador en reposo: el símbolo de pago sin contacto"
            : escena === "aprobado"
              ? "Pantalla del validador en verde con una marca de verificación: pasaje aprobado"
              : "Pantalla del validador con el isotipo Blink y el saldo restante"
        }
      >
        {escena === "reposo" && (
          <img
            className="lp-validador__sin-contacto"
            src={sinContacto}
            width="236"
            height="142"
            alt=""
            draggable={false}
          />
        )}
        {escena === "aprobado" && (
          <Icon name="check" variante="monocromo" tamano={72} className="lp-validador__check" />
        )}
        {escena === "saldo" && (
          <span className="lp-validador__saldo-escena">
            <Isotipo className="lp-validador__isotipo" />
            <span className="lp-validador__cifra">Bs 1.000</span>
          </span>
        )}
      </div>
      <span className="lp-validador__pie">{pie}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Acordeón de preguntas
 * ------------------------------------------------------------------ */

interface Pregunta {
  pregunta: string;
  respuesta: ReactNode;
  enlaces?: { texto: string; alPulsar?: () => void; href?: string }[];
}

function Acordeon({ items }: { items: Pregunta[] }) {
  const base = useId();
  const [abierta, setAbierta] = useState<number | null>(null);

  return (
    <ul className="lp-acordeon">
      {items.map((item, indice) => {
        const activo = abierta === indice;
        const idBoton = `${base}-boton-${indice}`;
        const idPanel = `${base}-panel-${indice}`;
        return (
          <li
            key={item.pregunta}
            className={`lp-acordeon__item${activo ? " lp-acordeon__item--abierto" : ""}`}
          >
            <h3 className="lp-acordeon__titulo">
              <button
                type="button"
                className="lp-acordeon__boton"
                id={idBoton}
                aria-expanded={activo}
                aria-controls={idPanel}
                onClick={() => setAbierta(activo ? null : indice)}
              >
                <span className="lp-acordeon__texto">{item.pregunta}</span>
                <span className="lp-acordeon__chevron" aria-hidden="true">
                  <Icon name="adelante" tamano="sm" />
                </span>
              </button>
            </h3>
            <div
              className="lp-acordeon__bandeja"
              id={idPanel}
              role="region"
              aria-labelledby={idBoton}
              inert={!activo}
            >
              <div className="lp-acordeon__contenido">
                <p className="lp-acordeon__respuesta">{item.respuesta}</p>
                {item.enlaces && (
                  <ul className="lp-enlaces">
                    {item.enlaces.map((enlace) => (
                      <li key={enlace.texto}>
                        {enlace.href ? (
                          <a className="lp-enlace" href={enlace.href}>
                            {enlace.texto}
                            <Icon name="adelante" tamano="xs" />
                          </a>
                        ) : (
                          <button type="button" className="lp-enlace" onClick={enlace.alPulsar}>
                            {enlace.texto}
                            <Icon name="adelante" tamano="xs" />
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/* ------------------------------------------------------------------ *
 * Sección de configuración con hardware pegajoso
 * ------------------------------------------------------------------ */

const PASOS = [
  {
    titulo: "Configúralo en segundos desde tu celular.",
    cuerpo: (
      <>
        Para comenzar, abre <span className="lp-dominio">pay.blink.com.ve</span>, regístrate,
        agrega una tarjeta Blink Pay y recárgala.<sup>1</sup> Todo queda en tu billetera: el
        saldo, los pasajes que te quedan y cada viaje.
      </>
    ),
    etiqueta: "Teléfono con el registro de Blink Pay",
    pantalla: <MiniRegistro />,
  },
  {
    titulo: "Acerca tu tarjeta y listo.",
    cuerpo: (
      <>
        Cuando vayas a pagar, sólo tienes que acercar tu tarjeta al lector de la unidad. El
        validador cobra la tarifa exacta, te muestra el saldo y guarda el viaje aunque se
        quede sin señal.<sup>2</sup>
      </>
    ),
    etiqueta: "Validador de la unidad: reposo, pasaje aprobado y saldo",
    pantalla: null,
  },
  {
    titulo: "Blink Pay ya está en tu dispositivo.",
    cuerpo: (
      <>
        Para tenerlo, solo agrégalo a tu pantalla de inicio. No necesitas descargar ninguna
        app ni hacer trámites adicionales.
      </>
    ),
    etiqueta: "Pantalla de inicio del teléfono con el icono de Blink Pay",
    pantalla: <MiniPantallaInicio />,
  },
] as const;

function Configuracion() {
  const escritorio = useConsultaMedio("(min-width: 768px)");
  const [activo, setActivo] = useState(0);
  const refs = useRef<(HTMLDivElement | null)[]>([]);

  // En escritorio el hardware queda fijo y la escena cambia con el párrafo
  // que se está leyendo, igual que el «sticky hardware» de la referencia.
  useEffect(() => {
    if (!escritorio) return;
    const observador = new IntersectionObserver(
      (entradas) => {
        const visible = entradas
          .filter((entrada) => entrada.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!visible) return;
        const indice = Number((visible.target as HTMLElement).dataset.indice);
        if (!Number.isNaN(indice)) setActivo(indice);
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: [0, 0.25, 0.5, 1] }
    );
    refs.current.forEach((nodo) => nodo && observador.observe(nodo));
    return () => observador.disconnect();
  }, [escritorio]);

  const hardware = (indice: number) =>
    indice === 1 ? (
      <div className="lp-tira">
        <Validador escena="reposo" pie="Acerca" />
        <Validador escena="aprobado" pie="Listo" />
        <Validador escena="saldo" pie="Tu saldo" />
      </div>
    ) : (
      <Telefono etiqueta={PASOS[indice].etiqueta}>{PASOS[indice].pantalla}</Telefono>
    );

  if (!escritorio) {
    return (
      <div className="lp-pasos">
        {PASOS.map((paso, indice) => (
          <div className="lp-paso" key={paso.titulo}>
            <div className="lp-paso__hardware">{hardware(indice)}</div>
            <div className="lp-paso__texto">
              <h3 className="lp-paso__titulo">{paso.titulo}</h3>
              <p className="lp-dos-tonos">{paso.cuerpo}</p>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="lp-pegajoso">
      <div className="lp-pegajoso__hardware">
        {PASOS.map((paso, indice) => (
          <div
            key={paso.titulo}
            className={`lp-pegajoso__escena${activo === indice ? " lp-pegajoso__escena--activa" : ""}`}
            aria-hidden={activo !== indice}
          >
            {hardware(indice)}
          </div>
        ))}
      </div>
      <div className="lp-pegajoso__texto">
        {PASOS.map((paso, indice) => (
          <div
            className="lp-paso"
            key={paso.titulo}
            data-indice={indice}
            ref={(nodo) => {
              refs.current[indice] = nodo;
            }}
          >
            <div className="lp-paso__texto">
              <h3 className="lp-paso__titulo">{paso.titulo}</h3>
              <p className="lp-dos-tonos">{paso.cuerpo}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Página
 * ------------------------------------------------------------------ */

export function Landing({ alConfigurar, alEntrar, tarifa }: Props) {
  const [legal, setLegal] = useState(false);
  const [privacidad, setPrivacidad] = useState(false);

  const preguntas: Pregunta[] = [
    {
      pregunta: "¿Cómo uso Blink Pay?",
      respuesta: (
        <>
          Recargas tu tarjeta Blink Pay desde el celular y la acercas al lector de la unidad.
          El viaje se cobra al instante y el saldo queda a la vista. Es privado, seguro y no
          necesitas efectivo.
        </>
      ),
      enlaces: [
        { texto: "Configura tu tarjeta", alPulsar: alConfigurar },
        { texto: "Cómo recargar", href: "#preguntas" },
      ],
    },
    {
      pregunta: "¿Es seguro usar Blink Pay?",
      respuesta: (
        <>
          Sí. Tu PIN se guarda con un hash y nunca se devuelve al navegador ni se escribe en
          registros. Cada sesión dura 12 horas y se cierra sola. Si activas la huella o el
          rostro, los verifica tu teléfono: Blink no los recibe ni los guarda. El validador
          autentica el chip con llaves propias y debita la tarifa exacta, sin recargos.
        </>
      ),
      enlaces: [{ texto: "Términos y condiciones", alPulsar: () => setLegal(true) }],
    },
    {
      pregunta: "¿Cómo configuro Blink Pay?",
      respuesta: (
        <>
          Abre pay.blink.com.ve y crea tu cuenta con cédula, teléfono, correo y un PIN de 6
          dígitos. Después vincula el serial impreso al reverso de tu tarjeta y recarga. Por
          último, agrégalo a tu pantalla de inicio para entrar de un toque.
        </>
      ),
      enlaces: [
        { texto: "Crear cuenta", alPulsar: alConfigurar },
        { texto: "Ya tengo cuenta", alPulsar: alEntrar },
      ],
    },
    {
      pregunta: "¿Cómo recargo mi tarjeta?",
      respuesta: (
        <>
          Elige cuántos pasajes quieres y transfiere el monto exacto por Pago Móvil. Luego
          reporta tu banco y los últimos 4 dígitos de la referencia. Cuando el operador
          verifica el pago se acredita el valor de los pasajes, y el saldo del plástico se
          actualiza al apoyarlo en la siguiente unidad.<sup>2</sup>
        </>
      ),
    },
    {
      pregunta: "¿Cuánto cuesta cada viaje?",
      respuesta: (
        <>
          La tarifa del pasaje la homologa la autoridad municipal y la ves en la app antes de
          recargar.<sup>3</sup> El recibo separa el pasaje de la tasa administrativa digital,
          que cubre la pasarela y la plataforma. Al validar no hay comisión: se debita la
          tarifa exacta de tu tarjeta.
        </>
      ),
      enlaces: [{ texto: "Términos y condiciones", alPulsar: () => setLegal(true) }],
    },
    {
      pregunta: "¿Puedo pasar saldo a la tarjeta de mi hijo?",
      respuesta: (
        <>
          Sí. En Transferir eliges la tarjeta de origen, escribes el serial de destino y
          confirmas con tu PIN. No cobra comisión y cada tarjeta sigue pagando el pasaje a su
          propia tarifa. El tope por operación es de Bs 5.000 y por cuenta en 24 horas, de
          Bs 20.000.<sup>5</sup>
        </>
      ),
    },
    {
      pregunta: "¿Funciona si la unidad se queda sin señal?",
      respuesta: (
        <>
          Sí. El validador guarda los viajes en su memoria y los sube al recuperar la
          conexión. Las recargas ya aprobadas se aplican al plástico en cuanto lo apoyas, y
          la app te avisa con texto e icono cuando estás sin conexión.
        </>
      ),
    },
    {
      pregunta: "¿Qué pasa si pierdo la tarjeta u olvido el PIN?",
      respuesta: (
        <>
          Repórtalo a atención al cliente (0800-BLINK-00). La tarjeta se marca como perdida,
          desaparece de tu billetera y no puede cobrarse. El PIN se recupera presencial o por
          el canal de atención; nunca se envía por correo.
        </>
      ),
    },
  ];

  return (
    <div className="lp">
      <a className="lp-salto" href="#contenido-lp">
        Saltar al contenido
      </a>

      <header className="lp-nav">
        <div className="lp-nav__fila">
          <a className="lp-nav__titulo" href="#arriba">
            Blink Pay
          </a>
          <nav className="lp-nav__enlaces" aria-label="Secciones">
            <a href="#configurar">Configurar</a>
            <a href="#seguridad">Seguridad</a>
            <a href="#preguntas">Preguntas</a>
          </nav>
          <button type="button" className="lp-boton lp-boton--primario lp-nav__cta" onClick={alConfigurar}>
            Configura tu tarjeta
          </button>
        </div>
      </header>

      <main id="contenido-lp">
        {/* Hero — tema claro, como section-hero de la referencia */}
        <section className="lp-seccion lp-seccion--clara lp-hero" id="arriba" aria-labelledby="hero-titulo">
          <div className="lp-contenido">
            <div className="lp-cinta">
              <p>
                Configura Blink Pay en segundos.{" "}
                <a className="lp-enlace" href="#configurar">
                  Más información
                  <Icon name="adelante" tamano="xs" />
                </a>
              </p>
            </div>

            <AvisoDemo />

            <h1 className="visualmente-oculto" id="hero-titulo">
              Blink Pay
            </h1>
            <Marca className="lp-hero__marca" />
            <h2 className="lp-hero__titular">
              Paga con Blink.
              <span className="lp-hero__sub">Más rápido y práctico que el efectivo.</span>
            </h2>
            <p className="lp-hero__cta">
              <button type="button" className="lp-boton lp-boton--primario" onClick={alConfigurar}>
                Configura tu tarjeta
              </button>
              <button type="button" className="lp-boton lp-boton--fantasma" onClick={alEntrar}>
                Ya tengo cuenta
                <Icon name="adelante" tamano="sm" />
              </button>
            </p>

            <div className="lp-hero__hardware">
              <Telefono etiqueta="Teléfono mostrando la billetera Blink Pay con el saldo de la tarjeta">
                <MiniBilletera />
              </Telefono>
              <p className="lp-nota-visual">Pantalla de la app con datos de ejemplo.</p>
            </div>
          </div>
        </section>

        {/* Beneficios — tema oscuro, cuatro piezas con check */}
        <section className="lp-seccion lp-seccion--oscura lp-beneficios" aria-label="Lo que ganas con Blink Pay">
          <div className="lp-contenido">
            <ul className="lp-beneficios__rejilla">
              {[
                "Privacidad y seguridad integradas.",
                "Pagar tu pasaje es más fácil con Blink Pay.",
                "Ampliamente aceptado por las líneas de transporte.",
                "Sin descargar apps ni hacer trámites.",
              ].map((texto) => (
                <li className="lp-beneficio" key={texto}>
                  <span className="lp-beneficio__check" aria-hidden="true">
                    <Icon name="check" variante="monocromo" tamano="lg" />
                  </span>
                  <h2 className="lp-beneficio__titulo">{texto}</h2>
                </li>
              ))}
            </ul>
            <p className="lp-disponibilidad">
              Ya disponible en <strong>Maracaibo</strong>.<sup>4</sup>
            </p>
          </div>
        </section>

        {/* Configuración — hardware pegajoso, tema claro */}
        <section className="lp-seccion lp-seccion--clara lp-configurar" id="configurar" aria-labelledby="configurar-titulo">
          <div className="lp-contenido">
            <h2 className="lp-titulo-seccion" id="configurar-titulo">
              Configura tu tarjeta en segundos.
            </h2>
            <Configuracion />
          </div>
        </section>

        {/* Tu vida, más simple — tema claro, fila 5/12 + desplazamiento */}
        <section className="lp-seccion lp-seccion--clara lp-simple" aria-labelledby="simple-titulo">
          <div className="lp-contenido">
            <h2 className="lp-titulo-seccion" id="simple-titulo">
              Tu vida, más simple.
            </h2>
            <p className="lp-cuerpo-icono">
              Paga tu pasaje cómodamente. Sólo busca <Ondas titulo="el símbolo de pago sin contacto de Blink" /> al
              pagar.
            </p>
            <div className="lp-fila">
              <div className="lp-fila__visual">
                <div className="lp-tarjeta-plana">
                  <img
                    src={`${BASE}brand/blink-pay-tarjeta.svg`}
                    width="1011"
                    height="638"
                    alt="Tarjeta Blink Pay: plástico azul con el isotipo y el logotipo"
                    draggable={false}
                  />
                </div>
                <Ondas animadas />
              </div>
              <div className="lp-fila__texto">
                <h3 className="lp-subtitulo">Úsalo en la unidad.</h3>
                <p className="lp-dos-tonos">
                  <strong>Blink Pay es un sistema de pago ampliamente aceptado.</strong> Funciona
                  con las líneas de transporte de Maracaibo, en cualquier unidad que admita pagos
                  sin contacto.<sup>4</sup> Y si tienes dudas, pregunta.
                </p>
                <p className="lp-dos-tonos">
                  <strong>Menos contacto, menos problemas.</strong> Blink Pay funciona con tu
                  tarjeta recargable, para que no tengas que buscar efectivo, hacer avances ni
                  pagar por Pago Móvil en la puerta de la unidad.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Seguridad — tema oscuro, tres piezas con icono */}
        <section className="lp-seccion lp-seccion--oscura lp-seguridad" id="seguridad" aria-labelledby="seguridad-titulo">
          <div className="lp-contenido">
            <h2 className="lp-titulo-seccion" id="seguridad-titulo">
              Transacciones privadas y seguras.
            </h2>
            <ul className="lp-seguridad__rejilla">
              <li className="lp-pieza">
                <span className="lp-pieza__icono" aria-hidden="true">
                  <Icon name="escudo" tamano="xl" />
                </span>
                <p className="lp-dos-tonos">
                  <strong>Tus datos personales están a salvo.</strong> Tu PIN se guarda con un
                  hash y nunca vuelve al navegador ni se escribe en registros. La sesión dura 12
                  horas, viaja siempre por HTTPS y tu cédula no se comparte con el transportista.
                </p>
              </li>
              <li className="lp-pieza">
                <span className="lp-pieza__icono" aria-hidden="true">
                  <Icon name="huella" tamano="xl" />
                </span>
                <p className="lp-dos-tonos">
                  <strong>La biometría la verifica tu teléfono.</strong> Si activas la huella o el
                  rostro, Blink no los recibe ni los guarda: quedan en el autenticador del
                  equipo. Desbloquean la sesión guardada y el PIN sigue siendo la llave de
                  respaldo.
                </p>
              </li>
              <li className="lp-pieza">
                <span className="lp-pieza__icono" aria-hidden="true">
                  <Icon name="tarjeta" tamano="xl" />
                </span>
                <p className="lp-dos-tonos">
                  <strong>Cada viaje se cobra exacto.</strong> El validador autentica el chip con
                  llaves propias y debita la tarifa de tu tarjeta sin recargos. El extracto
                  muestra cada recarga y cada viaje con su fecha, banco y referencia.
                </p>
              </li>
            </ul>
          </div>
        </section>

        {/* Preguntas — tema claro, acordeón */}
        <section className="lp-seccion lp-seccion--clara lp-preguntas" id="preguntas" aria-labelledby="preguntas-titulo">
          <div className="lp-contenido lp-contenido--estrecho">
            <h2 className="lp-titulo-seccion" id="preguntas-titulo">
              Las respuestas a tus preguntas.
            </h2>
            <Acordeon items={preguntas} />
            <ul className="lp-enlaces lp-enlaces--pie">
              <li>
                <button type="button" className="lp-enlace" onClick={alConfigurar}>
                  Crear cuenta
                  <Icon name="adelante" tamano="xs" />
                </button>
              </li>
              <li>
                <button type="button" className="lp-enlace" onClick={alEntrar}>
                  Entrar con PIN y cédula
                  <Icon name="adelante" tamano="xs" />
                </button>
              </li>
              <li>
                <button type="button" className="lp-enlace" onClick={() => setLegal(true)}>
                  Términos y condiciones
                  <Icon name="adelante" tamano="xs" />
                </button>
              </li>
            </ul>
          </div>
        </section>

        {/* Notas al pie — el «sosumi» de la referencia */}
        <section className="lp-seccion lp-seccion--clara lp-notas" aria-label="Notas">
          <div className="lp-contenido">
            <ol className="lp-notas__lista">
              <li>
                La tarjeta se vincula con el serial impreso al reverso del plástico. Puedes
                tener varias tarjetas en la misma cuenta y pasar saldo entre ellas.
              </li>
              <li>
                El validador guarda los viajes cuando no hay señal y los sube al recuperar la
                conexión. Las recargas aprobadas se aplican al plástico en el siguiente tap.
              </li>
              <li>
                BLINK no presta el servicio de transporte ni fija la tarifa. La tarifa del
                pasaje la homologa la autoridad municipal, se acredita íntegra al
                transportista y se muestra en la app antes de recargar. La tasa administrativa
                digital es independiente y se discrimina en el recibo.
              </li>
              <li>
                La disponibilidad depende de cada línea de transporte y de las unidades que
                admitan pagos sin contacto. Consulta a tu operador.
              </li>
              <li>
                Los topes de recarga y de transferencia los fija la configuración del servicio
                y pueden cambiar.
              </li>
            </ol>
          </div>
        </section>
      </main>

      <footer className="lp-pie">
        <div className="lp-contenido">
          <Marca className="lp-pie__marca" />
          <div className="lp-pie__fila">
            <p className="lp-pie__legal">
              Copyright © 2026 Blink. Maracaibo, Venezuela.
            </p>
            <ul className="lp-pie__enlaces">
              <li>
                <button type="button" className="lp-enlace" onClick={() => setLegal(true)}>
                  Términos y condiciones
                </button>
              </li>
              <li>
                <button type="button" className="lp-enlace" onClick={() => setPrivacidad(true)}>
                  Privacidad
                </button>
              </li>
              <li>
                <button type="button" className="lp-enlace" onClick={alEntrar}>
                  Entrar
                </button>
              </li>
              <li>
                <span className="lp-pie__atencion">Atención al cliente: 0800-BLINK-00</span>
              </li>
            </ul>
          </div>
        </div>
      </footer>

      <AvisoCookies alPrivacidad={() => setPrivacidad(true)} />
      <HojaLegal abierta={legal} alCerrar={() => setLegal(false)} tarifa={tarifa} />
      <HojaPrivacidad abierta={privacidad} alCerrar={() => setPrivacidad(false)} />
    </div>
  );
}