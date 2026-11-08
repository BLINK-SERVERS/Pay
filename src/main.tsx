import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { prepararActualizaciones } from "./lib/actualizacion";
import { prepararInstalacion } from "./lib/instalacion";

import "./styles/fonts.css";
import "./styles/base.css";
import "./styles/tokens.css";
import "./styles/app.css";

const el = document.getElementById("root");
if (!el) throw new Error("No se encontró #root");

// Antes de montar React: si el navegador ofrece instalar la app, el aviso
// propio la intercepta para que no aparezca el cartel de Chrome.
prepararInstalacion();

createRoot(el).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// El service worker guarda el armazón y los recursos del portal para que las
// siguientes visitas abran sin red. También vigila si hay una versión nueva y
// avisa dentro de la app, sin recargarla hasta que el pasajero lo confirme.
prepararActualizaciones();
