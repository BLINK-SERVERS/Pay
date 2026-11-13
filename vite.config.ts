import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf-8")
) as { version: string };

export default defineConfig({
  base: "/",
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  server: { port: 5175 },
  preview: { port: 4175 },
  build: {
    target: "es2022",
    cssTarget: ["chrome123", "safari17.5", "firefox120", "edge123"],
  },
  test: {
    // El PIN usa PBKDF2 con 150 000 iteraciones (~0,4 s por derivación).
    // Con los 12 archivos corriendo a la vez, una prueba de PIN llegaba a
    // pasarse de los 5 s de sobra y `npm test` salía rojo sin motivo real.
    testTimeout: 25_000,
  },
});
