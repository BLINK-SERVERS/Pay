# Blink Pay

Cartera del pasajero para consultar, vincular, recargar y transferir el saldo de
la tarjeta de transporte de **Blink**. React 19 + Vite 8 + TypeScript estricto.

- **Destino:** https://pay.blink.com.ve — *pendiente de publicar* (ver «Despliegue»)
- **Publicación actual:** https://blink-servers.github.io/TARJETA/
- **Redirección legacy:** https://pasajes.blink.com.ve/ → este portal
- **Comercio:** https://www.blink.com.ve/
- **Versión:** 2.1.0 · [CHANGELOG](CHANGELOG.md)

Este repositorio nació como **Blink Tarjeta** y conserva íntegro su historial,
su esquema de datos y sus flujos. Desde `QODER-BLINK-HIG-2026` el producto se
llama **Blink Pay** y reúne toda la tarjeta en una sola cartera.

## Qué hace

- Registro de cuenta con cédula, teléfono, correo, PIN de 6 dígitos y fuente de
  Pago Móvil (propia o de un familiar).
- Billetera con **varias tarjetas** por cuenta, vinculadas por el serial del reverso.
- Saldo, movimientos, tarjeta virtual con giro 3D y código de barras Code 128.
- Recarga reportada por Pago Móvil con comprobante en revisión.
- **Transferencia de saldo entre tarjetas** de la misma cuenta o de otra
  persona, con PIN del titular, tope por operación y por día, y comprobante con
  número de referencia. La disponibilidad se acota a lo que el chip también
  puede descontar, para no dejar el plástico sin saldo (BLINK-DOC-26).
- Cambio de PIN y de datos de pago.
- **Acceso con huella o rostro** en teléfonos compatibles: desbloquea la sesión
  guardada de 12 horas sin escribir la cédula ni el PIN (WebAuthn). El PIN sigue
  siendo la llave de respaldo y el único medio para entrar en un teléfono nuevo.
- **Aviso de versión nueva** cuando el portal instalado detecta una publicación:
  «Ahora no» o «Actualizar», sin recargar en medio de una operación.
- **Interfaz nativa estilo Apple**: en el teléfono toma el aspecto de iOS
  (título grande, tarjeta tipo Wallet, hojas inferiores y barra de pestañas
  translúcida); en la computadora, el de macOS (barra lateral, barra unificada
  e inspector). Iconografía SF Symbols a través de `BlinkSymbol`, tipografía del
  sistema, cifras tabulares y modo claro/oscuro automático.
- Apertura sin conexión con la última tarjeta sincronizada.

Sin variables de entorno la app funciona en **modo demostración** con datos
locales (`V-12345678` / PIN `194628`). Con variables, usa la base real.

## Simular el flujo completo

La carpeta `simulacion/` levanta PostgreSQL 16 + PostgREST + un gateway nginx y
ejecuta el ciclo completo (lote → enrolado → registro → recarga → aprobación →
chip → cobro) sin tocar producción:

```bash
cd simulacion
./arrancar.sh     # backend local en 127.0.0.1:54321
./flujo.sh        # ciclo completo con aserciones
./portal.sh       # portal en http://127.0.0.1:5175
./backoffice.sh   # panel en http://127.0.0.1:5173
./detener.sh      # apaga y borra la base efímera
```

## Usar en el celular y sin conexión

El portal es instalable y guarda la última tarjeta vista para abrirla sin
datos:

1. Abre el portal con internet e inicia sesión una vez. Eso guarda en ese
   teléfono la tarjeta, el saldo y los movimientos.
2. Instálalo: en Android/Chrome, menú **⋮ → Instalar aplicación** (o
   **Añadir a pantalla de inicio**); en iPhone/Safari, **Compartir →
   Añadir a pantalla de inicio**.
3. Ábrelo desde el icono **Blink Pay**. A partir de ahí funciona en modo avión:
   muestra la tarjeta y el último saldo sincronizado.
4. Sin red no se puede recargar, transferir, vincular otra tarjeta ni cambiar
   PIN o datos de pago; la sesión guardada dura 12 horas y el saldo es el de la
   última sincronización. La copia local caduca a las 12 horas de la última vez
   que hubo red y se borra al cerrar sesión. Abre el portal una vez con
   internet para recibir actualizaciones: si hay una versión nueva aparece el
   aviso **Actualización disponible** y tú decides cuándo aplicarla.
