# Operación y despliegue

| Campo | Valor |
| --- | --- |
| Código | BLINK-DOC-06 |
| Versión | 1.7.0 |
| Fecha | 2026-11-01 |
| Estado | Vigente |
| Norma | ISO/IEC/IEEE 12207 (operación y mantenimiento) |

## 1. Prerrequisitos

| Herramienta | Versión usada | Notas |
| --- | --- | --- |
| Node.js | 22 en CI (24 en el equipo de desarrollo) | `npm ci` para instalaciones reproducibles. |
| npm | 10+ | — |
| GitHub CLI | 2.x | `gh auth login` con acceso a `BLINK-SERVERS`. |
| psql | 16+ | Cliente para migraciones y consultas. |
| arduino-cli | 1.x | Flasheo de firmware ESP32. |
| Docker | 29.x + `docker-compose` v1 | PostgreSQL 16 y la simulación completa (`simulacion/`). |

## 2. Desarrollo local

```bash
# BLINK TARJETA (portal)
cd ~/BLINK/tarjeta
npm ci
npm run dev            # http://localhost:5173 (5175 con simulacion/portal.sh)
npm run typecheck
npm test
npm run build          # dist/

# BLINK BACK-OFFICE
cd ~/BLINK/backoffice
npm ci && npm run dev   # http://localhost:5176 (5173 con simulacion/backoffice.sh)

# BLINK POS
cd ~/BLINK/pos/pos/app
npm ci && npm run dev
```

Todo el material BLINK vive bajo `~/BLINK`; los enlaces simbólicos
`~/BLINK_Tarjeta`, `~/BLINK_Backoffice`, `~/BLINK_POS_Project`,
`~/BLINK_Posajes_Project`, `~/Arduino/BLINK_*` y `~/Documentación` mantienen
compatibles las rutas antiguas (ver `~/BLINK/README.md`).

### 2.1 Simulación local del flujo completo

```bash
cd ~/BLINK/simulacion
./arrancar.sh        # PostgreSQL 16, migraciones, semilla, PostgREST y gateway
./flujo.sh           # prueba el ciclo completo y muestra el resultado
./portal.sh          # portal en http://127.0.0.1:5175
./backoffice.sh      # panel en http://127.0.0.1:5173 (otra terminal)
./detener.sh         # apaga y borra los volúmenes
```

`arrancar.sh` es idempotente: derriba la pila anterior, aplica las migraciones
(salta `0002_demo.sql`), siembra la ruta de prueba y genera las claves JWT
locales en `simulacion/.entorno`. Nada de esto toca Supabase de producción.

Para que TARJETA use la nube en local, crear `.env.local` (nunca se commitea):

```dotenv
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<clave publishable>
```

Sin ese archivo la app arranca en **modo demostración** (datos locales). El
back-office no tiene modo local: sin esas dos variables muestra el aviso
«Falta configurar el servidor» y no deja entrar.

## 3. Despliegue de las aplicaciones

### 3.1 BLINK TARJETA (automático)

```bash
git push origin main
```

El workflow `.github/workflows/pages.yml` ejecuta `npm ci`, `typecheck`, `test` y
`build --base=/TARJETA/`, y publica con `deploy-pages`. Si falla cualquier paso,
no se publica nada.

- Verificación: `gh run list --repo BLINK-SERVERS/TARJETA --limit 3`
- URL: https://blink-servers.github.io/TARJETA/

### 3.2 PASAJES-REDIRECT (automático)

`BLINK-SERVERS/PASAJES-REDIRECT` es un sitio estático con `CNAME`
`pasajes.blink.com.ve`. Cada push a `main` publica en Pages sin compilar:

- `index.html` redirige con `<meta http-equiv="refresh">` y `location.replace()`
  a `https://blink-servers.github.io/TARJETA/`, conservando el ancla.
- `404.html` repite la redirección para rutas antiguas y `.nojekyll` evita el
  procesado de Jekyll.
