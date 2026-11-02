# BLINK · actualización remota de firmware del validador (OTA)

| Campo | Valor |
| --- | --- |
| Código | BLINK-DOC-22 |
| Versión | 1.0.0 |
| Fecha | 2026-11-02 |
| Estado | Vigente (verificado en banco: v10→v11 y reversión de una v12 rota) |
| Autor | Equipo BLINK (desarrollo asistido) |
| Normas de referencia | ISO/IEC/IEEE 12207:2017 · ISO/IEC 27001:2022 · ISO/IEC 25010:2011 · ISO/IEC/IEEE 26514:2022 |

## 1. Objetivo y alcance

Este documento describe cómo el **validador BLINK se actualiza por aire** a
partir del firmware 10, para que una flota no tenga que flashearse unidad por
unidad por USB. Cubre el formato del manifiesto, el reparto de la memoria
flash, el flujo de descarga y verificación, la política de ejecución
automática, la confirmación de arranque con reversión, la operación y las
pruebas en hardware.

**Dentro del alcance:** la aplicación del validador (ESP32-D0WD-V3, 4 MB de
flash), su tabla de particiones y el procedimiento del operador para publicar
una versión.

**Fuera del alcance:** el cargador de arranque (no se actualiza por OTA), el
firmware del lector (sin OTA), el aprovisionamiento de la red (BLINK-DOC-06
§6.1) y la interfaz de cobro (BLINK-DOC-18). Las pruebas están en BLINK-DOC-07
§4.12 y el riesgo asociado, en BLINK-DOC-09 R-24.

### 1.1 El problema de partida

Hasta la versión 9 el validador se actualizaba solo por USB. Con una flota en
operación eso obliga a desconectar cada equipo, llevarlo a un portátil y
volver a flashearlo. La partición de 3 MB (`huge_app`) que se probó el
2026-11-02 daba espacio pero **eliminaba la segunda ranura de aplicación**, es
decir, hacía imposible la actualización por aire. Se descartó.

## 2. Decisión de arquitectura

### ADR-27 · Dos ranuras de aplicación y manifiesto público

Se usa el esquema de particiones `no_fs`: `ota_0` y `ota_1` de 1 984 KB cada
una, con `otadata` para que el cargador sepa qué ranura arrancar. El binario se
publica junto a un manifiesto JSON con versión, URL, SHA-256 y tamaño.

**Motivo:** es el esquema más simple que permite escribir la actualización sin
tocar la ranura en ejecución y conserva ~736 KB libres para GPS, batería y
zumbador.

**Consecuencia:** el binario puede crecer hasta ~1,98 MB. Si una versión futura
lo superara, habría que volver a evaluar la tabla (por ejemplo, una sola ranura
con actualización por USB) o reducir dependencias.

### ADR-28 · Reversión en el firmware, no en el cargador

El firmware nuevo se marca como «probando» en NVS. Si no confirma el arranque
a los 90 s y se reinicia tres veces, la siguiente ejecución de `ota.begin()`
selecciona la otra ranura con `esp_ota_set_boot_partition()` y reinicia. La
versión fallida queda anotada para no reinstalarla automáticamente.

**Motivo:** el cargador del ESP32 no ofrece un rollback condicionado a que la
aplicación esté sana; la comprobación en el firmware es portable y no depende
de opciones de compilación del core.

**Consecuencia:** un firmware que arranca pero no llega a ejecutar `loop()`
tampoco confirma y se revierte. Un firmware que bloquea el equipo sin
reiniciarse no se revierte solo; para eso está el flasheo por USB.

## 3. Reparto de la memoria flash

| Partición | Tipo | Offset | Tamaño | Uso |
| --- | --- | --- | --- | --- |
| `nvs` | datos | `0x9000` | 20 KB | Red, token, colas, configuración y estado de OTA |
| `otadata` | datos | `0xE000` | 8 KB | Ranura activa y estado de arranque |
| `ota_0` | app | `0x10000` | 1 984 KB | Aplicación (ranura A) |
| `ota_1` | app | `0x200000` | 1 984 KB | Aplicación (ranura B) |
| `coredump` | datos | `0x3F0000` | 64 KB | Volcado tras un pánico |

