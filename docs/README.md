# Documentación del ecosistema BLINK — índice y control documental

| Campo | Valor |
| --- | --- |
| Código | BLINK-DOC-00 |
| Versión | 1.18.0 |
| Fecha | 2026-11-02 |
| Estado | Vigente |
| Autor | Equipo BLINK (desarrollo asistido) |
| Revisión | 18 |
| Normas de referencia | ISO 9001:2015 §7.5 · ISO/IEC/IEEE 12207:2017 · ISO/IEC/IEEE 26511/26512/26513/26514/26515 · ISO/IEC 25010 · ISO/IEC 27001:2022 |

## 1. Propósito

Esta carpeta reúne la documentación técnica y operativa del ecosistema **BLINK**,
hoy formado por **dos aplicaciones web** —el portal del pasajero y la consola
administrativa— y un backend compartido. Su objetivo es que cualquier persona
pueda **retomar el desarrollo, operar el sistema, simular el flujo completo y
auditar sus decisiones** sin depender del contexto de quien lo construyó.

La suite sigue, en lo aplicable a un proyecto pequeño, las prácticas de control
documental de ISO 9001 (§7.5), el ciclo de vida de ISO/IEC/IEEE 12207 y las
normas de documentación de software ISO/IEC/IEEE 26511 a 26515.

## 2. Alcance

| Producto | Repositorio | URL pública | Versión |
| --- | --- | --- | --- |
| BLINK TARJETA (portal del pasajero) | `BLINK-SERVERS/TARJETA` | https://blink-servers.github.io/TARJETA/ | 1.7.0 |
| BLINK BACK-OFFICE (gestión de tarjetas) | `BLINK-SERVERS/BACKOFFICE` | https://blink-servers.github.io/BACKOFFICE/ | 1.3.0 |
| Backend (Supabase) | proyecto `gakkfzqcrapxeierfdhk` | — | PostgreSQL 17.11 |
| Simulación local | `TARJETA/simulacion` | `http://127.0.0.1:54321` (API) · `:5175` (portal) · `:5173` (panel) | — |

> **Base de datos compartida.** TARJETA y BACK-OFFICE apuntan al **mismo proyecto
> de Supabase** y al mismo esquema `public` (tablas sin prefijo y funciones
> `bt_*`); las migraciones viven en `TARJETA/supabase/migrations` y son la
> fuente de verdad. Cualquier cambio de
> esquema debe evaluarse contra ambas aplicaciones. BLINK POS (comercio) sigue
> operando en `www.blink.com.ve` con las tablas `businesses` y `catalogo_global`
> del mismo proyecto, pero queda **fuera del alcance funcional** de esta suite.

> **BLINK PASAJES está retirado.** El repositorio `BLINK-SERVERS/PASAJES` quedó
> archivado y su publicación eliminada. El dominio `pasajes.blink.com.ve` lo
> sirve hoy `BLINK-SERVERS/PASAJES-REDIRECT`, que redirige a BLINK TARJETA. La
> copia local del código histórico se conserva en `~/BLINK/archivo/pasajes`.

> **Próximo hito: panel de fiscales.** Todavía no tiene repositorio. La materia
> prima es la telemetría `trips_telemetry` y la liquidación `bt_liquidar`; el
> diseño se decidirá después de estabilizar el flujo simulado de TARJETA.

> **Simulación del flujo completo.** `TARJETA/simulacion` levanta PostgreSQL 16,
> PostgREST y el portal/panel contra ese backend local, sin tocar producción.
> Es el entorno de referencia para probar el ciclo completo (ver BLINK-DOC-06
> §5.7 y BLINK-DOC-07 §4.3).

## 3. Documentos