- Verificación: `gh run list --repo BLINK-SERVERS/PASAJES-REDIRECT --limit 3`
- El repositorio `PASAJES` está archivado; no se publica ni se reintroduce.

### 3.3 BLINK BACK-OFFICE (automático)

Repositorio propio (`BLINK-SERVERS/BACKOFFICE`), mismo código de base y mismo
proyecto Supabase. Compila con la base `/BACKOFFICE/` porque no tiene dominio
propio todavía.

```bash
git push origin main
```

- Workflow `.github/workflows/pages.yml`: `npm ci`, `typecheck`,
  `build --base=/BACKOFFICE/` con las variables `VITE_SUPABASE_URL` y
  `VITE_SUPABASE_ANON_KEY` del repositorio, y `deploy-pages`.
- Verificación: `gh run list --repo BLINK-SERVERS/BACKOFFICE --limit 3`
- URL: https://blink-servers.github.io/BACKOFFICE/
- La primera publicación requiere habilitar Pages:
  `gh api -X POST repos/BLINK-SERVERS/BACKOFFICE/pages -f build_type=workflow`.

### 3.4 BLINK POS (manual)

```bash
cd ~/BLINK/pos/pos/app
npm run deploy         # build:pages + gh-pages -d dist -t
```

Publica en la rama `gh-pages`; Cloudflare sirve `www.blink.com.ve`. El script
`postbuild-pages.mjs` genera `404.html` y `.nojekyll` para rutas profundas.

### 3.5 Rollback de una publicación

| Producto | Procedimiento |
| --- | --- |
| TARJETA / BACKOFFICE | Revertir el commit conflictivo (`git revert`) y empujar; el workflow republica. Alternativa: `gh run rerun <id>` del último run bueno (no cambia el código). |
| PASAJES-REDIRECT | Revertir y empujar. Si el dominio queda sin CNAME, el certificado de GitHub Pages tarda en reemitirse; verificar con `gh api repos/BLINK-SERVERS/PASAJES-REDIRECT/pages`. |
| POS | `npm run deploy` desde un checkout del commit anterior, o `git revert` + nuevo deploy. |

## 4. Dominios y DNS (Cloudflare)

| Registro | Destino | Proxy |
| --- | --- | --- |
| `www` | `blink-servers.github.io` (CNAME) | Proxied (Cloudflare) |
| `pasajes` | `blink-servers.github.io` (CNAME de PASAJES-REDIRECT) | **DNS only** |
| Registros MX/TXT | Proveedor de correo | DNS only |

> `pasajes.blink.com.ve` ya no sirve una aplicación: lo recibe el repositorio
> `PASAJES-REDIRECT`, que lleva a BLINK TARJETA. El CNAME del dominio debe seguir
> apuntando a `blink-servers.github.io`; el repositorio declara el dominio en su
> propio `CNAME`.

> Los CNAME de GitHub Pages **deben ser DNS-only**. Con proxy activo, GitHub no
> puede emitir el certificado y el dominio queda en error. POS es la excepción
> histórica: Pages no tiene HTTPS forzado y Cloudflare termina TLS.

## 5. Trabajo con la base de datos

### 5.1 Conexión

El host directo `db.<ref>.supabase.co` es **IPv6**; desde redes IPv4 usar el pooler:

```bash
psql "host=aws-0-us-east-2.pooler.supabase.com port=5432 \
      user=postgres.<ref> dbname=postgres sslmode=require" \
     -c "select version();"
```

La contraseña se toma del gestor de secretos y se pasa por `PGPASSWORD` en el
entorno del comando. **No se escribe en archivos ni en el historial.** Si la sesión
del panel de Supabase expiró, hay que volver a entrar (GitHub o correo) antes de
aplicar migraciones: el editor SQL es la vía alternativa al pooler.

### 5.2 Aplicar una migración (procedimiento obligatorio)