No hay SPIFFS: el firmware no usa sistema de archivos. La NVS sigue en
`0x9000`, así que cambiar de esquema de particiones **no borra** la red, el
token ni las colas. El binario de la versión 10 ocupa **1 295 871 B (63 % de
cada ranura)** y **53 836 B (16 %)** de RAM global.

La partición activa se elige por `otadata`; al aplicar una actualización,
`Update` escribe siempre en la ranura que **no** está corriendo.

## 4. Manifiesto

El equipo consulta un JSON pequeño (menos de 4 KB) por HTTPS:

```json
{
  "version": 10,
  "url": "https://ejemplo.com/firmware/BLINK_Validador_v10.bin",
  "sha256": "a9041f95b43c2770d3190c2677667e470f409bed1806a3a9745e3cf0d5b96fae",
  "size": 1296016
}
```

| Campo | Validación |
| --- | --- |
| `version` | Entero 1–255 y **mayor** que `VERSION_FW`; si es igual o menor, no hay novedad |
| `url` | `https://` o `http://` (este último solo para pruebas locales), menos de 300 caracteres |
| `sha256` | 64 caracteres hexadecimales |
| `size` | Mayor que 0 y menor o igual a `OTA_MAX_BYTES` (2 000 000 B); debe coincidir con el `Content-Length` del binario |

El manifiesto y el binario son **públicos**: no llevan claves. La integridad
la garantiza el SHA-256, no la confidencialidad. La escritura del bucket debe
estar restringida al equipo (R-24).

## 5. Flujo de una actualización

```text
1. Comprobar    GET manifiesto → validar JSON, versión, URL, hash y tamaño
2. Mostrar      pantalla ACTUALIZANDO con la versión y 0 %
3. Descargar    GET binario → exigir Content-Length == size
4. Escribir     Update.begin(size) → bloques de 1 KB a la ranura pasiva
                (SHA-256 calculado al vuelo; pantalla al porcentaje)
5. Verificar    comparar SHA-256 calculado con el del manifiesto
6. Cerrar       Update.end(true) → otadata apunta a la ranura nueva
7. Reiniciar    NVS: probando=1, arranques=0, versión nueva
8. Arrancar     ota.begin() cuenta el intento y sigue el arranque
9. Confirmar    a los 90 s: probando=0, arranques=0
```

Si cualquiera de los pasos 1–6 falla, la ranura activa queda intacta y el
equipo sigue cobrando. `Update.abort()` descarta la escritura parcial.

Si el paso 8 se repite tres veces sin llegar al 9, `ota.begin()` ejecuta la
reversión:

```text
OTA,reversion,slot=app1,error=0
```

`slot` es el rótulo de la ranura a la que vuelve (la que tiene el firmware
anterior), no la que se está ejecutando. Además, guarda la versión fallida en
NVS (`fallo`). La comprobación automática
responde entonces `OTA,omitida,version=12,motivo=fallo-anterior` y no la
reinstala. El comando manual `OTA` sí permite reintentarla después de corregir
la publicación.

## 6. Política de ejecución automática

| Condición | Valor |
| --- | --- |
| Primera comprobación tras arrancar | 2 minutos (`OTA_PRIMERA_MS`) |
| Periodicidad | 6 horas (`OTA_CADA_MS`) |
| Reintento tras un fallo | 30 minutos (`OTA_REINTENTO_MS`) |
| Quietud mínima desde la última tarjeta | 60 segundos (`OTA_QUIETO_MS`) |
| Confirmación de arranque | 90 segundos (`OTA_CONFIRMA_MS`) |
| Arranques sin confirmar antes de revertir | 3 (`OTA_ARRANQUES_MAX`) |

La actualización automática **no** se ejecuta si falta la URL, no hay enlace,
el portal de configuración está abierto, hay un enrolado en curso o la cola de
cobros tiene entradas pendientes de subir. Así no se interrumpe una
sincronización ni se reinicia el equipo con una tarjeta recién leída.