| Código | Documento | Norma principal |
| --- | --- | --- |
| BLINK-DOC-01 | [Alcance y partes interesadas](01-alcance-y-partes-interesadas.md) | 12207 |
| BLINK-DOC-02 | [Arquitectura del ecosistema](02-arquitectura.md) | 26514 |
| BLINK-DOC-03 | [Modelo de datos](03-modelo-de-datos.md) | 26514 |
| BLINK-DOC-04 | [API de funciones RPC](04-api-rpc.md) | 26514 |
| BLINK-DOC-05 | [Seguridad de la información](05-seguridad.md) | 27001 |
| BLINK-DOC-06 | [Operación y despliegue](06-operacion-y-despliegue.md) | 12207 |
| BLINK-DOC-07 | [Pruebas y calidad](07-pruebas-y-calidad.md) | 26513 · 25010 |
| BLINK-DOC-08 | [Manual de usuario](08-manual-de-usuario.md) | 26511 · 26512 |
| BLINK-DOC-09 | [Riesgos, brechas y deuda técnica](09-riesgos-y-brechas.md) | 12207 · 27001 |
| BLINK-DOC-10 | [Guía para retomar el desarrollo](10-guia-de-retoma.md) | 26515 |
| BLINK-DOC-11 | [Rotación de claves y secretos](11-rotacion-de-claves.md) | 27001 |
| BLINK-DOC-12 | [Enrolado y producción de lotes de tarjetas](12-enrolado-de-lotes.md) | 7810 · 7812-1 · 15417 · PDF/VT |
| BLINK-DOC-13 | [Seguridad bancaria y operación offline](13-seguridad-bancaria-offline.md) | 7812-1 · 7064 · 14443 · GlobalPlatform |
| BLINK-DOC-14 | [Estándares industriales y control de calidad](14-estandares-industriales.md) | 14443 · 7810 · 10373 |
| BLINK-DOC-15 | [Auditoría de datos, limpieza y cierre del ciclo de recarga](15-auditoria-y-limpieza.md) | 27001 A.8.10 · 12207 |
| BLINK-DOC-16 | [Cumplimiento de la especificación offline y del cobro MIFARE](16-especificacion-offline.md) | 14443-3 · 27001 |
| BLINK-DOC-17 | [Interfaz del validador y códigos de respuesta POS](17-interfaz-y-codigos-pos.md) | 9241 · 8583 · 26514 |
| BLINK-DOC-18 | [Interfaz datáfono 240×240 (ISO-UI-240-REV2)](18-interfaz-datofono-240.md) | 9241-3 · 25010 · 26514 |
| BLINK-DOC-19 | [Motor tarifario y recarga por pasajes](19-motor-tarifario-y-recarga-por-pasajes.md) | 29148 · 25010 · 9241-210 · 20022 |
| BLINK-DOC-20 | [Términos legales y cumplimiento tarifario](20-terminos-legales-y-cumplimiento.md) | 29148 · 25010 · 9241-210 |
| BLINK-DOC-21 | [Usabilidad de la vinculación Wi-Fi del validador](21-usabilidad-vinculacion-wifi.md) | 9241-11 · 9241-110 · 9241-210 · 25010 · 26514 |
| — | [CHANGELOG](../CHANGELOG.md) | Keep a Changelog 1.1.0 + SemVer |

## 4. Convenciones de esta suite

- **Idioma:** español (es-VE), con identificadores de código en inglés cuando ya
  existen en la base (`cards`, `accounts`) y en español cuando son nuevos.
- **Fechas:** ISO 8601 (`AAAA-MM-DD`) en documentos y `AAAA-MM-DD HH:MM` en logs.
- **Versiones:** SemVer 2.0.0. Un cambio incompatible en RPC o esquema obliga a
  subir la versión mayor del producto afectado y a registrar la migración.
- **Referencias cruzadas:** rutas relativas dentro de esta carpeta; enlaces
  absolutos solo a recursos externos estables.
- **Secretos:** ningún documento contiene claves, tokens ni contraseñas. Se indica
  **dónde** vive cada secreto y **quién** debe rotarlo (ver BLINK-DOC-05).

## 5. Control de cambios documental

