import { useEffect, useRef, useState } from "react";

/** Cuenta desde el valor anterior hasta el nuevo (para el saldo). */
export function useNumeroAnimado(valor: number, duracion = 720): number {
  const [actual, setActual] = useState(valor);
  const desdeRef = useRef(valor);

  useEffect(() => {
    const desde = desdeRef.current;
    if (desde === valor) return;
    const reducido = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducido) {
      desdeRef.current = valor;
      setActual(valor);
      return;
    }
    let cuadro = 0;
    const inicio = performance.now();
    const paso = (ahora: number) => {
      const t = Math.min(1, (ahora - inicio) / duracion);
      // Curva de desaceleración de iOS.
      const suave = 1 - Math.pow(1 - t, 3);
      const v = desde + (valor - desde) * suave;
      desdeRef.current = v;
      setActual(v);
      if (t < 1) cuadro = requestAnimationFrame(paso);
      else desdeRef.current = valor;
    };
    cuadro = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(cuadro);
  }, [valor, duracion]);

  return actual;
}

/** Estado de red del navegador; se actualiza con los eventos online/offline. */
export function useEnLinea(): boolean {
  const [enLinea, setEnLinea] = useState(() => navigator.onLine);

  useEffect(() => {
    const arriba = () => setEnLinea(true);
    const abajo = () => setEnLinea(false);
    window.addEventListener("online", arriba);
    window.addEventListener("offline", abajo);
    return () => {
      window.removeEventListener("online", arriba);
      window.removeEventListener("offline", abajo);
    };
  }, []);

  return enLinea;
}

export function vibrar(patron: number | number[] = 8) {
  if ("vibrate" in navigator) navigator.vibrate(patron);
}

/** Sigue una consulta de medios (ancho, orientación, contraste…). */
export function useConsultaMedio(consulta: string): boolean {
  const [coincide, setCoincide] = useState(
    () => typeof matchMedia === "function" && matchMedia(consulta).matches
  );

  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const medio = matchMedia(consulta);
    const alCambiar = () => setCoincide(medio.matches);
    alCambiar();
    medio.addEventListener("change", alCambiar);
    return () => medio.removeEventListener("change", alCambiar);
  }, [consulta]);

  return coincide;
}

/** Copia al portapapeles y devuelve la clave copiada durante 1,8 s. */
export function useCopiar(): [string | null, (valor: string, clave: string) => Promise<void>] {
  const [copiado, setCopiado] = useState<string | null>(null);
  const temporizador = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(temporizador.current), []);

  async function copiar(valor: string, clave: string) {
    try {
      await navigator.clipboard.writeText(valor);
      setCopiado(clave);
      vibrar(6);
    } catch {
      setCopiado("error");
    }
    window.clearTimeout(temporizador.current);
    temporizador.current = window.setTimeout(
      () => setCopiado((actual) => (actual === clave || actual === "error" ? null : actual)),
      1800
    );
  }

  return [copiado, copiar];
}
