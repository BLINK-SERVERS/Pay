# Pruebas y calidad

| Campo | Valor |
| --- | --- |
| Código | BLINK-DOC-07 |
| Versión | 1.14.0 |
| Fecha | 2026-11-02 |
| Estado | Vigente |
| Normas | ISO/IEC/IEEE 26513 · ISO/IEC 25010 |

## 1. Estrategia

| Nivel | Herramienta | Alcance |
| --- | --- | --- |
| Unidad | Vitest | Reglas de dominio, formato, PIN, carga del lote, repositorio local. |
| Integración de datos | PostgreSQL 16 en contenedor + `psql` | Migraciones y RPC de punta a punta con `SET LOCAL ROLE anon`. |
| Integración real | Supabase de producción dentro de una transacción con `ROLLBACK` | Contrato RPC real, permisos y RLS. |
| Simulación | `simulacion/flujo.mjs` (pg + fetch) | Ciclo completo contra un backend local: lote, enrolado, registro, reclamo, recarga, aprobación, sincronización y cobro. |
| Sistema (UI) | Navegador Chromium contra el sitio publicado | Registro, vínculo, recarga, perfil. |
| Regresión visual | Medición de `aspect-ratio` y radio en 371/320/280 px | Tarjeta virtual ID-1. |

No hay todavía pruebas E2E automatizadas en CI (Playwright existe solo en POS);
es una brecha declarada (BLINK-DOC-09 D-04). La simulación cubre el contrato de
datos, no la interfaz.

## 2. Suites automatizadas

| Repo | Comando | Resultado 2026-11-01 |
| --- | --- | --- |
| TARJETA | `npm test` | **87 pruebas, 7 archivos, todas en verde** |
| TARJETA | `npm run typecheck` | Sin errores |
| TARJETA | `npm run build` | Sin errores |
| BACKOFFICE | `npm run typecheck` / `npm run build` | Sin errores; bundle principal 254 kB con QR cargado bajo demanda |
| Simulación | `cd simulacion && ./flujo.sh` | Ciclo completo en verde contra PostgreSQL 16 local |
| POS | `npm test` / `npm run qa` | Suite propia; requiere Chromium instalado |

Cobertura funcional de TARJETA por archivo:

| Archivo | Qué prueba |
| --- | --- |
| `src/lib/dominio.test.ts` | Cédulas, teléfonos, correos, montos, seriales. |
| `src/lib/formato.test.ts` | Máscaras de cédula/teléfono, moneda, fechas. |
| `src/lib/local.test.ts` | Registro, entrada, vínculo, recarga y extracto en modo local. |
| `src/lib/lote.test.ts` | Generación de lotes con Luhn y Code 128. |
| `src/lib/codigos.test.ts` | Code 128 de 10 y 11 dígitos: símbolos, cambio de juego C→B y suma de control. |
| `src/lib/offline.test.ts` | Copia local: caducidad, desfase de reloj, formato anterior, JSON corrupto, aislamiento por token y almacenamiento lleno. |
| `src/lib/tarifa.test.ts` | Motor tarifario: tabla exacta de 1 a 20 pasajes, múltiplos de 10, conservación, monotonía, entradas inválidas, tarifa de estudiante y máximo por tope. |

## 3. Pruebas de base de datos (2026-10-29)

Ejecutadas contra PostgreSQL 16 local y repetidas contra producción con
`SET LOCAL ROLE anon` y `ROLLBACK` final (sin dejar datos):

| # | Caso | Resultado |
| --- | --- | --- |
| 1 | Registro con pago propio devuelve token | OK |
| 2 | Billetera recién creada sin tarjetas | OK (0) |
| 3 | Vincular tarjeta activa y sin dueño | OK (1 tarjeta, titular = cuenta) |
| 4 | Extracto de la tarjeta vinculada | OK |
| 5 | Reportar recarga válida | OK (`pendiente`) |
| 6 | Cambiar PIN con el actual correcto | OK |
| 7 | Entrar con el PIN nuevo | OK |
| 8 | Actualizar fuente de pago (familiar) | OK (`Mercantil`) |
| 9 | Vincular la misma tarjeta otra vez | `bt:duplicada` |
| 10 | PIN incorrecto | `{error:"credenciales"}` |
| 11 | Movimientos de una tarjeta ajena | `bt:sin-tarjeta` |
| 12 | Vincular tarjeta bloqueada | `bt:bloqueada` |
| 13 | Cerrar sesión | OK |
| 14 | Usar el token cerrado | `bt:sesion` |

Además se probó en local: PIN triviales rechazados, cédula y correo duplicados,
bloqueo a los 5 fallos, tarjeta vencida, serial con Luhn inválido, tope de recarga,
referencia duplicada y ráfaga de reportes.

### 3.1 Migración 0006 (aprovisionamiento en lote)

Ejecutada sobre una base nueva (`prueba6`, PostgreSQL 16) con `0001`→`0005` y
`0006`, dos veces seguidas para comprobar idempotencia:

| # | Caso | Resultado |
| --- | --- | --- |
| 1 | Purga con archivo previo en `respaldo` | OK (3 tarjetas, 2 recargas) |
| 2 | Segunda ejecución no vuelve a purgar | OK (`bitacora`) |
| 3 | Lote de arranque de 20 tarjetas en `FABRICADA` | OK |
| 4 | Login administrador (cédula + PIN) y billetera vacía | OK, `rol = ADMIN` |
| 5 | Reclamo de `23-1-000001-9` | OK: `ACTIVE`, `asignada_por = portal` |
| 6 | Reclamo repetido | `bt:duplicada` |
| 7 | Enrolar 2 pares con un UID inválido | 1 enrolada, 1 rechazada |
| 8 | UID repetido en otra tarjeta | rechazado |
| 9 | Catálogo del lote | 20 tarjetas |
| 10 | Asignación en taquilla a otra cuenta | OK |
| 11 | Reclamo de tarjeta ajena | `bt:ya-activada` |
| 12 | Resumen operativo | `fabricadas=18`, `asignadas=2` |
| 13 | Pérdida de tarjeta sin dueño | rechazada |
| 14 | Bitácora `card_events` | 3 eventos (asignación portal, enrolamiento, taquilla) |

