import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

const FUENTE = readFileSync(
  fileURLToPath(new URL("../../public/sw.js", import.meta.url)),
  "utf8"
);

const ORIGEN = "https://pay.blink.com.ve";
const INDICE = `${ORIGEN}/index.html`;

interface Respuesta {
  ok: boolean;
  status: number;
  type: string;
  url: string;
  text: () => Promise<string>;
}

function responder(url: string, cuerpo = "", ok = true): Respuesta {
  return {
    ok,
    status: ok ? 200 : 404,
    type: "basic",
    url,
    text: async () => cuerpo,
  };
}

const HTML_NUEVO = `<!doctype html><html><head>
<link rel="modulepreload" href="/assets/rol-XYZ.js">
<link rel="stylesheet" href="/assets/hoja-123.css">
</head><body><div id="root"></div>
<script type="module" src="/assets/arranque-ABC.js"></script>
</body></html>`;

const HTML_MEZCLADO = `<!doctype html><html><head>
<link rel="stylesheet" href="/rpc/bt_ajustes">
<script src="https://cdn.ejemplo.com/rastreo.js"></script>
<link rel="preconnect" href="https://p.ejemplo.com">
</head><body><div id="root"></div>
<script type="module" src="/assets/arranque-ABC.js"></script>
</body></html>`;

function montar(fetchImpl: (url: string, opciones?: unknown) => Promise<Respuesta>) {
  const manejadores = new Map<string, (evento: never) => void>();
  const guardadas = new Map<string, Respuesta>();
  const self = {
    location: new URL(`${ORIGEN}/sw.js`),
    registration: { scope: `${ORIGEN}/` },
    addEventListener: (tipo: string, manejo: (evento: never) => void) => {
      manejadores.set(tipo, manejo);
    },
    clients: { claim: vi.fn(async () => {}) },
    skipWaiting: vi.fn(async () => {}),
  };
  const caché = {
    put: async (url: string, respuesta: Respuesta) => {
      guardadas.set(url, respuesta);
    },
    match: async (url: string) => guardadas.get(url),
    keys: async () => [...guardadas.keys()],
  };
  const caches = {
    open: async () => caché,
    keys: async () => [...guardadas.keys()],
    delete: async (clave: string) => {
      guardadas.delete(clave);
      return true;
    },
  };

  // `sw.js` es un script clásico de worker: se evalúa con el entorno mínimo
  // que el navegador le daría, para poder manejar sus eventos desde el test.
  new Function("self", "caches", "fetch", "Response", FUENTE)(
    self,
    caches,
    fetchImpl,
    { error: () => responder(`${ORIGEN}/roto`, "", false) }
  );

  return {
    guardadas,
    async instalar() {
      let esperado: Promise<void> | null = null;
      const evento = {
        waitUntil: (promesa: Promise<void>) => {
          esperado = promesa;
        },
      };
      manejadores.get("install")?.(evento as never);
      await esperado;
    },
  };
}

describe("instalación del service worker", () => {
  it("no aborta cuando un archivo del armazón responde 404", async () => {
    const worker = montar(async (url) =>
      url.endsWith(".svg") ? responder(url, "", false) : responder(url, url.endsWith("index.html") ? HTML_NUEVO : "")
    );

    // `cache.addAll` era todo o nada: con este 404 la instalación fallaba, el
    // worker no quedaba en espera y el aviso de actualización desaparecía.
    await expect(worker.instalar()).resolves.toBeUndefined();

    expect(worker.guardadas.has(INDICE)).toBe(true);
    expect(worker.guardadas.has(`${ORIGEN}/manifest.webmanifest`)).toBe(true);
    expect(worker.guardadas.has(`${ORIGEN}/qr-portal.svg`)).toBe(false);
  });

  it("guarda los chunks con hash que referencia el index nuevo", async () => {
    const worker = montar(async (url) =>
      responder(url, url === INDICE ? HTML_NUEVO : "")
    );

    await worker.instalar();

    // Sin estos tres, «Actualizar» y quedarse sin red dejaba un index.html que
    // pedía un JS inexistente: la app arrancaba en blanco.
    expect(worker.guardadas.has(`${ORIGEN}/assets/arranque-ABC.js`)).toBe(true);
    expect(worker.guardadas.has(`${ORIGEN}/assets/rol-XYZ.js`)).toBe(true);
    expect(worker.guardadas.has(`${ORIGEN}/assets/hoja-123.css`)).toBe(true);
  });

  it("no guarda lo que no es estático del propio origen", async () => {
    const urls: string[] = [];
    const worker = montar(async (url) => {
      urls.push(url);
      return responder(url, url === INDICE ? HTML_MEZCLADO : "");
    });

    await worker.instalar();

    // Cachear el RPC firmaría una respuesta de API; el script de otro origen
    // nunca debería pasar por aquí. El chunk propio, en cambio, sí.
    expect(urls.some((url) => url.includes("/rpc/"))).toBe(false);
    expect(urls.some((url) => url.includes("ejemplo.com"))).toBe(false);
    expect(worker.guardadas.has(`${ORIGEN}/assets/arranque-ABC.js`)).toBe(true);
    expect(urls.some((url) => url.startsWith(ORIGEN))).toBe(true);
  });

  it("baja los chunks de carga perezosa que solo enumera el propio arranque", async () => {
    // Vite no escribe en el index las pestañas que se cargan al navegar:
    // viven como cadenas dentro del chunk de arranque. Sin recorrer ese grafo,
    // «Actualizar» con la red cortada dejaba la ruta sin su JS y sin su hoja.
    const arranque =
      'const deps=["assets/hoja-123.css","assets/Pagina-AAA.js","assets/Pagina-BBB.css","assets/Rota-CCC.js"];export{deps};';
    const worker = montar(async (url) => {
      if (url.endsWith("index.html")) return responder(url, HTML_NUEVO);
      if (url.endsWith("arranque-ABC.js")) return responder(url, arranque);
      if (url.endsWith("Rota-CCC.js")) return responder(url, "", false);
      return responder(url, "");
    });

    await worker.instalar();

    expect(worker.guardadas.has(`${ORIGEN}/assets/Pagina-AAA.js`)).toBe(true);
    expect(worker.guardadas.has(`${ORIGEN}/assets/Pagina-BBB.css`)).toBe(true);
    // Una ruta del grafo que ya no existe no puede tumbar la instalación.
    expect(worker.guardadas.has(`${ORIGEN}/assets/Rota-CCC.js`)).toBe(false);
  });

  it("termina aunque la red falle en todo", async () => {
    const worker = montar(async () => {
      throw new TypeError("sin red");
    });

    await expect(worker.instalar()).resolves.toBeUndefined();
    expect(worker.guardadas.size).toBe(0);
  });
});
