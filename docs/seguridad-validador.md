# Seguridad del validador y bitácora de dinero

**ID:** `BLINK-SEC-002` · **Versión:** 1.0 · **Fecha:** 2026-11-07
**Ámbito:** repositorio `Pay`, base PostgreSQL/Supabase y firmware ESP32
**Norma de referencia:** `QODER-BLINK-BANKING-SEC-2026`
**Migración que lo implanta:** `supabase/migrations/0025_escudo_validador.sql`

Este documento fija el contrato entre el equipo físico y la nube. Todo lo que
el ESP32 envíe a Supabase debe poder reproducirse aquí; si el firmware cambia
la firma, cambia este documento y la migración, en ese orden.

---

## 1. Saldo y concurrencia

El saldo autoritativo sigue viviendo en `cards.virtual_balance` (lectura en
milisegundos), y cada débito se hace dentro de una transacción con
`select ... for update` sobre la fila de la tarjeta. Dos validadores, o un
validador y una transferencia, nunca calculan el saldo nuevo desde una lectura
vieja: el segundo espera a que el primero confirme.

`0025` no cambia esa parte: la refuerza en lo que rodea al toque (clave única,
tarjeta activa, saldo virtual suficiente, importes enteros).

---

## 2. El toque: lo que genera el ESP32

### 2.1 Clave de idempotencia

Cada toque físico nace con una **clave UUID v4** generada en el equipo en el
instante del apoyo de la tarjeta. Esa clave viaja como `offline_id` y es la
identidad del viaje en todo el sistema:

- `trips_telemetry.offline_id` es `not null unique` y debe cumplir el patrón
  UUID v4 (`xxxxxxxx-xxxx-4xxx-[89ab]xxx-xxxxxxxxxxxx`).
- `trips_telemetry.idempotency_key` guarda la misma clave como `uuid` con
  índice único.
- Un reenvío por corte de red llega con la misma clave y el servidor lo
  ignora sin descontar dos veces; un texto libre se rechaza con el motivo
  «Clave de idempotencia inválida (UUID v4)» y queda en
  `validator_rejections`.

El equipo no puede reutilizar claves entre toques ni entre unidades: la
restricción es global, no por validador.

### 2.2 Firma HMAC-SHA256

Cada equipo tiene una clave propia de 32 bytes, guardada en su memoria segura
(`DEVICE_SECRET_KEY`). La nube solo guarda la clave en
`validator_secrets.secret`, legible únicamente por `service_role`.

La firma cubre el cuerpo y el sello de tiempo:

```
firma = HMAC-SHA256( cuerpo ∥ timestamp , DEVICE_SECRET_KEY )
```

- `cuerpo` es el **texto exacto** que viaja en `p_cuerpo`, byte a byte, sin
  reindentar ni reordenar.
- `timestamp` son los segundos Unix en decimal, pegados al final del cuerpo,
  sin separador (`...}{"taps":[]}1751985600`).
- La clave se usa como texto UTF-8: el servidor recibe 64 caracteres
  hexadecimales y los convierte tal cual (`convert_to(secreto, 'UTF8')`), **no**
  como bytes decodificados del hexadecimal.
- `firma` es el HMAC en hexadecimal minúscula (64 caracteres).

Ejemplo de cuerpo:

```json
{"taps":[{"offline_id":"0b6f0a4e-2f43-4c51-9a11-7d5f0f3a9c21","visible_id":"23-1-000042-7","fare_charged":500,"fare_type":1,"chip_balance_after":500,"tapped_at":"2026-11-07T14:03:11Z"}],"recargas":[]}
```

### 2.3 Petición de sincronización

```http
POST /rest/v1/rpc/bt_validador_sincronizar_firma
apikey: <publishable key>
content-type: application/json

{
  "p_mac": "A0B1C2D3E4F5",
  "p_cuerpo": "{\"taps\":[...],\"recargas\":[]}",
  "p_timestamp": 1751985600,
  "p_nonce": "5f0c2b8e-8f2a-4a3d-9d55-1f0a7c3b2e10",
  "p_firma": "9c1e..."
}
```