5. Tras el primer acceso, el portal ofrece **activar el acceso con huella o
   rostro**; también se activa o desactiva en **Perfil › Seguridad**. La
   biometría desbloquea la sesión guardada, no sustituye al PIN, y se desactiva
   al cerrar sesión: la credencial queda en el teléfono y se vuelve a enlazar
   con el siguiente acceso por PIN.

No borres los datos del sitio: se lleva el armazón offline y la copia de la
tarjeta.

## Puesta en marcha

```bash
npm ci
npm run dev        # http://localhost:5175
npm run typecheck
npm test
npm run verificar:hig   # capturas y comprobaciones HIG en Chromium
npm run verificar:movimiento  # cascada NFC y reensamblado del isotipo
npm run build
npm run lote       # genera un lote de seriales y la hoja de impresión
```

Variables para conectar la nube (en `.env.local`, nunca en git):

```dotenv
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<clave publishable>
```

## Estructura

```text
src/
  pages/            Acceso, Inicio, Movimientos, Recargar, Transferir, Perfil
  components/       TarjetaVirtual, HojaVincular, PinEntrada, BarraTabs…
    MarcaPay        logotipo Blink Pay incrustado como SVG (hereda el color)
    PayLoader       restauración de sesión con las ondas NFC animadas
    ui/BlinkSymbol  adaptador único de SF Symbols (4 variantes y animaciones)
  assets/           marca-blink-pay.svg → fuente del logotipo incrustado
  lib/
    repo.ts         elige nube o local
    nube.ts         cliente de los RPC bt_*
    local.ts        espejo local del mismo contrato
    dominio.ts      validaciones de cédula, teléfono, serial, montos
  styles/           tokens, base y BEM de la app (tarjeta con cqw)
marca/              SVG fuente de la marca (logotipo, isotipo, iconos, tarjeta)
public/brand/       los SVG de marca que usa la interfaz
supabase/migrations/ 0001…0023 (esquema compartido del ecosistema)
scripts/lote.ts      generador de lotes y hoja imprimible
scripts/verificar-hig.mjs  verificación visual y estructural HIG (Playwright)
scripts/verificar-movimiento.mjs  claves y tiempos de los dos cargadores
simulacion/          pila Docker, semilla y flujo completo
```

## Despliegue

Cada push a `main` dispara `.github/workflows/pages.yml`: `typecheck` → `test` →
`build` → GitHub Pages. Si falla un paso, no se publica.

El dominio **pay.blink.com.ve** aún no está configurado: falta el token de
Cloudflare y el registro DNS. Mientras tanto la publicación vive en
`https://blink-servers.github.io/TARJETA/` y el `base` del build sigue siendo
`/TARJETA/`; al activar el dominio hay que pasar `base` a `/`, añadir el CNAME
y ajustar la redirección legacy.

## Documentación

| Documento | Contenido |
| --- | --- |
| [docs/documento-maestro-estetica.md](docs/documento-maestro-estetica.md) | **Documento maestro de estética Blink**: marca, color, tipografía, materiales, movimiento, accesibilidad y activos. |
| [../POS/docs/HIG/](../POS/docs/HIG/) | Corpus local de la Human Interface Guidelines de Apple (Apple Pay, iconos, materiales, tipografía…). |
| [../POS/docs/DESIGN_IOS27_KIT.md](../POS/docs/DESIGN_IOS27_KIT.md) | Tokens y métricas extraídos del UI Kit de iOS 27. |
| [../POS/docs/ios27-geometry.json](../POS/docs/ios27-geometry.json) | Geometría y estilos del kit en JSON. |
| [CHANGELOG.md](CHANGELOG.md) | Historial de cambios (incluye la etapa como Blink Tarjeta). |

## Base de datos compartida

Blink Pay, el BACKOFFICE y Blink POS usan el mismo proyecto de Supabase.
El esquema de transporte vive en `supabase/migrations/` dentro de este
repositorio y es la **fuente de verdad**; cualquier cambio debe probarse contra
las aplicaciones que lo consumen antes de publicarse.