| Versión | Fecha | Cambio | Autor |
| --- | --- | --- | --- |
| 1.0.0 | 2026-10-29 | Creación de la suite completa tras el despliegue de la cuenta multi-tarjeta. | Equipo BLINK |
| 1.1.0 | 2026-10-29 | Aprovisionamiento en lote (FABRICADA), estación de asignación, bitácora y purga archivada. | Equipo BLINK |
| 1.1.1 | 2026-10-29 | 0006 aplicada en producción; DOC-03/06/07/09 pasan a 1.1.1 con el estado verificado. | Equipo BLINK |
| 1.2.0 | 2026-10-29 | Back-office separado (repo `BACKOFFICE`) con RBAC y TOTP; migraciones 0007 y 0008 aplicadas; suite pasa a 1.2.0. | Equipo BLINK |
| 1.3.0 | 2026-10-30 | Nuevo BLINK-DOC-11: checklist de rotación de claves, inventario de secretos y verificación. | Equipo BLINK |
| 1.4.0 | 2026-10-30 | Nuevo BLINK-DOC-12: enrolado de lotes y tarjeta maestra; serie de 7 dígitos (`23-1-0000001-9`) con migración 0009. | Equipo BLINK |
| 1.5.0 | 2026-10-30 | BLINK-DOC-12 pasa a 2.0.0 con el estándar de producción del propietario; migración 0010 y serial maestro `00-0-0000000-0`. | Equipo BLINK |
| 1.5.1 | 2026-10-31 | Revisión de seguridad del portal sin conexión: caducidad de la copia local, service worker acotado a su caché y ámbito; DOC-09 pasa a 1.5.0 con R-10, R-11 y D-09. | Equipo BLINK |
| 1.5.2 | 2026-10-31 | Ciclo completo de la recarga: bandeja, aprobación/rechazo, entrega al chip y verificación (DOC-06 §5.6 y DOC-08 §5.1). | Equipo BLINK |
| 1.6.0 | 2026-10-31 | Retiro de BLINK PASAJES y redirección de `pasajes.blink.com.ve` a TARJETA; alcance reducido a TARJETA + BACK-OFFICE con el panel fiscal como próximo hito; consolidación local en `~/BLINK`; simulación completa del flujo (DOC-06 §5.7 y DOC-07 §4.3) y marca TARJETA sin referencias al panel retirado. | Equipo BLINK |
| 1.7.0 | 2026-10-31 | Nuevo BLINK-DOC-15: auditoría de RLS, integridad y datos placeholder, purga archivada del vehículo demo y cierre del ciclo de recarga con la prueba física de la maestra; DOC-07 §4.4 y DOC-09 1.7.0. | Equipo BLINK |
| 1.8.0 | 2026-10-31 | Nuevo BLINK-DOC-16: cobro repetido por tarjeta (Crypto1), Read-After-Write, estado incierto, contador del chip (`0017`) y desviaciones razonadas de la especificación externa (ADR-09 a ADR-11). | Equipo BLINK |
| 1.9.0 | 2026-10-31 | Nuevo BLINK-DOC-17: códigos de respuesta POS (`ISO-00`/`ERR-xx`) e iconos en el validador (firmware 7), campo `codigo=` en `TAP` y respuesta adaptada al panel de 240×240 (ADR-12 y ADR-13). | Equipo BLINK |
| 1.10.0 | 2026-10-31 | Nuevo BLINK-DOC-18: interfaz datáfono `ISO-UI-240-REV2` (firmware 8) con resultado a pantalla completa 2,5 s / 3,0 s, banda amarilla offline, renderizado medido en 39–40 ms, ADR-14 y ADR-15; DOC-02, DOC-07, DOC-09 y DOC-17 actualizados. | Equipo BLINK |
| 1.11.0 | 2026-11-01 | Bandeja de recargas en el back-office (migración `0018`, `bt_admin_recargas` y `bt_admin_resolver_recarga` con sesión + MFA); B-04 cerrada; DOC-01, DOC-02, DOC-04, DOC-06, DOC-07, DOC-08 y DOC-10 actualizados. | Equipo BLINK |
| 1.12.0 | 2026-11-01 | Nuevo BLINK-DOC-19: motor tarifario por pasajes (migraciones `0019` y `0020`, `bt_recargar_pasajes`, desglose contable y ADR-16 a ADR-20); el portal deja de aceptar montos libres; B-27 a B-31 abiertas; DOC-01 a DOC-10 actualizados. | Equipo BLINK |
| 1.13.0 | 2026-11-01 | Nuevo BLINK-DOC-20: términos `LEG-TER-001` en el portal, separación entre pasaje y tasa administrativa en el recibo, veredicto de la Gaceta 43.335 y hallazgo B-32 (500 Bs frente a la referencia nacional de 100 Bs), más B-33 (descuentos no implementados) y R-14/R-15; ADR-21 a ADR-23; DOC-01, DOC-02, DOC-07, DOC-08 y DOC-09 actualizados. | Equipo BLINK |
| 1.14.0 | 2026-11-01 | Firmware 9: configuración del Wi-Fi del validador desde el teléfono (AP `BLINK-XXXX` + portal cautivo en 192.168.4.1, ventana de 5 minutos); B-29 cerrada y R-16 abierta; DOC-06 §6.1, DOC-07 §4.11, DOC-08 §2.2, DOC-18 §4.3 y DOC-09 1.10.0. | Equipo BLINK |
| 1.15.0 | 2026-11-01 | El validador arranca la ventana de configuración con un **código QR** (`WIFI:T:nopass;S:BLINK-XXXX;P:;;`) y solo muestra las instrucciones cuando detecta un teléfono unido; sin cabecera de BLINK ni tarifa. DOC-06 §6.1 y nuevo §6.2, DOC-07 §4.11 (pruebas 12–16), DOC-08 §2.2 y DOC-18 §4.3. | Equipo BLINK |
| 1.16.0 | 2026-11-01 | Nuevo BLINK-DOC-21: usabilidad ISO de la vinculación Wi-Fi (9241-11/110/210, 25010, 26514), flujo de tres pasos con lista automática, espera de 25 s, resultado y reintento sin reiniciar (ADR-24 a ADR-26); pantallas CONECTANDO/CONECTADA/NO SE PUDO CONECTAR y corrección del falso positivo; B-34 y B-35; DOC-06, DOC-07, DOC-08, DOC-09 y DOC-18 actualizados. | Equipo BLINK |
| 1.17.0 | 2026-11-02 | Auditoría completa de firmware, TARJETA, BACK-OFFICE y documentación: trece defectos de firmware corregidos (B-36 a B-48), siete riesgos nuevos (R-17 a R-23), ocho brechas de las aplicaciones (B-49 a B-56) y quince desajustes documentales corregidos (DOC-01, DOC-02, DOC-03, DOC-04, DOC-06, DOC-09, DOC-14, DOC-18, DOC-21, DOC-00, README del back-office y firmware); compilación 1 279 639 B (97 %) y verificación en hardware del portal de configuración. | Equipo BLINK |
| 1.18.0 | 2026-11-02 | El validador pasa a la partición de 3 MB (`PartitionScheme=huge_app`, sin OTA): el binario de 1 279 655 B baja del 97 % al 40 % y deja ~1,8 MB para GPS, batería, zumbador y futuras funciones. La NVS en `0x9000` conserva red, token y colas; DOC-06, DOC-07, DOC-18 y DOC-21 actualizados con los comandos y el porcentaje real. | Equipo BLINK |