1. Probar en la simulación local (recomendado; aplica todas las migraciones y
   ejecuta el flujo completo):

   ```bash
   cd ~/BLINK/simulacion && ./arrancar.sh && ./flujo.sh
   ```

   La pila levanta PostgreSQL 16 en `127.0.0.1:54329` y PostgREST detrás del
   gateway `127.0.0.1:54321`. Antes de `0014` el script vacía las tablas de
   tarjetas para que el lote heredado de `0006` no rompa la nueva serie; la
   `0014` usa `-v ON_ERROR_STOP=1` en toda la cadena. Alternativa manual:

   ```bash
   docker run --rm -d --name blink-eco -p 55433:5432 -e POSTGRES_PASSWORD=local postgres:16-alpine
   psql "postgresql://postgres:local@127.0.0.1:55433/postgres" -f supabase/migrations/0001_tarjeta.sql
   # … 0002, 0003, 0004, 0005, 0006, 0007, 0008, 0009, 0010, 0011, 0012, 0013, 0014, 0015, 0016
   ```

2. Ejecutar la migración nueva dentro de una transacción con
   `--single-transaction -v ON_ERROR_STOP=1`.
3. Verificar con el flujo RPC completo usando `SET LOCAL ROLE anon` y terminar en
   `ROLLBACK` para no dejar datos de prueba.
4. Aplicar en producción (siempre en transacción):

   ```bash
   psql "$CADENA" -v ON_ERROR_STOP=1 --single-transaction -f supabase/migrations/000N_x.sql
   ```

   `0006` además archiva y purga los datos de demostración y crea la cuenta
   administradora. El PIN se pasa en la misma sesión, nunca en el archivo:

   ```bash
   PGOPTIONS="-c blink.admin_pin=<PIN>" psql "$CADENA" -v ON_ERROR_STOP=1 \
     --single-transaction -f supabase/migrations/0006_lotes_corporativos.sql
   ```

   Sin `blink.admin_pin` la migración no crea la cuenta y avisa por `NOTICE`.

   Si no hay `psql` (p. ej. el panel de Supabase), se pega el archivo en el
   editor SQL con `select set_config('blink.admin_pin', '<PIN>', false);`
   antepuesto y se elige **Run and enable RLS** cuando el editor advierta de
   operaciones destructivas o de tablas sin RLS. El PIN no se guarda.

5. Confirmar: `select proname from pg_proc where proname like 'bt_%' order by 1;`
   y `select count(*) from public.accounts;` (debe ser coherente).
6. Registrar la migración en BLINK-DOC-03 §2 y en el CHANGELOG.

### 5.3 Consultas de salud

```sql
-- Integridad de la billetera
select count(*) filter (where account_id is not null) as vinculadas,
       count(*) filter (where status = 'ACTIVE')       as activas
  from public.cards;

-- Recargas pendientes de revisión
select count(*) from public.recharges where status = 'pendiente';

-- Sesiones vigentes
select count(*) from public.account_sessions where expira > now();
```

### 5.4 Provisión de lotes y estación de enrolado

**Vía preferida: el back-office.** Abrir
https://blink-servers.github.io/BACKOFFICE/ e iniciar sesión con cédula y PIN de
una cuenta `ADMIN`/`TAQUILLA`. La primera vez el panel pide inscribir el segundo
factor: escanear el QR con Google Authenticator, Authy o 1Password y escribir el
código de 6 dígitos. Sin ese paso el panel no deja crear lotes ni enrolar.

| Pantalla | Uso |
| --- | --- |
| Resumen | Totales de inventario y operación. |
| Lotes | Crear un lote `FABRICANTE`/`ESTACION` y exportar su hoja en CSV. |
| Inventario | Filtrar por lote, serial o estado; exportar. |
| Estación | Conectar el lector (Web Serial), capturar UID y cargar pares en bloque. |
| Entrega | El pasajero reclama el serial desde el portal (`bt_vincular`). |

**Vía SQL (consola o `service_role`), para automatizaciones:**

