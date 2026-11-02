# Alcance, contexto y partes interesadas

| Campo | Valor |
| --- | --- |
| Código | BLINK-DOC-01 |
| Versión | 1.3.0 |
| Fecha | 2026-11-01 |
| Estado | Vigente |
| Norma | ISO/IEC/IEEE 12207:2017 · ISO/IEC/IEEE 29148 |

## 1. Problema de negocio

Una línea de transporte urbano cobra el pasaje con tarjeta sin contacto (MIFARE
Classic 1K) y necesita:

1. **Emitir y enrolar** tarjetas con un identificador legible y verificable (ID BLINK).
2. **Cobrar** el pasaje a bordo, con o sin conexión.
3. **Recargar** el saldo sin que el pasajero tenga que ir a taquilla.
4. **Liquidar** la recaudación por unidad y por línea.
5. **Rendir** información fiscal y de operación a la autoridad.

## 2. Productos y alcance

El ecosistema vigente son **dos aplicaciones web**: el portal del pasajero
(BLINK TARJETA) y la consola administrativa (BLINK BACK-OFFICE). Ambas comparten
el mismo proyecto Supabase y el esquema `bt_*`.

### 2.1 BLINK TARJETA — `blink-servers.github.io/TARJETA/`

Portal del pasajero: registro de cuenta con PIN de 6 dígitos, vinculación de una o
varias tarjetas por serial, consulta de saldo, movimientos, reporte de recargas por
Pago Móvil y administración de la fuente de pago.

**En alcance:** identidad de la cuenta, billetera multi-tarjeta, recargas reportadas,
extracto, cambio de PIN, datos de Pago Móvil, consulta sin conexión.
**Fuera de alcance:** aprobación de recargas y gestión de lotes (back-office),
cobro a bordo (validador) y emisión física de plásticos.

### 2.2 BLINK BACK-OFFICE — `blink-servers.github.io/BACKOFFICE/`

Consola administrativa en repositorio propio: alta de lotes, bandeja de recargas,
inventario, estación de enrolado por Web Serial y resumen operativo. Exige rol
`ADMIN` o `TAQUILLA` y segundo factor TOTP.

**En alcance:** fabricación y trazabilidad de tarjetas, enrolado UID↔serial y
revisión del Pago Móvil desde la pantalla **Recargas**. La asignación a una
cuenta la hace el pasajero desde el portal al reclamar el serial.
**Fuera de alcance:** registro de pasajeros (portal) y liquidación fiscal.

### 2.3 Backend compartido — Supabase `gakkfzqcrapxeierfdhk`

PostgreSQL 17.11 con PostgREST, pgcrypto en el esquema `extensions` y RLS activo en
todas las tablas. Aloja el esquema de transporte (`bt_*`) y el del comercio POS.

### 2.4 Simulación local — `TARJETA/simulacion`

Pila reproducible con PostgreSQL 16, PostgREST v12 y un gateway nginx que expone
el mismo contrato `/rest/v1/rpc/*`. Aplica las migraciones, siembra una ruta y un
validador de prueba, y ejecuta el ciclo completo (lote → enrolado → registro →
reclamo → recarga → aprobación → sincronización → cobro) sin tocar producción.

### 2.5 Productos fuera del alcance actual

- **BLINK POS** (`www.blink.com.ve`): producto de comercio independiente que
  comparte proyecto Supabase pero no el esquema `bt_*`.
- **BLINK PASAJES**: retirado el 2026-10-31. El dominio `pasajes.blink.com.ve`
  redirige a BLINK TARJETA mediante el repositorio `PASAJES-REDIRECT`.
- **Panel de fiscales**: próximo hito, todavía sin repositorio. La materia prima
  es `trips_telemetry` y la liquidación `bt_liquidar`.

## 3. Partes interesadas

| Parte | Interés | Cómo lo cubre el sistema |
| --- | --- | --- |
| **Pasajero** | Recargar sin ir a taquilla, consultar saldo y movimientos. | BLINK TARJETA (registro, billetera, recargas, extracto). |
| **Chofer / operador** | Cobrar rápido, con o sin internet. | Firmware BLINK_Validador. |
| **Administrador de la línea** | Aprobar recargas, fabricar y asignar tarjetas, detectar fraude. | BLINK BACK-OFFICE (lotes, estación, recargas) + RPC de servicio. |
| **Comercio (POS)** | Vender, facturar, controlar inventario. | BLINK POS (producto aparte, fuera de esta suite). |
| **Desarrollo / mantenimiento** | Entender, desplegar, simular y extender. | Esta suite documental, `simulacion/` y el CHANGELOG. |
| **Autoridad fiscal** | Reportes de operación. | Telemetría `trips_telemetry`; panel fiscal (próximo hito). |