Permisos verificados con `has_function_privilege`: `anon` solo ejecuta
`bt_entrar`/`bt_vincular`; las funciones de estación, lote y resumen quedan
únicamente en `service_role`.

El caso queda reproducible en `supabase/pruebas/0006_lotes.sql`:

```bash
psql "$CADENA" -v ON_ERROR_STOP=1 -f supabase/pruebas/0006_lotes.sql
```

La prueba corre en una transacción que termina en `ROLLBACK`; el PIN se toma de
`blink.admin_pin` en la sesión.

### 3.2 Migración 0006 aplicada en producción (2026-10-29)

Aplicada desde el editor SQL del panel de Supabase con el PIN administrador
únicamente en la sesión (`select set_config('blink.admin_pin', …, false);`
antepuesto al script; nunca se versiona). El editor pidió confirmación por
operaciones destructivas y por la tabla nueva sin RLS: se eligió **Run and enable
RLS**, por lo que `respaldo.bitacora` queda con RLS activo.

Estado verificado después de aplicar:

| Comprobación | Resultado |
| --- | --- |
| Tarjetas | 20, todas `FABRICADA` y sin dueño |
| Cuentas | 1 (`Diego Beleño`, `V-34201580`, `04246603660`, `belenodiego0702@gmail.com`, `rol = ADMIN`) |
| Lote de arranque | 1, `origen = FABRICANTE` |
| `respaldo.bitacora` | 1 fila (purga ejecutada una sola vez) |
| `card_events` | 0 |
| `bt_estacion_enrolar` / `bt_generar_lote(5 args)` | Presentes |
| RLS en `respaldo.bitacora` | Activo |

La prueba de aceptación de §3.1 se repitió contra producción dentro de la misma
transacción con `ROLLBACK`, con un marcador en tabla temporal para confirmar el
final del bloque: devolvió `PRUEBAS_0006_OK`. Tras la prueba, los conteos
siguieron en 20 tarjetas `FABRICADA`, 1 cuenta y 0 eventos, y
`23-1-000001-9` continuó `FABRICADA` sin dueño.

### 3.3 Migración 0007 (back-office con RBAC y TOTP)

Ejecutada sobre una base nueva (PostgreSQL 16) con `0001`→`0007` y repetida
contra producción dentro de una transacción con `ROLLBACK` (marcador
`PRUEBAS_0007_OK`):

| # | Caso | Resultado |
| --- | --- | --- |
| 1 | Base32 de `GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ` | `12345678901234567890` (vector RFC 6238) |
| 2 | TOTP en t=59 s, t=1111111109, t=1111111111 | `287082`, `081804`, `279037` |
| 3 | Código con un paso de desfase | Aceptado (ventana ±1) |
| 4 | Login de un pasajero en el panel | `{error:"permiso"}` |
| 5 | PIN incorrecto | `{error:"credenciales"}`; contador de fallos sube |
| 6 | Primer login de la cuenta administradora | `mfaPendiente=true` |
| 7 | Operar sin segundo factor | `bt:mfa` |
| 8 | Inscribir y activar con código válido | `{ok:true}`, `totp_activo=true` |
| 9 | Activar con código inválido | `{error:"mfa"}` |
| 10 | Login con MFA sin código / con código erróneo / correcto | `mfa` / `mfa` / token |
| 11 | `bt_admin_resumen` con token | Totales coherentes |
| 12 | `bt_admin_lote(FABRICANTE, tarifa 1)` | Lote creado; `creadoPor` = operador |
| 13 | `bt_admin_catalogo` / `bt_admin_enrolar` / `bt_admin_asignar` | Inventario y bitácora correctos |
| 14 | Matriz de privilegios con `has_function_privilege` | `anon` solo ve las 11 RPC de panel; primitivas en 401 |

La respuesta de `bt_admin_entrar` y `bt_admin_estado` se inspeccionó para
comprobar que **no** incluye `totp_secret`.

### 3.4 Migración 0008 (lectura del panel)

| # | Caso | Resultado |
| --- | --- | --- |
| 1 | `bt_admin_lotes` sin token | `bt:sesion` |
| 2 | `bt_admin_lotes` con token | Lote con `enroladas`, `asignadas`, `fabricadas` |
| 3 | `bt_admin_tarjetas` filtrado por estado | 20 `FABRICADA` |
| 4 | `bt_admin_tarjetas` de una tarjeta `FABRICADA` | `titular` y `cedula` en `null` |
| 5 | `bt_admin_tarjetas` tras asignar | Titular y cédula de la cuenta |
| 6 | `p_limite` fuera de rango | Acotado a 200 |

0008 se aplicó dos veces: la primera reveló que las tarjetas `FABRICADA`
mostraban el nombre por defecto `'Titular'` del plástico; se corrigió la función
para devolver `null` cuando `account_id` es nulo y se limpiaron los nombres
heredados.

### 3.5 Migración 0009 (serie de 7 dígitos y tarjeta maestra)

Suite `supabase/pruebas/0009_serie.sql`. Se ejecuta en PostgreSQL local
(`0001`→`0010`) y en producción; todo ocurre dentro de una transacción que
termina en `ROLLBACK` y cierra con `PRUEBAS_0009_OK`.

