# BLINK TARJETA

Portal del pasajero para consultar, vincular y recargar la tarjeta de transporte
de **BLINK**. React 19 + Vite 8 + TypeScript estricto.

- **Sitio publicado:** https://blink-servers.github.io/TARJETA/
- **Panel administrativo:** https://blink-servers.github.io/BACKOFFICE/
- **Redirección legacy:** https://pasajes.blink.com.ve/ → este portal
- **Comercio:** https://www.blink.com.ve/
- **Versión:** 1.9.0 · [CHANGELOG](CHANGELOG.md)

## Qué hace

- Registro de cuenta con cédula, teléfono, correo, PIN de 6 dígitos y fuente de
  Pago Móvil (propia o de un familiar).
- Billetera con **varias tarjetas** por cuenta, vinculadas por el serial del reverso.
- Saldo, movimientos, tarjeta virtual con giro 3D y código de barras Code 128.
- Recarga reportada por Pago Móvil con comprobante en revisión.
- Cambio de PIN y de datos de pago.
- **Acceso con huella o rostro** en teléfonos compatibles: desbloquea la sesión
  guardada de 12 horas sin escribir la cédula ni el PIN (WebAuthn). El PIN sigue
  siendo la llave de respaldo y el único medio para entrar en un teléfono nuevo.
- **Aviso de versión nueva** cuando el portal instalado detecta una publicación:
  «Ahora no» o «Actualizar», sin recargar en medio de una operación.
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

Los detalles están en [docs/06 §5.7](../docs/06-operacion-y-despliegue.md).

## Usar en el celular y sin conexión

El portal es instalable y guarda la última tarjeta vista para abrirla sin
datos:

1. Abre <https://blink-servers.github.io/TARJETA/> con internet e inicia
   sesión una vez. Eso guarda en ese teléfono la tarjeta, el saldo y los
   movimientos.
2. Instálalo: en Android/Chrome, menú **⋮ → Instalar aplicación** (o
   **Añadir a pantalla de inicio**); en iPhone/Safari, **Compartir →
   Añadir a pantalla de inicio**.
3. Ábrelo desde el icono **BLINK**. A partir de ahí funciona en modo avión:
   muestra la tarjeta y el último saldo sincronizado.
4. Sin red no se puede recargar, vincular otra tarjeta ni cambiar PIN o datos
   de pago; la sesión guardada dura 12 horas y el saldo es el de la última
   sincronización. La copia local caduca a las 12 horas de la última vez que
   hubo red y se borra al cerrar sesión. Abre el portal una vez con internet
   para recibir actualizaciones: si hay una versión nueva aparece el aviso
   **Actualización disponible** y tú decides cuándo aplicarla (ver
   [BLINK-DOC-24](../docs/24-aviso-actualizacion-portal.md)).
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
npm run dev        # http://localhost:5173
npm run typecheck
npm test           # 100 pruebas
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
  pages/            Acceso, Inicio, Movimientos, Recargar, Perfil
  components/       TarjetaVirtual, HojaVincular, PinEntrada, BarraTabs…
  lib/
    repo.ts         elige nube o local
    nube.ts         cliente de los RPC bt_*
    local.ts        espejo local del mismo contrato
    dominio.ts      validaciones de cédula, teléfono, serial, montos
  styles/           tokens, base y BEM de la app (tarjeta con cqw)
supabase/migrations/ 0001…0020 (esquema compartido del ecosistema)
scripts/lote.ts      generador de lotes y hoja imprimible
simulacion/          pila Docker, semilla y flujo completo
../docs/             suite ISO y documentación central del ecosistema
```

## Despliegue

Cada push a `main` dispara `.github/workflows/pages.yml`: `typecheck` → `test` →
`build --base=/TARJETA/` → GitHub Pages. Si falla un paso, no se publica.

## Documentación

| Documento | Contenido |
| --- | --- |
| [docs/README.md](../docs/README.md) | Índice y control documental (ISO 9001 / 12207). |
| [docs/02-arquitectura.md](../docs/02-arquitectura.md) | Componentes, flujos y decisiones. |
| [docs/03-modelo-de-datos.md](../docs/03-modelo-de-datos.md) | Tablas, migraciones y reglas. |
| [docs/04-api-rpc.md](../docs/04-api-rpc.md) | Contrato de las funciones RPC. |
| [docs/06-operacion-y-despliegue.md](../docs/06-operacion-y-despliegue.md) | Despliegue, DNS, base de datos, simulación y firmware. |
| [docs/07-pruebas-y-calidad.md](../docs/07-pruebas-y-calidad.md) | Estrategia y resultados. |
| [docs/08-manual-de-usuario.md](../docs/08-manual-de-usuario.md) | Guía del pasajero, chofer y operación. |
| [docs/10-guia-de-retoma.md](../docs/10-guia-de-retoma.md) | Cómo continuar el desarrollo. |
| [docs/12-enrolado-de-lotes.md](../docs/12-enrolado-de-lotes.md) | Producción física de lotes. |
| [docs/23-acceso-biometrico.md](../docs/23-acceso-biometrico.md) | Acceso con huella o rostro (WebAuthn), límites y modelo de amenazas. |

## Base de datos compartida

BLINK TARJETA, BLINK BACK-OFFICE y BLINK POS usan el mismo proyecto de Supabase.
El esquema de transporte vive en `supabase/migrations/` dentro de este
repositorio y es la **fuente de verdad**; cualquier cambio debe probarse contra
las aplicaciones que lo consumen antes de publicarse.
