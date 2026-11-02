# API de funciones RPC

| Campo | Valor |
| --- | --- |
| Código | BLINK-DOC-04 |
| Versión | 1.4.0 |
| Fecha | 2026-11-01 |
| Estado | Vigente |
| Norma | ISO/IEC/IEEE 26514 |
| Transporte | PostgREST (`POST /rest/v1/rpc/<función>`) |

## 1. Contrato general

- Todas las funciones viven en el esquema `public` y son `security definer` con
  `search_path` fijo (`public` o `public, extensions`).
- El cuerpo se envía como JSON con los nombres de parámetro.
- Los errores de negocio se lanzan con el formato
  `bt:<código>:<mensaje en español>` y PostgREST los devuelve con HTTP 400.
  `bt_entrar` es la excepción: devuelve `{error, mensaje}` con HTTP 200 para poder
  **persistir el intento fallido** antes de responder.
- El cliente del portal (`src/lib/nube.ts`) y el del back-office
  (`BACKOFFICE/src/lib/api.ts`) reconocen los códigos y los convierten en
  `ErrorBlink`.

### Códigos de error

| Código | Significado |
| --- | --- |
| `credenciales` | PIN incorrecto o cuenta bloqueada temporalmente. |
| `sesion` | Token ausente, inválido o vencido. |
| `sin-tarjeta` | Serial inexistente, vencido o fuera de la billetera. |
| `bloqueada` | Tarjeta o cuenta bloqueada. |
| `ya-activada` | Cédula/correo ya registrado o tarjeta de otra cuenta. |
| `duplicada` | Referencia repetida o tarjeta ya vinculada. |
| `pin-invalido` | PIN trivial o dato de recarga fuera de rango. |
| `datos` | Validación de formato (cédula, teléfono, correo, banco). |
| `permiso` | La cuenta no tiene rol `ADMIN`/`TAQUILLA`, o el token no es de back-office. |
| `mfa` | Segundo factor pendiente o código TOTP inválido/vencido. |
| `red` | Error de transporte (lo genera el cliente). |

### Ejemplo de invocación

```bash
curl -sS -X POST "$VITE_SUPABASE_URL/rest/v1/rpc/bt_entrar" \
  -H "apikey: $VITE_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $VITE_SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"p_cedula":"V-12345678","p_pin":"194628"}'
```

## 2. Portal del pasajero (ejecutable por `anon`)

| Función | Parámetros | Devuelve |
| --- | --- | --- |
| `bt_registrar` | `p_nombres, p_apellidos, p_cedula, p_telefono, p_correo, p_pin, p_pago_propio=true, p_pago_banco='', p_pago_telefono='', p_pago_cedula=''` | `{token, cuenta, tarjetas[]}` |
| `bt_entrar` | `p_cedula, p_pin` | `{token, cuenta, tarjetas[]}` o `{error, mensaje}` |
| `bt_sesion` | `p_token` | `{cuenta, tarjetas[]}` |
| `bt_vincular` | `p_token, p_serial` | Billetera actualizada |
| `bt_movimientos` | `p_token, p_serial, p_limite=100` | `{movimientos[]}` |
| `bt_recargar_pasajes` | `p_token, p_serial, p_pasajes, p_telefono, p_banco, p_referencia` | `{movimiento, cotizacion}` |
| `bt_recargar` (legado) | `p_token, p_serial, p_monto, p_telefono, p_banco, p_referencia` | `{movimiento}` |
| `bt_cambiar_pin` | `p_token, p_actual, p_nuevo` | `{ok:true}` |
| `bt_actualizar_pago` | `p_token, p_propio, p_banco='', p_telefono='', p_cedula=''` | `{cuenta}` |
| `bt_salir` | `p_token` | `{ok:true}` |
| `bt_ajustes` | — | Configuración pública (`settings.publico`) |

### Comportamiento por función

**`bt_registrar`**

1. Normaliza y valida nombres, cédula (`V`/`E` + 6–8 dígitos), teléfono (11 dígitos
   desde 0), correo y PIN (`bt_pin6_valido`).
2. Rechaza cédula o correo duplicados (`ya-activada`).
3. Si `p_pago_propio`, fuerza banco vacío y teléfono/cédula del registro; si no,
   exige banco, teléfono y cédula del titular de la cuenta de pago.
4. Inserta en `accounts` con bcrypt, purga sesiones vencidas y crea una nueva.
5. Devuelve token + billetera vacía.