| # | Caso | Resultado |
| --- | --- | --- |
| 1 | `23-1-000001-9` (serie heredada) sigue validando; `…-0` se rechaza | OK |
| 2 | `bt_luhn_digito('2310000001') = '9'` y `23-1-0000001-9` valida | OK |
| 3 | Ninguna tarjeta almacenada incumple formato ni Luhn | OK |
| 4 | `bt_crear_tarjeta_maestra` crea `00-0-0000000-0` con `fare_type = 0` | OK |
| 5 | La segunda maestra responde `ya existe` | `bt:duplicada` |
| 6 | Lote con `p_desde = 9000001` produce `23-1-9000001-…` a `…9000003-…` | OK |
| 7 | Lote solapado (`p_desde = 9000002`) | `ya tiene tarjetas` |
| 8 | `bt_estacion_enrolar` acepta el serial de 11 dígitos y escribe `ENROLADA` | OK |
| 9 | `bt_generar_lote` con tarifa 0 | `tipo de tarifa` |

Antes de la suite se verificó que el reemplazo de `bt_generar_lote` elimina la
firma de cinco parámetros (`drop function`) y que la renumeración del lote de
arranque es idempotente: la segunda pasada ya no encuentra seriales de 6 dígitos.

En el portal, las pruebas de `dominio`, `lote`, `formato` y `codigos` cubren el
lado cliente del mismo cambio: Luhn de 11 dígitos, máscara `23-1-0000001-9` y
Code 128 en juego C con símbolo de cambio a B para el dígito final.

### 3.6 Migración 0010 (serial maestro de 11 dígitos)

La misma suite incorpora el serial heredado `00-0-000000-0` como comprobación de
compatibilidad y usa `00-0-0000000-0` para el alta:

| # | Caso | Resultado |
| --- | --- | --- |
| 1 | `bt_luhn_valido('00-0-000000-0')` sigue siendo cierto | OK |
| 2 | `bt_crear_tarjeta_maestra` crea `00-0-0000000-0` (`state_code = 0`, `fare_type = 0`) | OK |
| 3 | La segunda maestra responde `ya existe` | `bt:duplicada` |
| 4 | La renumeración de 10 → 11 dígitos es idempotente y `barcode_data` pasa a `00000000000` | OK |
| 5 | En producción, la maestra quedó `ACTIVE`, sin `batch_id` y con eventos `ASIGNADA` de canales `taquilla` y `sistema` | OK |

Ejecutada en producción el 2026-10-30 con `PRUEBAS_0009_OK` dentro de una
transacción con `ROLLBACK`; la suite retira la maestra al inicio para probar el
alta desde cero y la restaura al deshacer.

## 4. Prueba de sistema en producción (2026-10-29)

### 4.1 Portal del pasajero

Entorno: `https://blink-servers.github.io/TARJETA/`, Chromium, datos reales de
Supabase. Cuenta de prueba creada y eliminada al terminar; datos restaurados.

| Paso | Resultado |
| --- | --- |
| Carga del portal en modo nube (sin aviso de demostración) | OK |
| Registro en dos pasos con Pago Móvil propio | OK |
| Billetera vacía con llamado a vincular | OK |
| Vínculo de `23-1-000002-7` | OK; titular mostrado = cuenta |
| Tarjeta virtual con saldo, tarifa, serial y Code 128 | OK |
| Recarga de Bs 100 con banco y referencia | OK; comprobante en revisión |
| Movimiento visible en el inicio | OK |
| Perfil: datos, fuente de pago, tarjeta, apariencia, seguridad | OK |
| Enlaces a blink.com.ve; sin enlaces al panel retirado | OK (el perfil ya no ofrece «Panel de la línea») |
| Limpieza de datos de prueba | OK; `accounts` volvió a 0 y la tarjeta a `account_id = null` |

### 4.2 Back-office

Entorno: `https://blink-servers.github.io/BACKOFFICE/`, Chromium, cuenta
administradora real. Los datos de prueba (1 cuenta, 1 lote, 20 tarjetas) se
crearon y purgaron al terminar.

| Paso | Resultado |
| --- | --- |
| Carga del panel público (sin aviso de configuración faltante) | OK |
| Acceso con cédula + PIN de la cuenta `ADMIN` | OK |
| Pantalla de inscripción TOTP con QR y secreto agrupado | OK |
| Activación con el código del autenticador | OK |
| Resumen, Lotes, Inventario, Estación y Taquilla | OK |
| Crear lote de 20 `FABRICANTE` | OK; `creadoPor` visible |
| Captura de UID en la estación y carga en bloque | OK |
| Asignación en taquilla a una cuenta | OK; estado `ACTIVE` |
| Inventario con titular y saldo correctos | OK |
| Cierre de sesión y token descartado | OK |
| Purga de datos de prueba | OK; 20 tarjetas `FABRICADA`, 1 lote, 1 cuenta |

Tras la prueba se reinició el segundo factor de la cuenta administradora (ver
BLINK-DOC-06 §5.5) para que cada operador inscriba su propio dispositivo; la
cuenta queda en «MFA pendiente».

### 4.3 Simulación del flujo completo (2026-10-31)

Entorno: `~/BLINK/simulacion` con PostgreSQL 16 (`127.0.0.1:54329`), PostgREST
v12 detrás del gateway nginx (`127.0.0.1:54321`) y las migraciones `0001`–`0016`
salvo `0002_demo.sql`. Sin datos ni credenciales de producción.