Reglas de mantenimiento:

1. Todo cambio de esquema o de contrato RPC actualiza BLINK-DOC-03 y BLINK-DOC-04
   **en el mismo commit** que la migración.
2. Todo cambio visible para el usuario añade una entrada en `CHANGELOG.md`.
3. La revisión completa de la suite se hace al cerrar cada hito y, como mínimo,
   una vez por trimestre.

## 6. Glosario

| Término | Definición |
| --- | --- |
| **ID BLINK** | Serial visible con verificador Luhn mod 23: `AGE-#####-###-L` (`G-00001-001-N`). La tarjeta del propietario es la Alfa `A-00000-000-H`; la serie numérica heredada (`23-1-000001-9`) solo se lee. |
| **Cuenta** | Identidad del pasajero (cédula, PIN, Pago Móvil) que puede tener N tarjetas. |
| **Billetera** | Conjunto de tarjetas activas de una cuenta. |
| **Validador** | Dispositivo ESP32 + RC522 que cobra el pasaje y sincroniza con la nube. |
| **Lector** | Puente ESP32 que lee el UID del chip por Web Serial; lo usan la estación del back-office y el firmware del validador. Ya no existe como módulo web propio. |
| **Redirección** | Sitio estático `PASAJES-REDIRECT` que recibe `pasajes.blink.com.ve` y lleva a `blink-servers.github.io/TARJETA/` conservando el ancla de la URL. |
| **Simulación** | Entorno local con PostgreSQL 16 + PostgREST + nginx que reproduce el contrato RPC para probar el flujo completo sin tocar producción. |
| **RPC** | Función PostgreSQL expuesta por PostgREST (`POST /rest/v1/rpc/<nombre>`). |
| **RLS** | Row Level Security: política de filas de PostgreSQL. |
| **Pago Móvil** | Transferencia bancaria venezolana que el pasajero reporta y un admin aprueba. |
| **Bandeja de recargas** | Pantalla del back-office que lista los Pago Móvil pendientes y permite aprobarlos o rechazarlos con sesión y TOTP. |
| **Back-office** | Consola administrativa separada del portal; exige rol `ADMIN`/`TAQUILLA` y TOTP. |
| **TOTP** | Código de 6 dígitos cada 30 s (RFC 6238); BLINK lo verifica en la base, no en el navegador. |
