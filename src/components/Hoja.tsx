import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon";

interface Props {
  abierta: boolean;
  alCerrar: () => void;
  titulo: string;
  descripcion?: string;
  children: ReactNode;
  pie?: ReactNode;
}

interface Capa {
  fondo: HTMLDivElement;
  panel: HTMLDivElement;
  origen: HTMLElement | null;
}

// Una pila compartida: cerrar una hoja anidada no desbloquea la página ni
// devuelve el foco detrás de la hoja que sigue abierta.
const capas: Capa[] = [];
const inertes = new Map<Element, string | null>();
let overflowPrevio = "";
let prioridadOverflow = "";
let observarFondo: MutationObserver | null = null;

function restaurarInert(elemento: Element, valor: string | null) {
  if (valor === null) elemento.removeAttribute("inert");
  else elemento.setAttribute("inert", valor);
}

function sincronizarFondo() {
  const superior = capas.at(-1)?.fondo;
  for (const [elemento, previo] of inertes) {
    if (!superior || elemento === superior || !elemento.isConnected) {
      restaurarInert(elemento, previo);
      inertes.delete(elemento);
    }
  }
  if (!superior) return;
  for (const elemento of document.body.children) {
    if (elemento === superior || elemento.matches("script, style, link")) continue;
    if (!inertes.has(elemento)) inertes.set(elemento, elemento.getAttribute("inert"));
    elemento.setAttribute("inert", "");
  }
  // El orden visual sigue al orden de apertura, no al orden de los portales.
  capas.forEach((capa, indice) => { capa.fondo.style.zIndex = String(60 + indice); });
}

function enfocable(elemento: HTMLElement): boolean {
  return elemento.isConnected && !elemento.closest('[inert], [hidden], [aria-hidden="true"]') &&
    !elemento.matches(":disabled") && elemento.getClientRects().length > 0 &&
    getComputedStyle(elemento).visibility !== "hidden";
}

function registrar(capa: Capa) {
  if (capas.length === 0) {
    overflowPrevio = document.body.style.getPropertyValue("overflow");
    prioridadOverflow = document.body.style.getPropertyPriority("overflow");
    document.body.style.setProperty("overflow", "hidden");
    observarFondo = new MutationObserver(sincronizarFondo);
    observarFondo.observe(document.body, { childList: true });
  }
  capas.push(capa);
  sincronizarFondo();
  capa.panel.focus({ preventScroll: true });

  return () => {
    const eraSuperior = capas.at(-1) === capa;
    const indice = capas.indexOf(capa);
    if (indice === -1) return;
    capas.splice(indice, 1);
    // Si desaparece una hoja padre antes que su hija, conserva el disparador
    // original para no intentar enfocar luego un nodo desmontado.
    capas.forEach((otra) => {
      if (otra.origen && capa.fondo.contains(otra.origen)) otra.origen = capa.origen;
    });
    sincronizarFondo();
    if (capas.length === 0) {
      observarFondo?.disconnect();
      observarFondo = null;
      document.body.style.setProperty("overflow", overflowPrevio, prioridadOverflow);
    }
    if (!eraSuperior) return;
    const superior = capas.at(-1);
    const origen = capa.origen;
    if (origen && enfocable(origen) && (!superior || superior.panel.contains(origen))) {
      origen.focus({ preventScroll: true });
    } else {
      superior?.panel.focus({ preventScroll: true });
    }
  };
}