| # | Paso | Resultado |
| --- | --- | --- |
| 1 | `bt_generar_lote(2, …)` + `bt_estacion_enrolar` con dos UID | OK; 2 tarjetas `FABRICADA` con `chip_uid` |
| 2 | `bt_registrar` de la pasajera de prueba y `bt_vincular` | OK; billetera con 1 tarjeta |
| 3 | `bt_recargar` por Bs 1.000 (Banesco, ref. 4821) | OK; movimiento y recarga `pendiente`, saldo intacto |
| 4 | `bt_recargas_pendientes` y `bt_aprobar_recarga` | OK; saldo virtual 1.000 |
| 5 | `bt_validador_emitir_token` + `bt_validador_sincronizar_token` | OK; recarga en `pendientes` y token válido |
| 6 | Aplicación al chip (`RECARGA_APLICADA`) y cobro de Bs 500 | OK; saldo 500, `synced_to_chip = true` |
| 7 | `bt_recargar` de Bs 300 en la segunda tarjeta + `bt_rechazar_recarga` | OK; saldo sin cambios |
| 8 | Referencia duplicada en la misma tarjeta y banco | `bt:duplicada` |
| 9 | `bt_resumen_operativo` | OK; contadores coherentes con las filas creadas |

La interfaz se comprobó en Chromium contra el mismo backend: el portal en
`http://127.0.0.1:5175` mostró la billetera, el saldo y la recarga aprobada; el
panel en `http://127.0.0.1:5173` permitió entrar con TOTP e inscribir el
dispositivo. Los datos de la simulación viven en `tmpfs` y desaparecen al
ejecutar `./detener.sh`.

### 4.4 Prueba física de punta a punta en producción (2026-10-31)

Equipo: validador ESP32 v6 con pantalla ST7789, RC522 y firmware corregido;
tarjeta maestra blanca UID `3981BF06`; firmware compilado con `arduino-cli`
(92 % de flash, 15 % de RAM) y flasheado por `/dev/ttyUSB0`; Wi-Fi temporal
`BLINK-VALIDADOR` (10.42.0.89) para la sincronización.

| # | Paso | Resultado |
| --- | --- | --- |
| 1 | `INFO` tras el flasheo | `fw=6`, `token=1`, `pendientes=1`, MAC `1C608BDF948C` |
| 2 | `ENROLAR,A-00000-000-H,0,0,3981BF06,FORZAR` | `ENROLADA,serial=A-00000-000-H,uid=3981BF06` |
| 3 | Primer toque (recarga de 5000 Bs aprobada + pasaje de 500) | Recarga aplicada y viaje cobrado; `saldo=4500`, `recarga=5000` |
| 4 | `recharges.synced_to_chip` | `true`, `synced_at` 20:40 |
| 5 | `trips_telemetry` | 1 fila, tarifa 500, `chip_balance_after = 4500`, `offline_id` único |
| 6 | `card_movements` | `recarga +5000` y `viaje −500`, ambos aprobados |
| 7 | `cards` | `virtual_balance = last_chip_balance = 4500` |
| 8 | `bt_resumen_operativo` | 1 pasaje, 500 recaudados, 500 por liquidar |

La primera versión del firmware fallaba al re-enrolar (`ERROR,enrolado,lector`)
porque, tras una autenticación fallida, el PICC no vuelve a IDLE sin cortar el
campo. `reseleccionar()` ahora apaga y enciende la antena antes de cada
reintento; con ese cambio el grabado y el toque funcionaron a la primera. La
evidencia completa, con identificadores y saldos, está en BLINK-DOC-15 §8.4.

### 4.5 Cobro repetido y verificación de escritura (2026-10-31)

El mismo equipo dejó de leer tarjetas nuevas después del primer cobro. La causa
era que el PCD quedaba en modo Crypto1: `PICC_HaltA()` calla la tarjeta pero no
borra la clave del lector, y el siguiente `REQA` salía cifrado. Se centralizó
la salida en `soltarTarjeta()` (`PICC_HaltA()` + `PCD_StopCrypto1()`) y se quitó
el re-encendido de antena del bucle, que despertaba la tarjeta olvidada.

| # | Paso | Resultado |
| --- | --- | --- |
| 1 | Toque 1 de la maestra (21:41:12) | `TAP,ok=1`: 2000 → 1500 Bs, contador 8 |
| 2 | Toque 2, seis segundos después (21:41:18) | `TAP,ok=1`: 1500 → 1000 Bs, contador 9; sin reinicio |
| 3 | `trips_telemetry` | Dos filas nuevas con `offline_id` único y `chip_counter` 8 y 9 |
| 4 | Firmware con Read-After-Write e inciertas (21:48) | Compila (92 %/15 %), flashea y arranca `READY,BLINK,6` |

Al cierre de esta revisión, el firmware de las 21:48 todavía no había cobrado
ninguna tarjeta: los dos toques de la tabla corresponden a la versión anterior
(la que solo corregía Crypto1). El primer toque con la versión de verificación
debe confirmar `TAP,ok=1` y `inciertas=0` en `INFO`. Queda pendiente la prueba
de fallo (retirar la tarjeta a media escritura) para ver la pantalla
**VERIFICAR** y la lista `inciertas`; ver BLINK-DOC-16 §8.

### 4.6 Códigos de respuesta POS (firmware 7, 2026-10-31)

La especificación `ISO-POS-015` pide un catálogo `ISO-00`/`ERR-xx` y una
pantalla de tres zonas. Se adoptó el catálogo y los iconos; la geometría de
128×128 no aplica al panel ST7789 de 240×240 (ADR-12, BLINK-DOC-17).

| # | Prueba | Resultado |
| --- | --- | --- |
| 1 | Compilar el firmware 7 (códigos, iconos y `codigo=` en `TAP`) | 1 209 963 bytes (92 %), 51 788 bytes de RAM (15 %) |
| 2 | Flashear y abrir el monitor (22:08) | `READY,BLINK,7,0,0` sin errores |
| 3 | Revisar el mapeo motivo → código | `saldo`→`ERR-12`, `llave`/`lectura`→`ERR-30`, `no-enrolada`→`ERR-41`, `bloqueada`→`ERR-54`, `corrupta`/`valor`/`escritura`/`verificacion`/`incierta`→`ERR-63`, `tiempo`→`ERR-91` |
| 4 | Toque con saldo y retirada a media lectura | **Pendiente** (ver §8, puntos 6 y 8) |