Reglas que aplica el servidor, en este orden:

| Comprobación | Rechazo |
| --- | --- |
| `abs(now() - p_timestamp) > 30` | `Sello de tiempo vencido (n s)` |
| `nonce` fuera de 8…64 caracteres | `Nonce inválido` |
| `firma` distinta de 64 caracteres | `Firma inválida` |
| equipo inexistente o inactivo | `Validador no registrado o inactivo` |
| equipo sin clave emitida | `El validador no tiene clave HMAC` |
| HMAC recalculado distinto | `Firma inválida` |
| `nonce` ya usado por ese equipo | `Trama repetida` |

La comparación de firmas se hace sobre los digests SHA-256 de ambas cadenas,
para no filtrar información por longitud ni por prefijo. Los nonces se
purgan a los 10 minutos; con la ventana de 30 s, una trama capturada ya no
sirve ni siquiera cuando su nonce desaparece.

El `nonce` debe ser único por equipo y por trama; se recomienda un UUID v4
nuevo en cada envío, incluso cuando se reintenta el mismo cuerpo (el
`offline_id` es lo que evita el doble cobro, el nonce evita la repetición de
la trama).

### 2.4 Aprovisionamiento y rotación

```sql
-- service_role
select public.bt_validador_emitir_secreto('A0B1C2D3E4F5');
-- { "mac": "...", "secreto": "<64 hex>", "algoritmo": "HMAC-SHA256",
--   "ventana_segundos": 30 }
```

El secreto se muestra **una sola vez**. Emitirlo de nuevo rota la clave
(`rotado_at`) y deja inválidas las firmas del secreto anterior: el firmware
debe recibir la nueva clave antes de volver a sincronizar.

### 2.5 Camino heredado por token

`bt_validador_sincronizar_token` (0004) sigue disponible para el firmware ya
instalado, que no firma. Resuelve la MAC a partir del token SHA-256 del equipo
y delega en el mismo núcleo endurecido, de modo que también exige UUID v4,
tarjeta activa y saldo virtual. La firma HMAC es el camino obligatorio para
cualquier firmware nuevo; el token no aporta antirrepetición.

---

## 3. Qué hace el servidor con un toque aceptado

1. Procesa primero los acuses (`recargas`) para que `last_chip_balance` quede
   al día antes de interpretar los toques.
2. Bloquea la tarjeta con `for update` y verifica, en orden: tarjeta conocida,
   `status = 'ACTIVE'`, tarifa entera y acotada a la ruta, saldo del chip
   coherente con lo confirmado más los créditos pendientes, y saldo virtual
   suficiente.
3. Inserta `trips_telemetry` con la clave UUID y `card_movements` con el
   débito, los enlaza por `movement_id` y actualiza `cards`.
4. Todo lo que no pasa queda en `validator_rejections` con el motivo, el
   `offline_id` y la carga original.

La respuesta mantiene el contrato del firmware: `validador`, `procesadas`,
`rechazadas`, `pendientes` y `bloqueadas`.

---

## 4. Bitácora particionada

`transactions_log` es una copia inmutable de cada movimiento de dinero, con la
misma forma que ve el pasajero en su extracto:

| Columna | Contenido |
| --- | --- |
| `id`, `at` | Identidad y fecha del movimiento (clave primaria compuesta) |
| `movimiento_id` | Fila de `card_movements` que la originó |
| `card_id`, `vehicle_id` | Tarjeta y unidad; la unidad se resuelve por `movement_id` o por la placa |
| `tipo`, `monto`, `saldo_despues`, `estado` | Importe y efecto |
| `detalle`, `referencia` | Texto del recibo y referencia bancaria |
| `idempotency_key` | Clave del toque, cuando el movimiento viene del validador |

- Particionada por rango de fechas, una partición por mes
  (`transactions_log_2026_11`), más `transactions_log_default` como red de
  seguridad.
- `bt_asegurar_particion(at)` crea el mes que falte; el disparador de
  `card_movements` la llama antes de insertar, así que el sistema no depende
  de una tarea programada.