## 4. Requisitos funcionales principales

| ID | Requisito | Producto | Estado |
| --- | --- | --- | --- |
| RF-01 | Registrar una cuenta con cédula, teléfono, correo y PIN de 6 dígitos. | TARJETA | Implementado |
| RF-02 | Impedir PIN triviales (repeticiones o secuencias). | TARJETA | Implementado |
| RF-03 | Vincular N tarjetas a una cuenta por serial con Luhn. | TARJETA | Implementado |
| RF-04 | Rechazar tarjetas bloqueadas, vencidas, ya vinculadas o fuera de cartera. | TARJETA | Implementado |
| RF-05 | Reportar recarga por Pago Móvil con banco, teléfono y referencia. | TARJETA | Implementado |
| RF-05.1 | Comprar pasajes (1 a N) y calcular el monto exacto con gross-up, margen y redondeo a la decena. | TARJETA | Implementado |
| RF-05.2 | Guardar por separado el bruto transferido y el monto base acreditado con el desglose de comisiones. | Backend | Implementado (0019/0020) |
| RF-06 | Evitar referencias duplicadas y limitar reportes por ráfaga. | TARJETA | Implementado |
| RF-07 | Consultar movimientos por tarjeta. | TARJETA | Implementado |
| RF-08 | Cambiar el PIN validando el actual. | TARJETA | Implementado |
| RF-09 | Cambiar la fuente de Pago Móvil (propia o de un familiar). | TARJETA | Implementado |
| RF-10 | Bloquear la cuenta 5 minutos tras 5 PIN incorrectos. | TARJETA | Implementado |
| RF-11 | Aprobar o rechazar recargas y acreditar saldo. | Back-office / RPC | Implementado |
| RF-12 | Cobrar el pasaje y sincronizar validador con token. | Validador | Implementado y probado en unidad física (DOC-07 §4.4/§4.5) |
| RF-13 | Gestionar lotes, inventario y enrolado desde una consola con RBAC y TOTP. | Back-office | Implementado |
| RF-14 | Simular el flujo completo contra un backend local reproducible. | Simulación | Implementado |
| RF-15 | Mostrar los términos y condiciones (`LEG-TER-001`) y separar en el recibo el pasaje urbano de la tasa administrativa digital. | TARJETA | Implementado (DOC-20) |

## 5. Supuestos y restricciones

- El navegador del pasajero es **Chromium de escritorio** para Web Serial; móviles
  no soportan Web Serial, por lo que el lector solo funciona en escritorio.
- La tarjeta física es MIFARE Classic 1K; el portal debe funcionar aunque el
  pasajero no tenga lector (solo con el serial impreso).
- El monto máximo por recarga es configurable (`settings.publico.topeRecarga`,
  hoy Bs 20.000,00) y el máximo de pasajes se deriva de él (37 a Bs 500).
- El acceso directo a `db.<ref>.supabase.co` es IPv6; desde redes IPv4 se usa el
  pooler (`aws-0-us-east-2.pooler.supabase.com:5432`).
- Las credenciales del repositorio solo contienen claves **públicas** (publishable).

## 6. Criterios de aceptación del hito actual

1. El portal registra, vincula, muestra movimientos y reporta recargas contra la
   base real. **Verificado el 2026-10-29** (ver BLINK-DOC-07 §4).
2. La tarjeta virtual mantiene proporción ID-1/CR80 (1,586:1) y radio 3,7 % del
   ancho en cualquier viewport. **Verificado a 371, 320 y 280 px.**
3. El despliegue automático publica cada push a `main`. **Verificado.**
4. El flujo completo se reproduce en local sin tocar producción: lote, enrolado,
   registro, reclamo, recarga, aprobación, sincronización y cobro.
   **Verificado el 2026-10-31** (ver BLINK-DOC-07 §4.3).