### 4.7 Interfaz datáfono y renderizado en 50 ms (firmware 8, 2026-10-31)

Se adoptó `ISO-UI-240-REV2` (BLINK-DOC-18): resultado a pantalla completa en
verde o rojo, retención de 2,5 s / 3,0 s y vuelta al panel de estado. La
especificación exige que el cambio de color sólido se complete en menos de
50 ms; se instrumentó el firmware con `micros()` y un comando de autoprueba.

| # | Prueba | Resultado |
| --- | --- | --- |
| 1 | Comprobar el hueco máximo del heap al arrancar | 268 564 bytes libres, **110 580** en el mayor bloque contiguo: un lienzo de 115 200 B no cabe |
| 2 | Reservar un lienzo de 240×120 (57 600 B) antes de Wi-Fi | `PANTALLA,lienzo=ram,heap=209108` |
| 3 | Medir el relleno a 24 / 32 / 40 MHz | 57 ms / 46 ms / 34 ms |
| 4 | `PANTALLA_TEST` a 40 MHz | `ms=39 vista=ok`, `ms=40 vista=no`, `ms=95 vista=panel` |
| 5 | Compilar el firmware 8 | 1 219 075 bytes (93 %), 51 956 bytes de RAM (15 %) |
| 6 | Flashear y arrancar | `READY,BLINK,8,0,0` |
| 7 | Toque real: verde 2,5 s y vuelta al panel | **Pendiente** |
| 8 | Apagar el router y mirar la banda amarilla | **Pendiente** |

Hallazgos que quedan en el código:

- **El lienzo de pantalla completa no cabe.** Pedir 115 200 B falla aunque el
  heap tenga 268 KB: el mayor bloque contiguo es de 110 580 B. Se usa un
  lienzo de media pantalla y dos pasadas.
- **El lienzo debe reservarse antes de Wi-Fi.** Si se pide después de
  `red.begin()` el hueco contiguo desaparece y el firmware cae al dibujo
  directo (63 ms a 24 MHz y hasta 151 ms con el panel directo original).
- **24 MHz no llega al límite.** El ESP32 divide los 80 MHz del bus; a 24 MHz
  el resultado completo medía 63 ms. A 40 MHz mide 39–40 ms.
- **La vuelta al panel tarda 95 ms.** Es posterior a la retención y no forma
  parte del cambio de color de la transacción.

### 4.8 Bandeja de recargas del back-office (migración 0018, 2026-11-01)

Se agregaron `bt_admin_recargas` y `bt_admin_resolver_recarga` (sesión + MFA) y
la pantalla **Recargas**. La prueba se ejecutó en la simulación local dentro de
una transacción revertida, con una tarjeta `G-00001-001-N` de saldo 1000 y dos
reportes pendientes de 5000 y 3000.

| # | Prueba | Resultado |
| --- | --- | --- |
| 1 | Bandeja con dos pendientes | `total=2`, `monto=8000`, más antiguo primero, `operador` resuelto |
| 2 | Acotar `p_limite` | `p_limite=1` lista una fila y conserva `total=2`; el tope es 200 |
| 3 | Aprobar 5000 | Saldo 1000 → **6000**; movimiento `aprobado` con `saldo_despues=6000`; `resolved_by` con el nombre del operador |
| 4 | Rechazar sin motivo | `bt:datos:Escribe el motivo del rechazo.` |
| 5 | Rechazar con motivo | `estado=rechazado`, saldo intacto |
| 6 | Resolver dos veces | `bt:datos:Esa recarga ya fue resuelta (estado: aprobado).` |
| 7 | Token inválido / sesión vencida | `bt:sesion:Tu sesión venció. Vuelve a entrar.` |
| 8 | Operador sin segundo factor | `bt:mfa:Activa la verificación en dos pasos antes de operar.` |
| 9 | `anon` ejecuta la RPC por PostgREST | HTTP 400 con el mensaje `bt:sesion` (no expone datos) |
| 10 | Migración en producción | `CREATE FUNCTION` ×2, permisos revocados a `public/anon/authenticated` y otorgados a `anon`; 4 pendientes reales (15 500 Bs) visibles |
| 11 | Interfaz en el navegador (simulación) | Bandeja con 2 pendientes y Bs. 6.500; confirmación de aprobación con aviso de irreversibilidad; al aprobar 5000 el saldo pasa a 6000 y la bandeja queda en 1 / Bs. 1.500; el rechazo sin motivo se bloquea en el cliente y con motivo deja 0 pendientes y el estado vacío |

La prueba visual (fila 11) se hizo con el servidor de desarrollo del back-office
contra la simulación, con una sesión sembrada en `sessionStorage` y el segundo
factor activo en la base local; los datos de prueba se borraron al terminar.
Queda pendiente repetir el recorrido en producción cuando se restaure el MFA
(hoy en modo bypass).

### 4.9 Motor tarifario y recarga por pasajes (migraciones 0019 y 0020, 2026-11-01)

Se reemplazó el monto libre por la compra de pasajes y se separó el bruto del
crédito. Las pruebas unitarias fijan la tabla del requerimiento y las de base
ejecutan el ciclo completo en la simulación.