/** Hoja modal con foco contenido y presencia durante toda la transición. */
export function Hoja({ abierta, alCerrar, titulo, descripcion, children, pie }: Props) {
  const panel = useRef<HTMLDivElement>(null);
  const fondo = useRef<HTMLDivElement>(null);
  const tituloId = useId();
  const descripcionId = useId();
  const [presente, setPresente] = useState(abierta);
  const actual = useRef({ abierta, alCerrar });
  const contenido = useRef({ titulo, descripcion, children, pie });

  useLayoutEffect(() => {
    actual.current = { abierta, alCerrar };
    if (abierta) {
      contenido.current = { titulo, descripcion, children, pie };
      setPresente(true);
    }
  }, [abierta, alCerrar, titulo, descripcion, children, pie]);

  useLayoutEffect(() => {
    if (!presente || !panel.current || !fondo.current) return;
    const capa: Capa = {
      panel: panel.current,
      fondo: fondo.current,
      origen: document.activeElement instanceof HTMLElement ? document.activeElement : null,
    };
    const retirar = registrar(capa);

    function alTeclear(evento: KeyboardEvent) {
      if (capas.at(-1) !== capa) return;
      if (evento.key === "Escape") {
        evento.preventDefault();
        evento.stopPropagation();
        if (actual.current.abierta) actual.current.alCerrar();
      }
      if (evento.key !== "Tab") return;
      const opciones = [...capa.panel.querySelectorAll<HTMLElement>(
        'a[href], button, input, select, textarea, [tabindex], [contenteditable="true"]'
      )].filter((el) => el.tabIndex >= 0 && enfocable(el));
      const primero = opciones[0];
      const ultimo = opciones.at(-1);
      const foco = document.activeElement;
      if (!primero || !ultimo) {
        evento.preventDefault();
        capa.panel.focus();
      } else if (evento.shiftKey && (foco === primero || foco === capa.panel || !capa.panel.contains(foco))) {
        evento.preventDefault();
        ultimo.focus();
      } else if (!evento.shiftKey && (foco === ultimo || !capa.panel.contains(foco))) {
        evento.preventDefault();
        primero.focus();
      }
    }
    function alEnfocar(evento: FocusEvent) {
      if (capas.at(-1) === capa && !capa.panel.contains(evento.target as Node)) {
        capa.panel.focus({ preventScroll: true });
      }
    }
    document.addEventListener("keydown", alTeclear, true);
    document.addEventListener("focusin", alEnfocar);
    return () => {
      document.removeEventListener("keydown", alTeclear, true);
      document.removeEventListener("focusin", alEnfocar);
      retirar();
    };
  }, [presente]);

  useLayoutEffect(() => {
    if (abierta || !presente) return;
    let cancelada = false;
    // Espera la transición efectiva (también si reduced-motion la elimina),
    // sin un temporizador fijo ni desmontar al empezar el cierre.
    const animaciones = [
      ...(fondo.current?.getAnimations() ?? []),
      ...(panel.current?.getAnimations() ?? []),
    ];
    void Promise.allSettled(animaciones.map((animacion) => animacion.finished)).then(() => {
      if (!cancelada) setPresente(false);
    });
    return () => { cancelada = true; };
  }, [abierta, presente]);

  if (!presente) return null;
  const vista = abierta ? { titulo, descripcion, children, pie } : contenido.current;
  const cerrar = () => { if (actual.current.abierta) actual.current.alCerrar(); };

  return createPortal(
    <div ref={fondo} className={`hoja-fondo${abierta ? "" : " hoja-fondo--saliendo"}`} onClick={cerrar}>
      <div
        ref={panel}
        className="hoja"
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        aria-describedby={vista.descripcion ? descripcionId : undefined}
        tabIndex={-1}
        onClick={(evento) => evento.stopPropagation()}
      >
        <span className="hoja__asa" aria-hidden="true" />
        <header className="hoja__cabecera">
          <div>
            <h2 className="hoja__titulo" id={tituloId}>{vista.titulo}</h2>
            {vista.descripcion && <p className="hoja__descripcion" id={descripcionId}>{vista.descripcion}</p>}
          </div>
          <button type="button" className="boton-icono" onClick={cerrar} aria-label="Cerrar">
            <Icon name="cerrar" />
          </button>
        </header>
        <div className="hoja__cuerpo">{vista.children}</div>
        {vista.pie && <footer className="hoja__pie">{vista.pie}</footer>}
      </div>
    </div>,
    document.body
  );
}
