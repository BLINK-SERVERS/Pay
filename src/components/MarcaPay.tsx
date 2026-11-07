import marca from "../assets/marca-blink-pay.svg?raw";

/** Marca «Blink Pay» como SVG incrustado: hereda el color del texto y cambia con la apariencia. */
export function MarcaPay({ className = "" }: { className?: string }) {
  return (
    <span
      className={`marca ${className}`.trim()}
      role="img"
      aria-label="Blink Pay"
      dangerouslySetInnerHTML={{ __html: marca }}
    />
  );
}