| # | Prueba | Resultado |
| --- | --- | --- |
| 1 | Tabla de validación de 1, 2, 3, 5, 10 y 20 pasajes | Total, acreditado, comisión, provisión y utilidad exactos (`tarifa.test.ts`) |
| 2 | Conservación y redondeo | `acreditado + ce + ps + utilidad = total`; todo total es múltiplo de 10 |
| 3 | Tope y máximo de pasajes | 9 con tope 5.000; 37 con 20.000; el error indica cuántos caben |
| 4 | Reporte de 3 pasajes (SQL) | Movimiento pendiente 1.500; recarga 1.590 / base 1.500 / ce 23,85 / ps 4,50 / mg 60,00 / ex 1,68 |
| 5 | Aprobación | Saldo 1.000 → 2.500; movimiento «Pago Móvil aprobado · 3 pasajes» |
| 6 | Rechazo sin motivo / aprobación repetida | `bt:datos` con el mensaje correspondiente; saldo intacto |
| 7 | Flujo completo `./flujo.sh` | 2 pasajes → bruto 1.060, base 1.000; aprobado; chip recibe **1.000** y cobra 500; desglose verificado; rechazo y duplicado |
| 8 | Navegador (simulación) | Bloque 3 → recibo Bs 1.590; reporte con referencia 7731; bandeja con 3 pasajes / 1.590 / 1.500; aprobación → saldo 2.500 |
| 9 | Regresión detectada y corregida | La sincronización enviaba el bruto al chip (1.060); `0020` la corrige a `coalesce(monto_base, amount)` |

El punto 9 es el hallazgo más importante de la verificación: sin `0020`, el
plástico habría quedado con 60 Bs más que la nube. La prueba de flujo ahora
compara el importe del `RECARGA_APLICADA` con `monto_base`.

### 4.10 Términos legales y desglose del recibo (2026-11-01)

Se incorporó la hoja de términos (LEG-TER-001) accesible desde el acceso y desde
el perfil, con la tarifa tomada de la tarjeta activa, y se renombró el recibo
para separar «Pasaje urbano» de «Tasa administrativa digital» sin exponer el
desglose interno (comisión, provisión, utilidad). La verificación se hizo en el
navegador contra el servidor de desarrollo (Vite, puerto 5199) y en la
simulación.

| # | Prueba | Resultado |
| --- | --- | --- |
| 1 | Enlace en el pie del acceso | «términos y condiciones» abre la hoja; la hoja muestra Bs 500 formateado con la tarifa vigente |
| 2 | Enlace en Perfil | Fila «Términos y condiciones» bajo la sección BLINK; abre la misma hoja y cierra con «Entendido» |
| 3 | Tarifa dinámica | Con otra tarifa en `settings.publico.tarifario.base` la hoja muestra ese valor, no un número fijo |
| 4 | Contenido | Seis secciones: naturaleza del servicio, tasa administrativa, desglose, tarjeta MIFARE Classic 1K, datos personales y base normativa con nota de la Gaceta 43.335 |
| 5 | Recibo de recarga | «Pasaje urbano 2 × Bs 500 · Bs 1.000» y «Tasa administrativa digital Bs 60»; total 1.060 |
| 6 | Copiar recibo | El texto incluye tarifa por pasaje, pasaje urbano y tasa administrativa |
| 7 | Regresión | `npm run typecheck`, `npm test` (87 pruebas) y `npm run build` en verde |
| 8 | Service worker | La caché sube a `v5` para que un pasajero con el armazón anterior reciba la hoja legal |

La hoja es un resumen operativo y no sustituye la revisión de un abogado
(BLINK-DOC-09 R-15). La tarifa de Bs 500 se muestra como la aplicada en la
tarjeta, no como tarifa nacional oficial, porque la Gaceta 43.335 fija una
referencia de Bs 100 y la competencia es municipal (B-32).

### 4.11 Configuración Wi-Fi desde el teléfono (firmware 9, 2026-11-01)

Prueba en la unidad física (ESP32-D0WD-V3, MAC `1C:60:8B:DF:94:8C`,
`/dev/ttyUSB0`), compilada en **1 279 639 B (97 % de la tabla por defecto)**
y verificada por hash al flashear. La versión 10, con OTA y el esquema `no_fs`,
ocupa 1 295 871 B (63 % de cada ranura de 1 984 KB). El banco se armó con un
hotspot temporal del portátil (`BLINK-PRUEBA`) y el puerto serie se abrió con
DTR y RTS en bajo para leer los registros. La tabla cubre la primera versión
(portal básico), la pantalla QR y la revisión de usabilidad del 2026-11-01
(espera de 25 s, resultado y reintento).