El comando `OTA` omite el horario, la quietud y el cierre del portal: solo
exige URL y red. Es la vía para aplicar una versión en el taller o para
reintentar una publicación corregida.

## 7. Seguridad y recuperación

- **TLS:** HTTPS con el paquete de certificados del core
  (`useBuiltinCACertBundle`), handshake de 12 s y tiempo de espera de 15–20 s.
  Las redirecciones se siguen en modo estricto. HTTP solo se acepta para
  pruebas en red local; en producción la URL debe ser HTTPS.
- **Integridad:** SHA-256 calculado durante la descarga y comparado (sin
  distinguir mayúsculas) antes de `Update.end`. Un hash distinto descarta la
  imagen.
- **Tamaño:** se exige `Content-Length` y que coincida con el manifiesto; no se
  aceptan respuestas `chunked`. El límite de 2 MB evita llenar la ranura con
  un archivo ajeno.
- **Ranura pasiva:** la aplicación en ejecución no se modifica hasta que la
  nueva imagen está completa y verificada.
- **Reversión:** tres arranques sin confirmación devuelven la unidad a la
  ranura anterior y recuerdan la versión fallida.
- **Recuperación por USB:** si el equipo no arranca, el flasheo local con
  `arduino-cli upload` (BLINK-DOC-06 §6) siempre lo recupera. El cargador de
  arranque no se toca por OTA.
- **Sin secretos en el manifiesto:** la URL y el binario pueden ser públicos;
  el token del validador sigue viviendo solo en NVS y no viaja en la
  actualización.

## 8. Operación

### 8.1 Publicar una versión

1. Subir `VERSION_FW` en `config.h` (por ejemplo, de 10 a 11) y compilar con
   `PartitionScheme=no_fs`.
2. Generar el paquete desde `~/BLINK/firmware/validador`:

   ```bash
   ./publicar_ota.sh /tmp/BLINK_Validador_out/BLINK_Validador.ino.bin \
                     https://ejemplo.com/firmware
   ```

   El script copia el binario a `dist-ota/`, calcula el SHA-256 y escribe
   `dist-ota/manifest.json`. Si el binario es de otra compilación, se puede
   forzar la versión con `OTA_VERSION=11 ./publicar_ota.sh …`.
3. Subir **los dos archivos** (`manifest.json` y el `.bin`) al mismo prefijo
   HTTPS. El manifiesto ya apunta a la URL absoluta del binario.
4. Comprobar desde un navegador que el manifiesto y el binario descargan sin
   autenticación.

### 8.2 Configurar la URL del manifiesto

- En fábrica: `OTA_MANIFEST_URL` en `config.h`, antes de compilar.
- En una unidad concreta: `OTA_URL,https://…/manifest.json` por consola; queda
  en NVS y sobrevive a los reinicios y a las actualizaciones.
- Para desactivar la OTA en una unidad: `OTA_URL,` (guarda vacío en NVS, no
  borra la clave; así no reaparece una URL compilada por defecto).
- Para reintentar una versión fallida tras republicar un binario corregido:
  `OTA_LIMPIAR` olvida la anotación y el reintento pendiente. Si la versión
  fallida llega a arrancar instalada a mano, el propio `begin()` la limpia.

### 8.3 Desplegar y verificar

1. Publicar el manifiesto con la versión nueva.
2. Esperar la ventana automática (2 min tras un reinicio o 6 h de operación) o
   enviar `OTA` si la unidad está accesible.
3. Seguir por consola:

   ```text
   OTA,disponible,actual=10,remota=11,size=1295728
   OTA,inicio,version=11,size=1295728,url=https://…
   OTA,ok=1,version=11,bytes=1295728,sha=…,reiniciando
   OTA,arranque-nuevo,fw=11,intento=1
   READY,BLINK,11,1,0
   OTA,arranque-ok,fw=11
   ```

4. Confirmar que la sincronización sigue: `SYNC`/`RED` y la cola en `INFO`.

### 8.4 Recuperar una unidad que no arranca