**`bt_entrar`** — bloquea 5 minutos al quinto fallo consecutivo. Con la cuenta
bloqueada responde `credenciales` indicando los minutos restantes. Un PIN correcto
reinicia `intentos`.

**`bt_vincular`** — valida formato y Luhn del serial, existencia, enrolado
(`sin-enrolar`: la estación todavía no grabó el chip), vigencia y
pertenencia a otra cuenta (`ya-activada`) o duplicado en la propia billetera
(`duplicada`). Es la Fase 2 del aprovisionamiento: una tarjeta `FABRICADA` o
`ACTIVE` sin dueño pasa a `ACTIVE`, se sella `asignada_at`/`asignada_por='portal'`
y se escribe la bitácora `ASIGNADA`. `BLOCKED` y `LOST` responden `bloqueada`.

**`bt_recargar_pasajes`** — recibe una cantidad entera de pasajes, **no un
monto**. Recotiza en el servidor con `bt_cotizar_recarga` usando la tarifa del
plástico (`cards.tarifa`), rechaza si el total supera `bt_tope_recarga` y valida
teléfono (11 dígitos desde 0), banco y últimos 4 dígitos de la referencia.
Limita a 6 reportes por tarjeta cada 10 minutos y rechaza referencias repetidas
(`duplicada`). Crea el movimiento pendiente con `monto = acreditado` y la
recarga con `amount = total`, `monto_base`, `pasajes` y el desglose contable.
Devuelve el movimiento y la cotización aplicada.

**`bt_recargar`** (legado) — acepta un monto libre de 1 a tope y guarda la
recarga sin desglose. Se mantiene solo para clientes con el service worker
anterior en caché (BLINK-DOC-19, B-27); la UI actual no lo usa.

**`bt_movimientos`** — máximo 300 filas, orden descendente por fecha. Si la tarjeta
no pertenece a la cuenta responde `sin-tarjeta`.

**`bt_salir`** — elimina la sesión de cuenta y, por compatibilidad, cualquier
sesión legada de tarjeta con el mismo token.

## 3. Operación (solo `service_role`)

Estas funciones **no** están disponibles con la clave pública. Se invocan desde un
entorno de confianza (script de administración, validador con token o consola SQL).

| Función | Uso |
| --- | --- |
| `bt_emitir_tarjeta(serial, nombre, cedula, telefono, tarifa)` | Emite un plástico. |
| `bt_enrolar_tarjeta(visible_id, chip_uid)` | Asocia el UID del chip al serial (una tarjeta por vez). |
| `bt_generar_lote(cantidad, patrocinante, estado, tarifa, origen='FABRICANTE', desde=null)` | Genera un lote de hasta 999 seriales `AGE-#####-###-L` en estado `FABRICADA`; `desde` fija la unidad inicial (ver §3.1). |
| `bt_crear_tarjeta_alfa(cedula, uid=null, operador='', tarifa=500)` | Crea `A-00000-000-H` (`fare_type = 0`) y la asigna a la cuenta de esa cédula (ver §3.2). |
| `bt_estacion_enrolar(lote, items, operador='')` | Carga masiva UID↔serial desde el lector; devuelve `enroladas`, `rechazadas` y `errores[]`. |
| `bt_estacion_catalogo(lote)` | Devuelve el lote con serial, UID y estado de cada tarjeta (hoja de la estación). |
| `bt_estacion_asignar(serial, cedula, operador='')` | Activa el plástico a nombre de una cuenta ya registrada (taquilla). Exige que la estación haya enrolado el chip (`chip_uid` no nulo). |
| `bt_cobrar_viaje(serial, unidad, monto)` | Cobro puntual desde el validador. |
| `bt_aprobar_recarga(recarga, admin)` | Acredita `coalesce(monto_base, amount)` (el bruto en recargas anteriores a `0019`), actualiza el movimiento y marca la recarga. |
| `bt_rechazar_recarga(recarga, admin, motivo)` | Rechaza el reporte. |
| `bt_recargas_pendientes(limite)` | Lista recargas por revisar. |
| `bt_bloquear_tarjeta(serial, motivo)` / `bt_desbloquear_tarjeta(serial)` | Cambia el estado del plástico. |
| `bt_reportar_perdida(visible_id, motivo)` | Marca `LOST` y la excluye de la billetera. |
| `bt_acreditar_recarga(visible_id, monto, referencia, banco, telefono)` | Acreditación manual con traza. |
| `bt_validador_sincronizar(mac, taps, recargas)` | Sincronización legada por MAC. |
| `bt_validador_emitir_token(mac)` / `bt_validador_revocar_token(mac)` | Provisiona/revoca el token del validador. |
| `bt_validador_sincronizar_token(token, taps, recargas)` | Sincronización autenticada por token. |
| `bt_liquidar(vehicle, desde, hasta)` | Cierra el periodo de una unidad. |
| `bt_resumen_operativo()` | Totales para el panel (incluye `fabricadas` y `asignadas`). |