- La migración crea los meses desde el movimiento más antiguo hasta
  diciembre de 2027 y luego copia el histórico una sola vez.
- Aprobar o rechazar una recarga cambia el estado, el saldo resultante y el
  detalle del movimiento original; el disparador de actualización copia esos
  cambios a la bitácora, de modo que un rechazo no figure como dinero
  pendiente. La fecha (`at`) y el momento de registro (`registrada_at`) no se
  tocan nunca.
- La partición por defecto debe quedar vacía: si acumula filas, hay que
  archivar esos meses y crear la partición antes de agregar más.

### 4.1 Archivo de meses cerrados

Un mes cerrado se puede sacar de la base sin tocar el resto:

```sql
-- 1. Exportar (desde service_role o el rol administrador)
\copy (select * from public.transactions_log_2026_11) to 'transactions_log_2026_11.csv' csv header

-- 2. Desprender la partición y guardarla como tabla fría
alter table public.transactions_log detach partition public.transactions_log_2026_11;
```

El CSV es el respaldo de archivo; la tabla desprendida se puede volcar a
almacenamiento frío y borrar. Nunca se archiva el mes en curso ni el anterior:
la ventana de conciliación y reclamos vive ahí.

---

## 5. Permisos

| Objeto | `anon` / `authenticated` | `service_role` |
| --- | --- | --- |
| `bt_validador_sincronizar` | sin acceso | ejecuta |
| `bt_validador_sincronizar_token` | ejecuta con token | ejecuta |
| `bt_validador_sincronizar_firma` | ejecuta con firma | ejecuta |
| `bt_validador_emitir_secreto` | sin acceso | ejecuta |
| `transactions_log` | sin acceso | `select` |
| `validator_secrets`, `validator_nonces` | sin acceso (RLS sin políticas) | vía funciones |

El portal y los equipos nunca escriben en las tablas de saldo: toda la lógica
pasa por funciones `security definer` que validan sesión, token o firma. La
superficie RPC es, en la práctica, el backend intermedio; no hay ruta de
cliente que llegue a `cards`, `card_movements` ni `transactions_log` sin pasar
por ella.

---

## 6. Transporte y reposo

- **TLS 1.3**: el portal se sirve por HTTPS forzado en `pay.blink.com.ve`
  (certificado de GitHub Pages) y la API de Supabase solo acepta HTTPS.
- **Cifrado en reposo AES-256**: lo aplica la plataforma de Supabase sobre el
  volumen de la base; no hay configuración de aplicación que lo altere.
- Las claves de Supabase que llegan al navegador son la URL y la llave
  publicable; la llave de servicio y los secretos de validador nunca salen del
  servidor.

---

## 7. Verificación reproducible

```bash
cd simulacion
./arrancar.sh          # base limpia con todas las migraciones y datos mínimos
node flujo.mjs         # 14 pasos; el 12 prueba la firma y el 13 la bitácora
```

El paso 12 comprueba sello vencido, firma falsa, nonce reutilizado, clave que
no es UUID v4, toque sin clave y tarjeta inactiva. El paso 13 comprueba que
cada movimiento tiene su fila en la bitácora, que la partición del mes existe,
que la partición por defecto está vacía y que `anon` no puede leer la tabla.

La migración también se probó sobre una base con toques antiguos de texto: las
filas se normalizan a UUID v4 y la liquidación posterior las sigue aceptando.

---

## 8. Pendientes

1. Pegar `0024_cedula_solo_digitos.sql` y `0025_escudo_validador.sql` en el
   SQL Editor del proyecto. Hasta entonces la nube no tiene firma HMAC ni
   bitácora, y la biometría del portal no puede crear enlaces.
2. El firmware ESP32 no está en este repositorio. Debe generar el UUID v4 en
   el toque, firmar con su clave del NVS y enviar `p_nonce` nuevo en cada
   intento. El contrato de la sección 2 es lo que tiene que implementar.
3. Rotar los secretos de los equipos que ya están en calle en el momento de
   actualizar el firmware.