Conectar por USB y flashear la versión estable con el comando de BLINK-DOC-06
§6. La NVS se conserva; si la unidad venía de una versión fallida, el estado
`fallo` en NVS no impide el flasheo manual y se limpia al confirmar el arranque
de la versión buena.

## 9. Pantalla y consola

Durante la descarga la pantalla deja el panel de reposo y muestra
`ACTUALIZANDO`, `Firmware vN`, el porcentaje en tamaño 4 y una barra de
progreso; debajo, «No apagues el equipo» y «Se reinicia al terminar». No se
repinta la franja de tarjeta ni la banda inferior mientras dura. Al terminar
bien, el equipo reinicia solo; si falla un intento manual, aparece la pantalla
roja `OTA NO APLICADA` con el motivo y vuelve al panel.

| Línea | Significado |
| --- | --- |
| `OTA,listo,fw=…,url=…,fallo=…` | Arranque; URL vigente y última versión fallida |
| `OTA,disponible,actual=…,remota=…,size=…` | Hay una versión mayor en el manifiesto |
| `OTA,sin-novedad` | La versión remota no supera a la local |
| `OTA,inicio` | Comienza la descarga |
| `OTA,ok=1,…,reiniciando` | Imagen escrita y verificada |
| `OTA,arranque-nuevo,…` / `OTA,arranque-ok,…` | Intento y confirmación tras el reinicio |
| `OTA,reversion,slot=…` | Volvió a la ranura anterior por arranques sin confirmar |
| `OTA,fallo,motivo=…` | Fallo de URL, red, tamaño, espacio, escritura, SHA o corte |
| `OTA,omitida,…,motivo=fallo-anterior` | La versión ya falló y no se reinstala sola |
| `OTA,actual=…,remota=…,disponible=…` | Respuesta de `OTA_ESTADO` |
| `OTA,fallo=0` | `OTA_LIMPIAR` olvidó la versión fallida |

## 10. Verificación

Las pruebas de hardware del 2026-11-02 están en BLINK-DOC-07 §4.12. Resumen:

- Tabla `no_fs` leída por `esptool`: `ota_0`, `ota_1` y `otadata` correctos.
- NVS conservada tras el cambio de tabla y tras cada OTA.
- v10 → v11 por HTTP local: descarga, SHA correcto, reinicio y confirmación.
- v11 → v12 con `abort()` al arrancar: tres intentos, reversión a la v11 y
  versión 12 recordada como fallida.

Queda pendiente probar contra el alojamiento HTTPS real, la pérdida de energía
a mitad de descarga y el ritmo automático de 6 h en operación continua.

## 11. Riesgos y límites

| Riesgo o límite | Tratamiento |
| --- | --- |
| Un manifiesto o binario reemplazado en el servidor instala firmware ajeno | Restringir la escritura del bucket y rotar credenciales de publicación (R-24); el SHA-256 no protege contra un servidor comprometido |
| El binario supera 1 984 KB | La compilación falla o `Update.begin` no cabe; revisar dependencias antes de publicar |
| Un firmware que se cuelga sin reiniciarse no se revierte solo | Recuperación por USB; monitoreo de sincronización |
| El cargador no se actualiza por OTA | Aceptado: los cambios de cargador requieren USB |
| La actualización reinicia el equipo | Solo se ejecuta con la cola vacía y 60 s sin tarjetas; el cobro offline sigue disponible tras el reinicio |
| URL por unidad en NVS | `OTA_ESTADO` la muestra; `OTA_URL,` la desactiva sin recompilar |

## 12. Referencias

- BLINK-DOC-06 §6: compilación, flasheo y operación del firmware.
- BLINK-DOC-07 §4.12: pruebas de OTA en hardware.
- BLINK-DOC-09 R-24: riesgo del manifiesto público.
- BLINK-DOC-02 §2: componente «Firmware validador».
- `~/BLINK/firmware/validador/ota.cpp` y `ota.h`: implementación.
- `~/BLINK/firmware/validador/publicar_ota.sh`: empaquetado del manifiesto.
