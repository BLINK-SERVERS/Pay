import marca from "../assets/marca-blink-pay.svg?raw";

/** Solo se monta durante la restauración real de la sesión. */
export function PayLoader() {
  return (
    <div className="pay-loader" role="status" aria-live="polite" aria-busy="true">
      <div
        className="pay-loader__marca"
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: marca }}
      />
      <span className="visualmente-oculto">Abriendo Blink Pay…</span>
    </div>
  );
}