### 3.1 Numeración de lotes (migración 0014)

`bt_generar_lote(p_cantidad int, p_patrocinante text, p_estado int, p_tarifa int,
p_origen text default 'FABRICANTE', p_desde bigint default null)`:

1. La letra depende de la tarifa: `G` para la general (`p_tarifa = 1`) y `E` para
   estudiante o tercera edad (`p_tarifa = 2`).
2. El número de lote es `max(batch_number) + 1`, de **5 dígitos** (hasta 99.999).
   `p_desde` fija la primera **unidad** del lote (001–999); la cantidad máxima es
   999 y el rango no puede pasar de la unidad 999.
3. Arma el serial `AGE-#####-###-L` y calcula el verificador con `bt_luhn_letra`
   sobre el serial sin guiones (Luhn mod 23, alfabeto sin `I` ni `O`).
4. Inserta las tarjetas en estado `FABRICADA` con `barcode_data` sin guiones
   (`G00001001N`); el resultado trae `{lote: {numero, desde, hasta, …}, tarjetas[]}`.

Llamada típica desde la consola SQL:

```sql
select public.bt_generar_lote(100, 'Transporte Ejemplo, C.A.', 23, 1, 'FABRICANTE');
select public.bt_generar_lote(100, 'Transporte Ejemplo, C.A.', 23, 1, 'FABRICANTE', 101);
```

### 3.2 Tarjeta Alfa `A-00000-000-H`

`bt_crear_tarjeta_alfa(p_cedula, p_uid default null, p_operador default '',
p_tarifa default 500)` crea el plástico del propietario:

1. Valida la cédula (6–8 dígitos) y busca la cuenta; sin cuenta responde
   `bt:sin-cuenta`.
2. Rechaza un segundo registro de la Alfa o un UID ya usado.
3. Inserta `visible_id = 'A-00000-000-H'`, `state_code = 0`, `fare_type = 0`,
   `status = 'ACTIVE'`, `batch_number` y `serial_number` en 0, `asignada_at =
   now()` y `asignada_por = p_operador`, copiando nombre y teléfono de la cuenta.
4. Deja dos eventos en `card_events`: `ASIGNADA` (detalle `serie: ALFA`) y, si se
   pasó UID, `ENROLADA` (canal `estacion`).
5. Solo `service_role` puede ejecutarla. Con `p_uid` nulo se crea sin chip y se
   enrola después en la estación con `bt_estacion_enrolar` o `ENROLAR` por consola.

### Estación de asignación

`bt_estacion_enrolar` recibe `[{ "serial": "G-00001-001-N", "uid": "0484CC62" }, …]`
(hasta 999 pares por tanda, un lote completo). Normaliza el UID a hexadecimal
mayúsculas, exige que el serial pertenezca al lote indicado y registra `ENROLADA`
en `card_events`. Solo acepta la serie vigente `AGE-#####-###-L` con verificador
Luhn mod 23.
Los pares inválidos no interrumpen la carga: vuelven en `errores[]` con su motivo.
La operación es idempotente por par (mismo serial y UID no duplica).

### Funciones legadas

`bt_activar`, `bt_tarjeta(token)` y `card_sessions` pertenecen al modelo anterior
(PIN por plástico). Se conservan para no romper instalaciones antiguas, pero el
portal v2 no las usa. No ampliar su alcance; retirarlas en una migración futura.

## 4. Back-office (ejecutables por `anon`, autentican por token)

El panel administrativo corre en un repositorio aparte (`BLINK-Servers/BACKOFFICE`)
con la misma clave publishable que el portal. **No usa `service_role`**: cada RPC
recibe `p_token` y resuelve la cuenta en el servidor. Así, el navegador del
operador nunca lleva una credencial con acceso total a la base.