| # | Prueba | Resultado |
| --- | --- | --- |
| 1 | Arranque sin credenciales | A los ~2 s la unidad registra `PORTAL,abierto,red=BLINK-948C,ip=192.168.4.1,min=5,qr=WIFI:T:nopass;S:BLINK-948C;P:;;` y la pantalla pasa a `VISTA_CONFIG` con el QR |
| 2 | Punto de acceso | `nmcli` lo ve abierto (sin seguridad, señal 87–92); el portátil obtiene 192.168.4.2 y conserva Internet por la interfaz cableada |
| 3 | Portal cautivo | `/` devuelve 200 con la página; `/generate_204` (sondeo de Android) responde 302 a `http://192.168.4.1/` |
| 4 | Barrido de redes | `/redes` lista 6–7 redes deduplicadas y ordenadas por señal en 2–4 s; el registro confirma `PORTAL,redes=7` |
| 5 | Fallo de conexión (nuevo) | `POST /guardar` con `RED-QUE-NO-EXISTE` responde 200; `/estado` pasa a `conectando` a los 2–8 s y a `fallo` a los ~22–25 s; `min` sube de 4 a 3 (ventana extendida a 3 min); serie: `PORTAL,guardado,red=RED-QUE-NO-EXISTE,intento=1`, `PORTAL,fallo,…,intento=1`, `PANTALLA,portal=3` → `5` |
| 6 | Éxito con hotspot (nuevo) | `POST /guardar` 200 en 0,14 s; `/estado` `conectando` a los 2 s y `ok` a los 4 s; el AP deja de responder a los ~14 s (10 s después del éxito); serie: `PORTAL,guardado,…,intento=1`, `PORTAL,conectado,red=BLINK-PRUEBA,ip=10.42.0.89`, `PANTALLA,portal=3` → `4`, `PORTAL,cerrado` |
| 7 | Falso positivo corregido | Antes del arreglo, un equipo ya unido a una red declaraba `ok` en el instante del `POST` (`conectado` antes de `guardado`) porque se evaluaba `conectada()` antes de aplicar las credenciales. Ahora se exige `aplicarEn == 0` y que el SSID asociado sea el elegido; la secuencia pasa por `conectando → ok` |
| 8 | Arranque con red guardada inalcanzable | La ventana se abre a los 20 s de seguir «buscando», una sola vez por arranque |
| 9 | Olvidar red | `OLVIDAR_WIFI` deja `RED,estado=sin-wifi` y conserva el token (`token=1`); al reiniciar sin credenciales la ventana se abre sola a los 2 s |
| 10 | Comandos de consola | `CONFIGURAR_WIFI` → `OK,portal=1,red=BLINK-948C`; `CERRAR_PORTAL` → `PORTAL,cerrado` / `OK,portal=0`; `WIFI,ssid,clave` une la estación y cierra el portal. El analizador separa por comas: `WIFI BLINK-PRUEBA …` devuelve `ERROR,comando=…` |
| 11 | Estabilidad de la ventana | A los 75 s de abierto el AP seguía anunciándose y `/` respondía 200, sin reinicios ni caída del servidor web |
| 12 | Pantalla QR | La consola registra `PANTALLA,qr=1,modulos=29,px=185` al abrir la ventana: 185 px de lado, 5 px por módulo y 4 de silencio |
| 13 | Cambio a instrucciones | Al unirse el portátil, `PORTAL,clientes=1` y la pantalla pasa a `YA CONECTADO` con `192.168.4.1` y los minutos; sin barra de BLINK |
| 14 | Vuelta al QR | Al desconectar el portátil, `PORTAL,clientes=0` y se repinta el QR (`PANTALLA,qr=1,…`); la cuenta atrás deja de refrescarse |
| 15 | Legibilidad del código | La misma matriz generada en el host con QrBlink se decodifica como `WIFI:T:nopass;S:BLINK-948C;P:;;` a 1:1 y a 0,5× (2,5 px por módulo) con `cv2.QRCodeDetector`; falla a 0,3×, por debajo del tamaño de píxel útil |
| 16 | Lectura con cámara real | No verificada: las cámaras del portátil no encuadran el panel. Pendiente de que el operador apunte un teléfono al QR (B-34) |
| 17 | Pantallas de etapa | Los modos `3`, `4` y `5` se pintan con el SSID, la IP y el mensaje de reintento; la pantalla no vuelve al QR mientras hay una etapa activa |
| 18 | Lista automática e interacción | Con la página abierta en un navegador de escritorio aparecen 7 redes sin pulsar nada; tocar una rellena el campo, la marca como activa y enfoca la clave; «Ver» revela la contraseña y cambia a «Ocultar»; «Actualizar lista» vuelve a barrer; «Más opciones» muestra «Olvidar red guardada» y «Terminar configuración» |
| 19 | Textos y contraste | La página servida (8 147 B) contiene «Contraseña», «Dirección», «Más opciones» y «mayúsculas y minúsculas»; los contrastes medidos van de 6,18:1 (botón) a 16,96:1 (texto) |

El AP de configuración es abierto (R-16 en BLINK-DOC-09) y la ventana dura
5 minutos; ambas condiciones están en la página y en el manual de operación
(BLINK-DOC-06 §6.1). El barrido de redes necesitó un reintento: con la estación
insistiendo a una red inexistente el controlador rechazaba `scanNetworks()` y
la lista salía vacía; la corrección pausa el intento 350 ms y repite.

La verificación de usabilidad completa está en BLINK-DOC-21 §9. Queda pendiente
la secuencia «fallo → reintento → éxito» con un teléfono real y la lectura del
QR con cámara, porque el portátil tiene una sola radio Wi-Fi (B-34).

### 4.12 Actualización remota de firmware (firmware 10, 2026-11-02)

Banco: la misma unidad física en `/dev/ttyUSB0`, hotspot del portátil
(`BLINK-VALIDADOR`, 10.42.0.1/24) y un servidor HTTP local en el puerto 8000
sirviendo `~/BLINK/firmware/validador/dist-ota`. Se usó HTTP a propósito para
poder observar cada paso; en producción la URL debe ser HTTPS (el cliente usa
el paquete de certificados del core y también acepta HTTP solo para pruebas
locales).