```sql
-- Fase 1 · pre-generación (todas quedan en FABRICADA)
select public.bt_generar_lote(1000, 'Patrocinante', 23, 1, 'FABRICANTE');

-- Hoja de trabajo de la estación (serial, UID y estado)
select public.bt_estacion_catalogo('<uuid-del-lote>');

-- Carga de pares capturados con el lector USB/ESP32
select public.bt_estacion_enrolar(
  '<uuid-del-lote>',
  '[{"serial":"23-1-000001-9","uid":"0484CC62"},
    {"serial":"23-1-000002-7","uid":"04A1B2C3"}]',
  'operador-01'
);

-- Fase 2 alternativa por SQL · asignación directa a una cuenta existente
select public.bt_estacion_asignar('23-1-000001-9', 'V-34201580', 'taquilla-01');
```

```sql
-- Comprobaciones
select status, count(*) from public.cards group by status order by status;
select evento, canal, count(*) from public.card_events group by 1, 2 order by 1;
select clave, ejecutado, detalle from respaldo.bitacora;
```

### 5.5 Reiniciar el segundo factor de un operador

Si el operador pierde el teléfono o el reloj del dispositivo se desfasa más de un
paso, se reinicia la inscripción (la cuenta vuelve a «MFA pendiente» y el panel
pide inscribir de nuevo):

```sql
update public.accounts
   set totp_secret = null, totp_activo = false, totp_confirmado_at = null
 where cedula_digitos = '<digitos>';
delete from public.account_sessions
 where account_id = (select id from public.accounts where cedula_digitos = '<digitos>');
```

Nunca se documenta ni se comparte un secreto TOTP: si aparece en un chat o en una
captura, se reinicia la inscripción.

La purga de `0006` es reversible: las filas originales quedan en
`respaldo.*_0006`. Para restaurar una tabla concreta, copiarla de vuelta con la
consola SQL (no hay RPC para eso, por diseño).

### 5.6 Ciclo completo de una recarga

El pasajero reporta un Pago Móvil, el operador lo verifica contra el banco y el
validador entrega el dinero al chip en la siguiente sincronización. Cada paso
deja rastro en la base y ninguno se puede saltar.

**Paso 1 — reporte del pasajero.** El portal llama a `bt_recargar_pasajes`
(única RPC de escritura abierta a `anon` para recargas; `bt_recargar` queda
como compatibilidad temporal). El pasajero elige **N pasajes**; el servidor
recotiza con `bt_cotizar_recarga` y la tarifa del plástico. Crea un movimiento
`pendiente` con detalle «Recarga de N pasajes en revisión» y `monto =
acreditado`, y una fila en `recharges` con estado `pendiente`, `amount = bruto`,
`monto_base = N × tarifa` y el desglose contable. El saldo **no** cambia. El
portal solo guarda los **últimos 4 dígitos** de la referencia
(`right(digitos,4)`), porque es lo que el banco muestra en el comprobante.
Rechaza cantidades que no sean enteras o ≥ 1, totales sobre el tope, teléfonos
que no cumplen `^0\d{10}$`, referencias de menos de 4 dígitos, más de 6
reportes en 10 minutos por tarjeta y una referencia repetida en la misma
tarjeta y banco (`bt:duplicada`). El monto a transferir **no se escribe** en
ningún campo.

**Paso 2 — revisión de la bandeja.** En el back-office, menú **Recargas**
(requiere sesión de `ADMIN`/`TAQUILLA` y el segundo factor activo). La pantalla
muestra pendientes, **monto por conciliar** (bruto), **a acreditar**
(`monto_base`) y pasajes, y lista del reporte más antiguo al más reciente:
fecha de reporte, serial con titular y cédula, pasajes × tarifa, monto
transferido con la línea «acredita», banco con los últimos 4 dígitos de la
referencia, teléfono emisor y saldo actual de la tarjeta. Se aprueba **solo** si coinciden monto, banco, teléfono emisor y
los últimos 4 dígitos de la referencia con el estado de cuenta real. Si hay más
de 200 pendientes, la pantalla lo advierte y muestra los 200 más antiguos.

