import type { SVGProps } from "react";

export type IconName =
  | "tarjeta"
  | "inicio"
  | "movimientos"
  | "recargar"
  | "perfil"
  | "check"
  | "check-circulo"
  | "alerta"
  | "ojo"
  | "ojo-tachado"
  | "copiar"
  | "candado"
  | "cerrar"
  | "atras"
  | "adelante"
  | "autobus"
  | "banco"
  | "telefono"
  | "documento"
  | "reloj"
  | "salir"
  | "sol"
  | "luna"
  | "auto"
  | "compartir"
  | "rayo"
  | "escudo"
  | "ayuda"
  | "actualizar"
  | "punto"
  | "mas"
  | "correo"
  | "huella";

const trazos: Record<IconName, React.ReactNode> = {
  tarjeta: (
    <>
      <rect x="2.5" y="5" width="19" height="14" rx="3" />
      <path d="M2.5 10h19" />
      <path d="M6 15h4" />
    </>
  ),
  inicio: (
    <>
      <path d="M3.5 10.4 12 3.6l8.5 6.8" />
      <path d="M5.6 9.2V20h12.8V9.2" />
      <path d="M9.8 20v-5.4h4.4V20" />
    </>
  ),
  movimientos: (
    <>
      <path d="M4 6.5h16" />
      <path d="M4 12h16" />
      <path d="M4 17.5h10" />
    </>
  ),
  recargar: (
    <>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M12 8v8" />
      <path d="M8 12h8" />
    </>
  ),
  mas: (
    <>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </>
  ),
  correo: (
    <>
      <rect x="3" y="5.5" width="18" height="13" rx="3" />
      <path d="m4.5 8 7.5 5.2L19.5 8" />
    </>
  ),
  perfil: (
    <>
      <circle cx="12" cy="8.2" r="3.7" />
      <path d="M4.8 20c.7-3.6 3.6-5.6 7.2-5.6s6.5 2 7.2 5.6" />
    </>
  ),
  check: <path d="M20 6.5 9.5 17 4 11.5" />,
  "check-circulo": (
    <>
      <circle cx="12" cy="12" r="8.8" />
      <path d="m8.2 12.2 2.6 2.6 5-5.2" />
    </>
  ),
  alerta: (
    <>
      <path d="M12 3.5 21.5 20h-19L12 3.5Z" />
      <path d="M12 9.5v4.5" />
      <path d="M12 17.2v.1" />
    </>
  ),
  ojo: (
    <>
      <path d="M2.4 12S6 5.9 12 5.9 21.6 12 21.6 12 18 18.1 12 18.1 2.4 12 2.4 12Z" />
      <circle cx="12" cy="12" r="2.9" />
    </>
  ),
  "ojo-tachado": (
    <>
      <path d="M4.2 7.8C3 9.2 2.4 12 2.4 12S6 18.1 12 18.1c1.5 0 2.8-.4 4-1" />
      <path d="M9.6 6.3A9.9 9.9 0 0 1 12 5.9c6 0 9.6 6.1 9.6 6.1a17 17 0 0 1-2.6 3.2" />
      <path d="M10.1 10.1a2.9 2.9 0 0 0 4 4" />
      <path d="M3.5 3.5 20.5 20.5" />
    </>
  ),
  copiar: (
    <>
      <rect x="8.5" y="8.5" width="11" height="11" rx="2.6" />
      <path d="M15.5 5.6A2.1 2.1 0 0 0 13.4 3.5H6.1A2.6 2.6 0 0 0 3.5 6.1v7.3c0 1.2.9 2.1 2.1 2.1" />
    </>
  ),
  candado: (
    <>
      <rect x="4.8" y="10.5" width="14.4" height="9.8" rx="2.8" />
      <path d="M8.3 10.5V7.9a3.7 3.7 0 0 1 7.4 0v2.6" />
      <path d="M12 14.6v2.2" />
    </>
  ),
  cerrar: (
    <>
      <path d="M6 6l12 12" />
      <path d="M18 6 6 18" />
    </>
  ),
  atras: <path d="M14.5 5 7.5 12l7 7" />,
  adelante: <path d="m9.5 5 7 7-7 7" />,
  autobus: (
    <>
      <rect x="4" y="3.5" width="16" height="14" rx="3" />
      <path d="M4 10h16" />
      <path d="M7.5 20.5v-3" />
      <path d="M16.5 20.5v-3" />
      <path d="M7.8 14h1.2" />
      <path d="M15 14h1.2" />
    </>
  ),
  banco: (
    <>
      <path d="M3.5 9.2 12 4l8.5 5.2" />
      <path d="M5.5 9.8v8.4" />
      <path d="M9.8 9.8v8.4" />
      <path d="M14.2 9.8v8.4" />
      <path d="M18.5 9.8v8.4" />
      <path d="M3.5 20h17" />
    </>
  ),
  telefono: (
    <path d="M7.2 3.9h2.5l1.4 3.7-2 1.3a11.4 11.4 0 0 0 5.9 5.9l1.3-2 3.7 1.4v2.5a2.4 2.4 0 0 1-2.6 2.4C10.8 18.5 5.5 13.2 4.8 6.5a2.4 2.4 0 0 1 2.4-2.6Z" />
  ),
  documento: (
    <>
      <path d="M6 3.5h7.5L19 9v11.5H6z" />
      <path d="M13.3 3.6V9h5.5" />
      <path d="M9 13h6" />
      <path d="M9 16.5h4" />
    </>
  ),
  reloj: (
    <>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M12 7.4V12l3.2 1.9" />
    </>
  ),
  salir: (
    <>
      <path d="M14.5 4.5H6.8A2.3 2.3 0 0 0 4.5 6.8v10.4a2.3 2.3 0 0 0 2.3 2.3h7.7" />
      <path d="M15.8 8.3 19.5 12l-3.7 3.7" />
      <path d="M19.2 12h-8.4" />
    </>
  ),
  sol: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.8v2" />
      <path d="M12 19.2v2" />
      <path d="M4.9 4.9l1.4 1.4" />
      <path d="M17.7 17.7l1.4 1.4" />
      <path d="M2.8 12h2" />
      <path d="M19.2 12h2" />
      <path d="M4.9 19.1l1.4-1.4" />
      <path d="M17.7 6.3l1.4-1.4" />
    </>
  ),
  luna: <path d="M20 14.4A8.6 8.6 0 1 1 9.6 4a6.9 6.9 0 0 0 10.4 10.4Z" />,
  auto: (
    <>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M12 8.2v7.6" />
      <path d="M8.6 11.4a4.8 4.8 0 0 1 6.8 0" />
    </>
  ),
  compartir: (
    <>
      <path d="M12 15.5V3.8" />
      <path d="m8.2 7.6 3.8-3.8 3.8 3.8" />
      <path d="M5.5 13v5.6a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V13" />
    </>
  ),
  rayo: <path d="M13.2 2.8 5.6 13.4h5.2l-.9 7.8 7.6-10.6h-5.2z" />,
  escudo: (
    <>
      <path d="M12 3.2 19 5.8v5.4c0 4.1-2.8 7.5-7 9.6-4.2-2.1-7-5.5-7-9.6V5.8z" />
      <path d="m9 11.8 2.2 2.2 4-4.2" />
    </>
  ),
  ayuda: (
    <>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M9.6 9.4a2.5 2.5 0 1 1 3.4 2.3c-.7.3-1 .9-1 1.6v.4" />
      <path d="M12 17.2v.1" />
    </>
  ),
  actualizar: (
    <>
      <path d="M20.4 12a8.4 8.4 0 1 1-2.6-6.1" />
      <path d="M20.4 4v5h-5" />
    </>
  ),
  punto: <circle cx="12" cy="12" r="3.4" fill="currentColor" stroke="none" />,
  huella: (
    <>
      <path d="M12 3.7a8.3 8.3 0 0 1 8.3 8.3" />
      <path d="M3.7 12A8.3 8.3 0 0 1 8 4.6" />
      <path d="M7.2 19.9A9.4 9.4 0 0 1 6 15.9a6 6 0 0 1 12 0c0 1.4.2 2.7.6 3.9" />
      <path d="M12 9.9a3 3 0 0 1 3 3c0 2.8.6 5.4 1.6 7.7" />
      <path d="M8.9 20.3A12 12 0 0 1 8 15.9a4 4 0 0 1 2-3.4" />
    </>
  ),
};

export function Icon({
  name,
  className = "",
  ...rest
}: { name: IconName; className?: string } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`icon ${className}`.trim()}
      aria-hidden="true"
      {...rest}
    >
      {trazos[name]}
    </svg>
  );
}