| # | Prueba | Resultado |
| --- | --- | --- |
| 1 | Tabla de particiones | `esptool` lee `ota_0` en `0x10000` y `ota_1` en `0x200000`, 1 984 KB cada una, con `otadata` en `0xe000` |
| 2 | NVS tras cambiar la tabla | El flasheo por USB conserva `token=1`, placa `A12BC3D` y las colas; `INFO` coincide antes y después |
| 3 | Arranque v10 | `READY,BLINK,10,1,0`; enlace con el hotspot, IP 10.42.0.89 y sincronización correcta |
| 4 | Estado OTA | `OTA,listo,fw=10,url=…,fallo=0`; `OTA_ESTADO` informa actual, remota, disponibilidad y URL |
| 5 | v10 → v11 completa | `OTA,disponible,actual=10,remota=11,size=1295728`; descarga con `Update.write` en la ranura pasiva, SHA-256 correcto, `OTA,ok=1,version=11`, reinicio y `OTA,arranque-nuevo,fw=11,intento=1` |
| 6 | Confirmación de arranque | A los 90 s, `OTA,arranque-ok,fw=11`; `READY,BLINK,11`; NVS, token y red intactos; la siguiente comprobación da `OTA,sin-novedad,actual=11,remota=11` |
| 7 | Reversión automática | Se publicó una v12 que ejecuta `abort()` al arrancar: se instaló en `app0`, hubo `intento=1`, `intento=2` y en el tercero `OTA,reversion,slot=app1,error=0`; la unidad volvió a la v11 (la ranura `app1`) |
| 8 | Versión fallida recordada | Tras revertir, `OTA,listo,fw=11,…,fallo=12`; la comprobación automática responde `OTA,omitida,version=12,motivo=fallo-anterior` y no reinstala la v12 |

La pantalla muestra `ACTUALIZANDO`, el porcentaje y «No apagues el equipo»
durante la descarga; con el resultado `OTA,ok=1` reinicia sola. Queda pendiente
probar contra el alojamiento HTTPS real de la flota, la pérdida de energía a
mitad de descarga (la ranura activa no se toca, pero conviene confirmarlo en
hardware) y el ritmo automático cada 6 h en operación continua; el disparo
manual (`OTA`) y la revocación por USB están verificados.

## 5. Prueba de la tarjeta virtual (ID-1 / CR80)

| Viewport | Ancho de tarjeta | Alto | Relación medida | Radio |
| --- | --- | --- | --- | --- |
| 371 px | 341 px | 215 px | 1,586 | 12,6 px |
| 320 px | 290 px | 183 px | 1,585 | 12 px (mínimo) |
| 280 px | 250 px | 158 px | 1,582 | 12 px (mínimo) |

Criterio: proporción 1,586:1 ±1 %, radio `clamp(12px, 3.7cqw, 16px)`, sin
solapamiento de contenido. **Cumplido** tras sustituir `min-height` por
`aspect-ratio` y escalar el interior con unidades `cqw`.

## 6. Criterios de aceptación del hito

| Criterio | Estado |
| --- | --- |
| Registro, vínculo y recarga contra la base real | Cumplido |
| Migración 0005 aplicada sin errores | Cumplido |
| Despliegue automático en verde | Cumplido |
| Proporción y radio de la tarjeta | Cumplido |
| Back-office separado con rol administrativo y TOTP | Cumplido |
| Pruebas unitarias en verde | Cumplido |
| Simulación local del flujo completo | Cumplido (2026-10-31; recarga por pasajes el 2026-11-01) |
| Recarga por pasajes con desglose contable y crédito del monto base | Cumplido (2026-11-01, §4.9) |
| Enrolado y cobro con tarjeta física | Cumplido (2026-10-31, §4.4) |
| Cobro repetido sin reiniciar y contador del chip en la nube | Cumplido (2026-10-31, §4.5) |
| Read-After-Write y estado incierto bajo fallo de hardware | Pendiente (B-23) |
| Código POS visible en pantalla y en serie | Implementado; toque real pendiente (§4.6) |
| Interfaz datáfono con cambio de color en menos de 50 ms | Cumplido: 39–40 ms medidos (§4.7) |

## 7. Calidad según ISO/IEC 25010

| Característica | Cómo se atiende |
| --- | --- |
| Adecuación funcional | RPC con reglas de negocio en la base; 14 casos verificados. |
| Eficiencia | Índices por cédula, correo, tarjeta, sesión y pendientes; consultas limitadas. |
| Compatibilidad | Chromium/Edge/Firefox modernos; Web Serial solo Chromium escritorio. |
| Usabilidad | Flujo guiado por pasos, mensajes en español, modo claro/oscuro, tarjeta legible. |
| Fiabilidad | Transacciones, `on delete` explícito, bloqueo por intentos, modo local de respaldo. |
| Seguridad | Ver BLINK-DOC-05. |
| Mantenibilidad | TypeScript estricto, capas separadas, migraciones versionadas, esta suite. |
| Portabilidad | Build estático en GitHub Pages; sin dependencia de servidor propio. |

## 8. Deuda de pruebas

1. Automatizar el flujo de §4 con Playwright contra un proyecto de pruebas.
2. Llevar `simulacion/flujo.sh` al CI con la pila Docker efímera (hoy se ejecuta
   a mano en el equipo de desarrollo).
3. Probar el validador con tarjeta física en modo offline y con una tarjeta en
   lista negra (el enrolado y el cobro en línea ya se probaron el 2026-10-31).
4. Añadir prueba de regresión visual de la tarjeta en varios viewports.
5. Probar el back-office con Playwright (acceso, TOTP y carga en bloque) sobre un
   proyecto de pruebas, porque los códigos TOTP no se pueden reutilizar en CI sin
   un secreto conocido.
6. Forzar un corte a media escritura (retirar la tarjeta durante el cobro) y
   comprobar el rechazo **VERIFICAR**, la lista `inciertas` y su limpieza
   (B-23, BLINK-DOC-16 §4.3).
7. Medir el tiempo de cobro completo con marcas de tiempo en serie; la
   especificación externa pide 0,3–0,6 s (BLINK-DOC-16 §8).
8. Retirar la tarjeta a media lectura para forzar `ERR-91` (`REPITA EL TOQUE`)
   y comprobar que no marca la tarjeta como incierta (ADR-13).
9. Comprobar en el panel real el verde/rojo, la banda amarilla sin Wi-Fi y la
   legibilidad a plena luz; la medición de 39–40 ms es de tiempo de bus, no de
   percepción (BLINK-DOC-18 §11).