**Paso 3 — resolución.** Nunca se actualiza `recharges` a mano: la RPC mantiene
consistentes el saldo virtual y el movimiento. En la misma pantalla, `Aprobar`
abre una confirmación que recuerda que la operación es irreversible; `Rechazar`
pide el motivo del rechazo (obligatorio) y no toca el saldo. El servidor bloquea
la fila antes de resolver, así que dos operadores no pueden aplicar la misma
recarga: el segundo recibe «Esa recarga ya fue resuelta».

Las RPC subyacentes siguen existiendo para el SQL Editor del panel de Supabase
(rol propietario; están cerradas a `anon`) como vía de emergencia:

```sql
-- Bandeja cruda
select jsonb_pretty(public.bt_recargas_pendientes(50));

-- Aprobar: devuelve {"ok": true, "saldo": <nuevo saldo>}
select public.bt_aprobar_recarga('<uuid>', 'Nombre del operador');

-- Rechazar: deja el movimiento rechazado y no toca el saldo
select public.bt_rechazar_recarga('<uuid>', 'Nombre del operador', 'Motivo');
```

`bt_aprobar_recarga` suma `coalesce(monto_base, amount)` a
`cards.virtual_balance`, marca el movimiento como `aprobado` con
`saldo_despues` (y su importe igual al crédito), y deja
`recharges.status = 'aprobado'`,
`resolved_at` y `resolved_by`. Falla si la recarga no existe o ya fue resuelta.
**Aprobar es irreversible**: no hay «desaprobar»; una equivocación se corrige
con un ajuste manual supervisado. `bt_rechazar_recarga` marca el movimiento como
`rechazado` y conserva la fila para auditoría.

**Paso 4 — entrega al chip.** La sincronización del validador
(`bt_validador_sincronizar_token`) devuelve en `pendientes` las recargas con
`status = 'aprobado'`, `synced_to_chip = false`, tarjeta `ACTIVE` y `chip_uid`
presente, con `id`, `serial`, `uid` y `monto` = `coalesce(monto_base, amount)`
(desde `0020`; antes enviaba el bruto). El ESP32 las guarda en NVS y, al
apoyar esa tarjeta, incrementa el bloque de valor del chip e imprime
`RECARGA_APLICADA,serial=…,monto=…,id=…`; la pantalla muestra la tarjeta con el
saldo nuevo. En el siguiente envío el equipo reporta el `id` en `p_recargas` y la
base marca `synced_to_chip = true` y `synced_at`.

Ritmo: el validador sincroniza al arrancar, cada minuto si tiene cola y cada
5 minutos sin ella. En la consola serie, `SYNC,…,pendientes=N` cuenta las
recargas **recién descargadas**; `INFO,…,pendientes=N` cuenta los toques
**pendientes de subir**; `LIMPIAR_RECARGAS` solo se usa si la cola de recargas
quedó corrupta (no borra recargas aprobadas en la nube).

**Paso 5 — verificación.** Tres consultas cubren el ciclo:

```sql
-- Estado de la recarga y entrega al chip
select r.id, r.status, r.amount, r.synced_to_chip, r.synced_at
  from public.recharges r
 order by r.created_at desc
 limit 10;

-- Saldo virtual acreditado
select visible_id, virtual_balance
  from public.cards
 where visible_id = '<serial>';

-- Contadores de operación: pendientes por aprobar y aprobadas sin bajar al chip
select public.bt_resumen_operativo();
```

En el portal, el pasajero ve el movimiento pasar de «Pago Móvil en revisión» a
«Pago Móvil aprobado» y el saldo actualizado al refrescar. El ciclo está cerrado
cuando `synced_to_chip = true`; mientras siga en `false`, el dinero está en la
nube pero todavía no en el plástico.

### 5.7 Simulación del flujo completo

La carpeta `~/BLINK/simulacion` (enlace `tarjeta/simulacion`) reproduce el
contrato RPC completo sin tocar producción. Piezas:

| Servicio | Imagen | Puerto local | Papel |
| --- | --- | --- | --- |
| `db` | `postgres:16-alpine` | `127.0.0.1:54329` | PostgreSQL efímero (`tmpfs`); pierde los datos al bajar. |
| `rest` | `postgrest/postgrest:v12.2.3` | interno 3000 | Expone el esquema `public` como `anon`. |
| `api` | `nginx:alpine` | `127.0.0.1:54321` | Gateway que reescribe `/rest/v1/` (la ruta que espera el portal). |

Procedimiento:

```bash
cd ~/BLINK/simulacion
./arrancar.sh          # pila + migraciones + semilla + claves JWT locales
./flujo.sh             # ciclo completo con aserciones
./portal.sh            # http://127.0.0.1:5175  (terminal 1)
./backoffice.sh        # http://127.0.0.1:5173  (terminal 2)
./detener.sh           # baja la pila y borra volúmenes
```

`./flujo.sh --continuar` evita reiniciar la base si acabas de ejecutar
`./arrancar.sh`. El flujo **no es idempotente**: si ya corrió sobre esa pila,
vuelve a ejecutar `./flujo.sh` sin argumentos para recrear el lote y las
cuentas. La semilla crea la ruta
«Ruta Simulación» (tarifa 500 / estudiante 250), el vehículo `SIM001` y la cuenta
administradora `V-34201580` / PIN `258036`. El script `flujo.mjs` recorre:

1. `bt_generar_lote(2, …)` y `bt_estacion_enrolar` con dos UID de prueba.
2. `bt_registrar`, `bt_vincular` y consulta de billetera como `anon`.
3. `bt_recargar_pasajes` con 2 pasajes (bruto 1.060, base 1.000) y aparición en
   `bt_recargas_pendientes`.
4. `bt_aprobar_recarga` → saldo 1.000; `bt_validador_emitir_token` y sincronización.
5. Aplicación al chip de `monto_base` 1.000 (`RECARGA_APLICADA`) y cobro de Bs 500.
6. Verificación de saldo 500, `synced_to_chip = true`, desglose contable y
   movimientos.
7. Rechazo de una recarga de 1 pasaje y comprobación de referencia duplicada
   (`bt:duplicada`).

Las claves JWT se generan con un secreto fijo de desarrollo
(`blink-simulacion-local-no-usar-en-produccion`) y se escriben en
`simulacion/.entorno`, que está en `.gitignore`. **Nunca** se usan contra
Supabase.

## 6. Firmware
| Sketch | Ruta | Función |
| --- | --- | --- |
| `BLINK_Lector` | `~/BLINK/firmware/lector/BLINK_Lector.ino` | Puente serie: `READY,BLINK,1`, `CARD,<UID>`, `PONG` a 115200 baudios. |
| `BLINK_Validador` | `~/BLINK/firmware/validador/BLINK_Validador.ino` | Cobro offline, Wi-Fi, NTP, sincronización HTTPS con token. |

Compilar y flashear:

```bash
arduino-cli compile --fqbn esp32:esp32:esp32 ~/BLINK/firmware/lector
arduino-cli upload  --fqbn esp32:esp32:esp32 -p /dev/ttyUSB0 ~/BLINK/firmware/lector
```

Enrolado manual (consola serie del validador):

```text
ENROLAR,23-1-000001-9,50000,1,3981BF06
```

`serial, saldo inicial, fare_type, UID`. El UID debe coincidir con
`cards.chip_uid` (se registra con `bt_enrolar_tarjeta`).

Los sketches **no están en los repositorios**; viven en `~/BLINK/firmware`
(enlaces desde `~/Arduino`). Trasladarlos a un repositorio es una brecha abierta
(BLINK-DOC-09 R-04).

### 6.1 Configurar el Wi-Fi del validador desde el teléfono (firmware 9)

Hasta el firmware 8 cambiar de red exigía consola serie (`WIFI,ssid,clave`).
Desde el firmware 9 la unidad levanta un punto de acceso temporal con una
página propia; el chofer lo hace desde su teléfono.