| Función | Parámetros | Devuelve |
| --- | --- | --- |
| `bt_admin_entrar` | `p_cedula, p_pin, p_codigo=''` | `{token, rol, mfa, mfaPendiente, cuenta}` o `{error, mensaje}` |
| `bt_admin_estado` | `p_token` | Estado de la sesión y del segundo factor |
| `bt_admin_mfa_inscribir` | `p_token` | `{secreto, uri}` del dispositivo nuevo |
| `bt_admin_mfa_activar` | `p_token, p_codigo` | `{ok:true}` |
| `bt_admin_resumen` | `p_token` | Resumen operativo (igual a `bt_resumen_operativo`) |
| `bt_admin_lote` | `p_token, p_cantidad, p_patrocinante=null, p_estado=23, p_tarifa=1, p_origen='FABRICANTE'` | Lote creado + `creadoPor` |
| `bt_admin_catalogo` | `p_token, p_lote` | Hoja del lote (serial, UID, estado) |
| `bt_admin_enrolar` | `p_token, p_lote, p_items, p_operador=''` | `{enroladas, rechazadas, errores[]}`; `p_lote = null` enrola sin filtrar lote (tarjeta Alfa) |
| `bt_admin_siguiente` | `p_token, p_lote=null` | Siguiente serial `FABRICADA` del lote para la estación secuencial |
| `bt_admin_merma` | `p_token, p_serial, p_tipo, p_motivo=''` | Retira una tarjeta del inventario (`RFPGC` o `CHIP_ERR`) |
| `bt_admin_lotes` | `p_token, p_limite=20` | Lotes con `enroladas`, `asignadas`, `fabricadas` |
| `bt_admin_tarjetas` | `p_token, p_lote=null, p_buscar='', p_estado=null, p_limite=200` | `{total, tarjetas[]}` con titular, cédula y saldo |
| `bt_admin_recargas` | `p_token, p_limite=100` | `{total, monto, base, pasajes, recargas[], operador}`; cada recarga trae `montoBase`, `pasajes` y `tarifaBase` |
| `bt_admin_resolver_recarga` | `p_token, p_recarga, p_aprobar, p_motivo=null` | `{ok, saldo, acreditado, pasajes, recarga, aprobada, operador}`; el rechazo exige motivo |

### Reglas

1. **Autenticación.** `bt_admin_sesion(token)` valida el token en
   `account_sessions` (`expira > now()`) y el rol `ADMIN`/`TAQUILLA`. Cualquier
   RPC del panel responde `bt:sesion` o `bt:permiso` si falla.
2. **Segundo factor.** `bt_admin_sesion_mfa(token)` exige además `totp_activo`.
   Resumen, lotes, catálogo, enrolado y asignación responden `bt:mfa` mientras el
   operador no confirme el dispositivo.
3. **TOTP en el servidor.** El secreto solo sale una vez, en
   `bt_admin_mfa_inscribir`; `bt_admin_entrar` y `bt_admin_estado` nunca lo
   devuelven. La verificación usa RFC 6238 (HMAC-SHA1, 30 s, 6 dígitos) con
   ventana de ±1 paso por desfase de reloj.
4. **Inscripción.** `bt_admin_mfa_inscribir` genera un secreto de 32 caracteres y
   lo deja inactivo; volver a llamarla invalida el anterior. `bt_admin_mfa_activar`
   comprueba un código real antes de marcar `totp_activo`.
5. **Contrato de error.** `bt_admin_entrar` también devuelve `{error, mensaje}`
   con HTTP 200 (`permiso`, `credenciales`, `mfa`) para poder persistir el intento
   fallido y mantener el bloqueo de 5 fallos / 5 minutos.
6. **Solo lectura.** `bt_admin_lotes`, `bt_admin_tarjetas` y `bt_admin_recargas`
   no modifican datos; `p_limite` se acota a 200 tarjetas, 100 lotes y 200
   recargas.
7. **Resolución de recargas.** `bt_admin_resolver_recarga` exige el segundo
   factor, bloquea la fila (`for update`) y delega en `bt_aprobar_recarga` o
   `bt_rechazar_recarga`, de modo que el saldo, el movimiento y la auditoría se
   escriben en un solo lugar. Una recarga ya resuelta responde `bt:datos`; el
   rechazo sin motivo también. Aprobar es irreversible desde el panel.