| Paso | Qué hace el operador | Qué hace el equipo |
| --- | --- | --- |
| 1 | Enciende el validador. | Sin red guardada, a los 2 s abre la ventana y la pantalla muestra **CONFIGURAR WIFI**, `BLINK-XXXX` y `192.168.4.1`. Con red guardada pero sin enlace, la abre a los 20 s. |
| 2 | En el teléfono, se une a `BLINK-XXXX` (abierta, sin clave). | Levanta el AP y el portal cautivo (`DNSServer` + `WebServer` en 192.168.4.1). |
| 3 | Acepta «sin Internet» si el teléfono avisa y espera la página; si no aparece, abre `192.168.4.1`. | Sirve la página de configuración; cualquier otra ruta redirige a `/`. |
| 4 | Pulsa «Buscar redes» (o escribe el SSID), pone la clave y **Guardar y conectar**. | Guarda en NVS, reaplica `WiFi.begin()`, registra `PORTAL,guardado,red=…` y baja el AP 2,5 s después. |
| 5 | Espera la pantalla **CONECTADA** con IP. | Entra en modo estación, pide hora por NTP y sincroniza. |

Detalles operativos:

- La ventana dura **5 minutos** y no se reabre sola en el mismo arranque: si se
  cierra sin guardar, apagar y encender el equipo.
- Se recuerda **una** red a la vez. La página trae «Olvidar red guardada»
  (equivalente a `OLVIDAR_WIFI`) y «Terminar configuracion» (baja el AP).
- Por consola serie: `CONFIGURAR_WIFI` abre la ventana a pedido y
  `CERRAR_PORTAL` la cierra; el registro del equipo lo confirma con
  `PORTAL,abierto,red=…,ip=…,min=5` / `PORTAL,cerrado`.
- El AP es **abierto** mientras está activo (R-16 en BLINK-DOC-09). No expone
  el token, pero sí permite cambiar la red: no dejarlo abierto en la calle ni
  usarlo como red de trabajo del vehículo.

Prueba en banco (2026-11-01, unidad MAC `1C:60:8B:DF:94:8C`): AP
`BLINK-948C` visible, `/` y `/redes` respondiendo, guardado contra un hotspot
temporal, unión automática en segundos, y tras reiniciar `INFO` con
`red=conectada,ip=10.42.0.89,sync=…` y `SYNC,ok=1`.

## 7. Monitoreo y alertas

| Señal | Dónde |
| --- | --- |
| Estado de despliegues | `gh run list` / pestaña Actions |
| Errores de RPC | logs de PostgREST en el panel de Supabase |
| Recargas pendientes | consulta SQL de §5.3 |
| Validadores sin sincronizar | `trips_telemetry.synced_at` nulo o antiguo |

No hay alertas automáticas configuradas; es una mejora pendiente (BLINK-DOC-09 R-06).

## 8. Copias de seguridad

1. Copia automática diaria del proveedor.
2. Copia lógica semanal:

   ```bash
   pg_dump "$CADENA" --no-owner --format=custom -f blink-$(date +%F).dump
   ```

3. Guardar el dump cifrado en el gestor de respaldos del equipo.
4. Probar una restauración al menos una vez por trimestre en una base nueva.

## 9. Lista de verificación de una publicación

- [ ] `npm run typecheck` y `npm test` en verde.
- [ ] `cd ~/BLINK/simulacion && ./flujo.sh` en verde (si cambió esquema, RPC o
      flujo del portal/panel).
- [ ] Migraciones aplicadas y verificadas (si las hay).
- [ ] CHANGELOG actualizado.
- [ ] Documentos afectados actualizados (BLINK-DOC-03/04/05).
- [ ] Sin secretos en `git diff`.
- [ ] Workflow de Pages en verde y sitio cargando.
- [ ] Flujo crítico probado en producción (registro, vínculo, recarga).
- [ ] Si el cambio toca el panel: login con rol administrativo y segundo factor
      verificado en https://blink-servers.github.io/BACKOFFICE/.