8. **Permisos.** Las funciones internas (`bt_admin_sesion`, `bt_admin_sesion_mfa`,
   `bt_totp_*`) están revocadas para `anon`; solo las catorce RPC de la tabla
   anterior se conceden. Las funciones primitivas (`bt_generar_lote`,
   `bt_estacion_*`, `bt_resumen_operativo`, `bt_recargas_pendientes`,
   `bt_aprobar_recarga`, `bt_rechazar_recarga`) siguen cerradas a `anon`: el
   panel llega a ellas únicamente a través de su envoltorio con token.

```bash
# 1) Entrar: devuelve token y el estado del segundo factor
curl -sS -X POST "$URL/rest/v1/rpc/bt_admin_entrar" \
  -H "apikey: $CLAVE" -H "Authorization: Bearer $CLAVE" \
  -H "Content-Type: application/json" \
  -d '{"p_cedula":"V-34201580","p_pin":"******"}'

# 2) Operar con el token de la sesión (nunca con service_role)
curl -sS -X POST "$URL/rest/v1/rpc/bt_admin_tarjetas" \
  -H "apikey: $CLAVE" -H "Authorization: Bearer $CLAVE" \
  -H "Content-Type: application/json" \
  -d '{"p_token":"<uuid-de-sesion>","p_estado":"FABRICADA","p_limite":50}'
```

## 5. Funciones internas (sin permisos para clientes)

`bt_pin_valido`, `bt_pin6_valido`, `bt_luhn_valido`, `bt_luhn_letra`,
`bt_solo_digitos`, `bt_normalizar_mac`, `bt_tope_recarga`, `bt_tocar_actualizada`,
`bt_estado_portal`, `bt_tarjeta_vigente`, `bt_tarjeta_json`, `bt_movimiento_json`,
`bt_cuenta_json`, `bt_tarjeta_cuenta_json`, `bt_billetera_json`,
`bt_tarjeta_de_cuenta`, `bt_sesion_cuenta`, `bt_totp_base32`, `bt_totp_codigo`,
`bt_totp_valido`, `bt_admin_sesion`, `bt_admin_sesion_mfa`, `bt_tarifario`,
`bt_cotizar_recarga`.

`revoke all` aplica a `public`, `anon` y `authenticated`. Solo se invocan desde
otras funciones `security definer`.

## 6. Forma de los objetos devueltos

```jsonc
// Billetera
{
  "cuenta": {
    "nombres": "María Fernanda", "apellidos": "Fernández",
    "cedula": "V-12345678", "telefono": "04141234567",
    "correo": "maria@correo.com", "rol": "PASAJERO",
    "datosPago": { "propio": true, "banco": "", "telefono": "04141234567", "cedula": "V-12345678" }
  },
  "tarjetas": [{
    "serial": "G-00001-001-N", "estado": "Activa", "saldo": 485,
    "tarifa": 15, "titular": { "nombre": "…", "cedula": "…", "telefono": "…" },
    "emitida": "2025-06-02T…", "vence": "2026-06-30"
  }]
}

// Movimiento
{ "tipo": "recarga", "monto": 100, "saldo": 0, "detalle": "Pago Móvil en revisión",
  "estado": "pendiente", "banco": "Banco de Venezuela", "referencia": "1177",
  "fecha": "2026-10-29T22:17:00Z" }

// Bandeja de recargas del back-office
{
  "total": 4, "monto": 15500, "operador": "Operador Apellido",
  "recargas": [{
    "recarga": "<uuid>", "movimiento": "<uuid>", "serial": "G-00001-001-N",
    "titular": "María Fernández", "cedula": "V-12345678", "monto": 5000,
    "telefono": "04141234567", "banco": "Banesco", "referencia": "1234",
    "estado": "pendiente", "reportada": "2026-11-01T05:14:17Z", "saldo": 1000
  }]
}
```

## 7. Versionado del contrato

- Añadir parámetros **con valor por defecto** al final es compatible.
- Cambiar el nombre o el tipo de un parámetro requiere:
  1. nueva función con sufijo (`_v2`) o sobrecarga,
  2. adaptar `src/lib/nube.ts` y `src/lib/local.ts`,
  3. actualizar este documento y el CHANGELOG.
- Antes de retirar una firma antigua, ejecutar
  `drop function if exists public.<nombre>(<tipos>)` en la migración nueva, como
  hizo 0005 con `bt_movimientos(text,int)` y `bt_recargar(text,numeric,text,text,text)`.
