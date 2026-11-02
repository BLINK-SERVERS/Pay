# Registro de riesgos, brechas y deuda técnica

| Campo | Valor |
| --- | --- |
| Código | BLINK-DOC-09 |
| Versión | 1.12.0 |
| Fecha | 2026-11-02 |
| Estado | Vigente |
| Normas | ISO/IEC/IEEE 12207 (riesgos) · ISO/IEC 27001 (A.5.7) |

Escalas: probabilidad e impacto **A**lta / **M**edia / **B**aja. Estado:
**Abierto**, **Mitigado**, **Aceptado**.

## 1. Riesgos de seguridad

| ID | Riesgo | Prob. | Impacto | Mitigación | Estado |
| --- | --- | --- | --- | --- | --- |
| R-01 | Contraseña de PostgreSQL compartida en chat y reutilizada. | A | A | Rotar en el panel de Supabase; guardar solo en el gestor de secretos; actualizar los scripts de operación. | **Abierto** (tarea #29) |
| R-02 | Tokens de GitHub, Cloudflare y Supabase pegados en conversaciones. | A | A | Rotar y revocar los anteriores; activar 2FA. | **Abierto** |
| R-03 | Sin 2FA obligatorio en la organización. | M | A | Exigir 2FA a todos los miembros. | **Abierto** |
| R-04 | Repositorios públicos con historial de configuración. | B | M | Revisar que solo haya claves publishable; nunca commitear `.env`. | **Mitigado** |
| R-05 | Un mismo proyecto Supabase aloja comercio y transporte. | M | A | RLS estricto y dominios sin FK cruzadas; evaluar proyecto separado si crece. | **Aceptado** |
| R-06 | `bt_registrar` no tiene límite por IP (solo unicidad). | M | M | Añadir rate limiting en PostgREST/Cloudflare o captcha. | **Abierto** |
| R-07 | PIN de 6 dígitos de baja entropía protege la cuenta `ADMIN`. | M | A | Segunda capa implementada: TOTP RFC 6238 obligatorio en las RPC de inventario (0007). Falta que el operador inscriba su dispositivo. No reutilizar el PIN de arranque. | **Mitigado** (inscripción pendiente) |
| R-08 | Pérdida del teléfono del operador: el segundo factor solo se reinicia desde SQL. | B | M | Procedimiento documentado (BLINK-DOC-06 §5.5); añadir una RPC de reinicio asistido con doble aprobación. | **Aceptado** |
| R-09 | Si un secreto TOTP se muestra en una captura o chat, el factor queda expuesto. | B | M | Se reinicia la inscripción (invalida el secreto) y se considera expuesto. | **Mitigado** |
| R-10 | El modo sin conexión guarda en el teléfono datos personales (nombre, cédula, teléfono, correo, datos de pago) y el token de sesión en `localStorage`; un XSS o un equipo desbloqueado los expone. | M | A | Copia de solo lectura, sin capacidad de escritura ni claves de servicio; caduca a las 12 h de la última sincronización, rechaza fechas futuras y se borra al salir, al expirar la sesión o si el servidor la rechaza. Falta cifrado con WebCrypto atado al PIN y CSP (L-03). | **Mitigado** (residual aceptado) |
| R-11 | El service worker comparte origen con las demás publicaciones de GitHub Pages; una limpieza o un ámbito amplios podrían tocar o leer cachés ajenas. | B | M | Borra solo cachés con prefijo `blink-tarjeta-`, valida origen y ámbito de los mensajes, solo cachea recursos estáticos dentro de `/TARJETA/` y las respuestas de API quedan fuera. | **Mitigado** |
| R-12 | Cambiar `settings.publico.tarifario` altera el precio de las recargas nuevas sin aviso al pasajero. | M | M | Cada recarga guarda una copia del tarifario; publicar cambios con nota operativa y revisar la bandeja. | **Abierto** |
| R-13 | El excedente de redondeo se guarda por recarga pero no se concilia contra una cuenta contable. | B | M | Sumarlo en el cierre diario antes de tratarlo como ingreso; no hay cuenta de destino en el esquema. | **Abierto** |
| R-14 | Publicar los términos con una tarifa que no está homologada por la autoridad municipal expone a observaciones por cobro indebido o por publicidad engañosa, y a la obligación de devolver la diferencia si la alcaldía fija otro monto. | M | A | Los términos declaran que la tarifa la homologa el municipio (art. 178.2 CRBV), muestran el monto vigente tomado de la tarjeta y no lo presentan como tarifa nacional oficial; la Gaceta 43.335 se cita como referencia y exhorto. Falta obtener el decreto o acta de homologación (B-32) antes de operar con público. | **Abierto** |
| R-15 | La hoja legal es un resumen operativo redactado por el equipo, no una pieza revisada por un abogado; puede omitir requisitos de la Ley de Protección al Consumidor, de precios justos o de protección de datos. | M | M | Se limita a describir lo que el sistema hace (debitado exacto, desglose del recibo, uso de datos) y remite a la normativa; falta revisión legal externa antes de la impresión masiva de tarjetas (B-33). | **Abierto** |
| R-16 | El punto de acceso de configuración del validador (firmware 9) es abierto: cualquiera al alcance puede unirse durante la ventana de 5 minutos, cambiar la red guardada y dejar la unidad sin sincronización, o suplantar la red que el chofer cree estar eligiendo. | M | M | La ventana solo se abre sin credenciales (2 s) o cuando la red guardada no aparece (20 s) y no se reabre sola en el arranque; la página no imprime el token ni permite leerlo, y la sincronización va por HTTPS con validación de certificado. Mitigación pendiente: clave WPA2 impresa en la unidad o botón físico para abrirla. | **Abierto** |
| R-17 | El código TOTP del back-office no tiene límite de intentos: `bt_admin_entrar` bloquea el PIN a los 5 fallos, pero un TOTP erróneo devuelve `error: mfa` sin incrementar `intentos` ni `bloqueado_hasta`. Con el PIN correcto se pueden probar códigos de 6 dígitos sin límite. | M | A | Contar también los fallos de TOTP por cuenta, bloquear con la misma política del PIN y registrar el evento (BLINK-DOC-06 §5.5). | **Abierto** |
| R-18 | «Salir» del back-office solo borra la sesión del navegador: no existe RPC de cierre y el token de `admin_sessions` sigue válido hasta expirar. | M | M | Añadir `bt_admin_salir(p_token)` (como `bt_salir` del portal), llamarla antes de borrar y acortar la vida del token. | **Abierto** |
| R-19 | `bt_admin_mfa_inscribir` regenera el secreto TOTP con solo el token de sesión: no pide el código actual ni el PIN. Un token robado permite sustituir el segundo factor y quedarse con la cuenta. | B | A | Exigir el TOTP vigente (o PIN + confirmación) cuando `totp_activo` ya está activo. | **Abierto** |
| R-20 | La cédula se normaliza a solo dígitos (`cedula_digitos`) y el índice único no distingue la letra: `V-12345678` y `E-12345678` colisionan y la segunda cuenta no se puede registrar. | M | M | Incluir la letra normalizada en la clave única o validar el tipo antes de insertar. | **Abierto** |
| R-21 | El contador de intentos de PIN se lee y se escribe sin bloquear la fila: dos intentos simultáneos pueden perder incrementos y alargar un ataque de fuerza bruta. | B | M | Usar `select … for update` o un `update … returning` atómico. | **Abierto** |
| R-22 | Los CSV exportados por el back-office no neutralizan celdas que empiezan por `=`, `+`, `-` o `@`: un titular o serial malicioso se ejecuta como fórmula al abrir el archivo en Excel o LibreOffice. | B | M | Prefijar un apóstrofo a esas celdas en `descargarCsv` y añadir una prueba. | **Abierto** |
| R-23 | TARJETA y BACK-OFFICE se publican bajo el mismo origen `*.github.io`: `localStorage`, cookies y el service worker son compartidos. Una inyección o un recurso comprometido en una aplicación alcanza la sesión guardada de la otra. | M | M | Publicar cada aplicación en un subdominio propio o aislar la sesión y el almacenamiento (amplía R-11). | **Abierto** |

## 2. Brechas funcionales frente al diseño técnico

La fuente de verdad es `Documentación Técnica del Ecosistema Blink Pasajes`
(2026-10-29), conservada en `~/BLINK/documentacion/fuentes/`. Estado de
implementación:

| ID | Brecha | Impacto | Notas |
| --- | --- | --- | --- |
| B-01 | ~~Mapa de memoria MIFARE por sectores y claves diversificadas `HMAC_SHA256(master, UID)` no implementado.~~ | — | **Cerrada** el 2026-10-31: identidad v3 en el sector 1, saldo y contador en el 2, telemetría en el 3, llaves derivadas por tarjeta; probado con la maestra (BLINK-DOC-16 §3). |
| B-02 | Lista negra offline en el validador: descarga implementada, prueba física pendiente. | M | El 2026-10-31 se probaron físicamente el enrolado y el cobro; falta bloquear una tarjeta y confirmar que el validador la rechaza sin red (BLINK-DOC-15 §8.4). |
| B-03 | ~~BLINK PASAJES opera en local, sin RPC `bt_*`.~~ | — | **Cerrada** el 2026-10-31: el panel se retiró; el flujo pasó al portal y al back-office. |
| B-04 | ~~Aprobación de recargas sin bandeja en el back-office: se resuelve con RPC de servicio (`bt_recargas_pendientes`/`bt_aprobar_recarga`).~~ | — | **Cerrada** el 2026-11-01: pantalla **Recargas** del back-office con sesión y segundo factor (migración `0018`); aprobar pide confirmación, rechazar exige motivo y la fila se bloquea antes de resolver. Publicada en Pages ese mismo día (back-office 1.2.0). |
| B-05 | Recuperación de PIN inexistente en el portal. | M | Requiere flujo de atención o verificación por correo. |
| B-06 | Telemetría fiscal sin exportación oficial (GTFS/CSV). | B | El módulo Fiscal muestra totales, no descarga. |
| B-07 | Estación de enrolado: la carga masiva UID↔serial existe en `0006` y su interfaz en el back-office (`BACKOFFICE`), falta el circuito físico completo con la placa. | M | El grabado del chip funciona por la consola serie (prueba real del 2026-10-31); falta conectarlo a la interfaz web. |
| B-08 | Sin notificaciones al pasajero (correo/SMS) al aprobar recargas. | B | El correo se captura pero no se usa. |
| B-09 | Firmas HMAC de peticiones no aplicadas en el portal. | B | Se reservan para servidor-a-servidor: la clave pública vive en el navegador (ver BLINK-DOC-05 §4). |
| B-10 | Sin verificación automatizada de TLS 1.3 en las publicaciones. | M | GitHub Pages no permite fijar la versión; revisar trimestralmente con `openssl s_client`. |
| B-11 | Argon2id no disponible en el `pgcrypto` de Supabase. | B | Se usa bcrypt costo 10 con bloqueo por intentos; revisar si el proveedor habilita Argon2. |
| B-12 | Reclamo solo por serial: sin código de activación por tarjeta. | M | Añadir un segundo factor impreso o activación asistida en taquilla para lotes grandes (SEC-06). |
| B-13 | El back-office no tiene recuperación de TOTP ni gestión de operadores en la interfaz. | B | Alta y reinicio de operadores por SQL; evaluar pantalla de cuentas para rol `ADMIN`. |
| B-14 | La estación web no graba el chip: solo registra UID↔serial; la escritura del bloque de identidad y de las llaves se hace por la consola serie (`ENROLAR`). | A | Impide operar la distribución pre-enrolada solo con el back-office (BLINK-DOC-12 §10). |
| B-15 | Sin cola secuencial, *tap & next* ni punto de control anti-desfase en la estación. | M | El enrolado de 1000 tarjetas obliga a tipear o escanear cada serial; riesgo de desfase de pila. |
| B-16 | Sin carga de artes ni paquete de producción (ZIP VDP y PDF/VT): hoy el generador entrega CSV y hoja A4. | M | La imprenta recibe el material por fuera del sistema y el CSV no trae `orden_impresion`, `lote_id` ni `patrocinante`. |
| B-17 | La estación no está reservada al propietario: `bt_admin_sesion_mfa` admite ADMIN y TAQUILLA. | M | Contradice la exclusividad de la estación que exige BLINK-DOC-12 §1. |
| B-18 | Panel de fiscales inexistente: la telemetría y la liquidación solo se consultan por SQL. | M | Próximo hito; aún sin repositorio. |
| B-19 | La simulación no corre en CI: se ejecuta a mano en el equipo de desarrollo. | M | Ver D-10; bloquea detectar regresiones del contrato en cada push. |
| B-20 | `settings.publico` conserva el Pago Móvil de ejemplo (RIF `J-00000000-0`, teléfono `0414-0000000`, titular «BLINK PASAJES, C.A.»). | A | Un pasajero real vería datos bancarios falsos. El dueño debe cargar el RIF, teléfono y titular definitivos (BLINK-DOC-15 §6). |
| B-21 | No hay caducidad de recargas pendientes ni trabajo programado; `pg_cron` no está instalado. | M | Una recarga sin revisar queda pendiente indefinidamente. Aplicar la política de rechazo por antigüedad (BLINK-DOC-15 §9, F-04). |
| B-22 | Las tarjetas con estado incierto solo se desbloquean por consola serie (`LIMPIAR_INCIERTAS`); no hay comando en el back-office ni reporte en la nube. | M | Un operador sin acceso al puerto serie no puede habilitar la tarjeta ni enterarse del incidente (BLINK-DOC-16 §4.3). |
| B-23 | Falta inyectar un fallo real de escritura para comprobar el flujo `VERIFICAR` y la lista `inciertas`; el tiempo de cobro completo no se ha medido. | M | La protección existe pero no está validada con hardware; la especificación pide 0,3–0,6 s (BLINK-DOC-16 §8). |
| B-24 | Los códigos POS (`ISO-00`/`ERR-xx`) solo viven en el firmware y en la serie: no se guardan ni se cuentan en la nube. | B | No se puede medir cuántos rechazos por saldo, llave o bloqueo ocurren por unidad (BLINK-DOC-17 §9). |
| B-25 | La cabecera azul con texto blanco de 6×8 px queda en 3,5:1 y el título blanco sobre verde en 2,2:1, por debajo del 4,5:1 de ISO 9241 para texto pequeño; además falta probar la legibilidad a plena luz. | M | La especificación impone esos colores; los importes ya usan tinta oscura. Validar con el operador y, si hace falta, aclarar el azul o agrandar el texto de la cabecera (BLINK-DOC-18 §10). |
| B-26 | El reloj SPI de la pantalla se subió a 40 MHz por medición de tiempo; no se validó la integridad de señal ni la estabilidad térmica de la unidad. | B | Si aparecen píxeles sueltos, volver a 24 MHz deja el resultado en 63 ms y rompe el límite de 50 ms (BLINK-DOC-18 §12). |
| B-27 | `bt_recargar` legado sigue abierto a `anon` y acepta montos libres sin desglose. | M | Compatibilidad con clientes que tengan el service worker anterior en caché; retirar cuando el parque actualice (BLINK-DOC-19, ADR-20). |
| B-28 | Sin token ring offline firmado: la recarga aprobada espera la sincronización del validador. | A | Un pasajero que recarga y aborda antes de que su unidad sincronice puede no tener saldo aunque la nube ya lo acreditó (BLINK-DOC-19 §9). |
| B-29 | ~~Sin portal cautivo; la red del validador se configura en el firmware.~~ **Cerrada el 2026-11-01 con el firmware 9**: el validador levanta un AP temporal y una página de configuración desde el teléfono (BLINK-DOC-06 §6.1, BLINK-DOC-07 §4.11). | B | Queda R-16: el AP es abierto durante la ventana de 5 minutos. |
| B-30 | Sin app nativa, mapa ni GTFS; el portal es web y no hay capa geográfica. | B | El estándar de rutas de la especificación de arquitectura no está implementado (BLINK-DOC-19 §9). |
| B-31 | Batería Li-Po 2000 mAh, TP4056, buzzer y autonomía no validados en la unidad física. | M | Falta la prueba de campo antes de operación continua (BLINK-DOC-19 §9). |
| B-32 | No hay decreto, ordenanza ni acta municipal que homologue los Bs 500 por pasaje; la Gaceta Oficial N.º 43.335 fija una referencia nacional de Bs 100 para el pasaje urbano y exhorta a las alcaldías a armonizar. | A | La tarifa aplicada y acreditada sigue siendo la de la tarjeta (hoy Bs 500) y los términos lo declaran así, sin llamarla oficial nacional; el propietario debe aportar el instrumento municipal que la respalde o ajustar `settings.publico.tarifario.base` (BLINK-DOC-20 §3, R-14). |
| B-33 | La Gaceta 43.335 prevé gratuidad (mujeres ≥ 50, hombres ≥ 60, personas con discapacidad), 50 % para estudiantes y 20 % en feriados; ninguna de esas reglas existe en el tarifario ni en el validador. | M | Todo pasajero paga la tarifa plena; aplicar los descuentos exige categoría verificable en la tarjeta o en la cuenta, reglas en `bt_cotizar_recarga` y en el chip, y no está aprobado como alcance (BLINK-DOC-20 §3, R-15). |
| B-34 | La vinculación Wi-Fi se verificó en banco con un hotspot de portátil y un navegador de escritorio, pero no con choferes reales ni con el navegador de un teléfono; no hay datos de eficacia, tiempo de tarea ni satisfacción. | M | El protocolo de medición está listo (BLINK-DOC-21 §10): 5–8 choferes, tres tareas, SUS ≥ 75. Ejecutarlo antes de la producción en serie y ajustar textos u objetivos con el resultado. |
| B-35 | La vinculación declara éxito con el enlace asociado (`WL_CONNECTED`), no con Internet alcanzable: un hotspot sin datos deja la unidad «conectada» y sin subir cobros, y la banda amarilla no aparece porque solo mira el enlace. | M | El comportamiento está documentado (BLINK-DOC-21 §12); los cobros quedan en local y suben cuando vuelva la red. Una sonda HTTP de salud queda fuera de este cambio. |
| B-36 | Las listas de bloqueadas e inciertas se vaciaban completas al llegar al tope: `contarLineas` se recalculaba sobre la NVS, que no cambiaba, y el `while` borraba entradas hasta dejar una. Además no se comprobaba el resultado de `putString`. | A | **Corregida** el 2026-11-02 (firmware 9, revisión de auditoría): se cuenta sobre la copia local, se conservan las más recientes y se registra `ALMACEN,error=…-nvs` si la escritura falla. Verificado en compilación y arranque; la prueba física de bloqueo sigue en B-02. |
| B-37 | Al confirmar la subida, el validador borraba `enviados` entradas del ring en vez de `totalLog`: si el POST incluía un log que no se pudo escribir, quedaba una entrada fantasma y la cola se atascaba o perdía cobros. | A | **Corregida**: solo se llama `confirmarLog(totalLog)` cuando el POST responde 200. |
| B-38 | La sincronización HTTPS corre dentro de `loop()` y puede bloquearlo hasta ~27 s (conexión, TLS y POST): durante ese tiempo no se leen tarjetas ni responde la página del portal. | M | **Mitigada**: se omite mientras la ventana de configuración está abierta (`portalAbierto()`). Fuera del portal sigue bloqueando; pasar la subida a una tarea o a un cliente asíncrono. **Abierta**. |
| B-39 | Comparaciones de `millis()` sin aritmética modular: tras 49,7 días la ventana del AP no cerraba y las credenciales pendientes no se aplicaban; además `cerrarEn` podía vencer antes de nacer. | M | **Corregida**: `(long)(millis() - t) >= 0` en `atenderPortal`, `cerrarPortal` y `aplicarPendiente`. |
| B-40 | El barrido `/redes` desconectaba la estación y, si no encontraba redes, no reanudaba el intento de enlace: la página quedaba en «conectando» hasta el fallo aunque la red guardada fuera válida. | M | **Corregida**: recuerda si estaba conectada, reintenta el barrido tras `disconnect()` y reanuda `WiFi.begin` con la red elegida. Verificado en banco: `/redes` respondió con la lista completa sin tumbar el portal. |
| B-41 | Si fallaba la lectura del contador, se asumía 0 y el cobro se marcaba «incierto» aunque el chip se hubiera debitado; la tarjeta quedaba retenida para el usuario. | M | **Corregida**: devuelve `tiempo` si fue timeout o `valor` si el bloque no se pudo leer; no se escribe ni se cobra a ciegas. |
| B-42 | El CRC-8 se comprobaba antes de distinguir la versión del bloque: las tarjetas v1/v2 (sin CRC) se rechazaban como corruptas. | A | **Corregida**: solo se valida en v3 (`bloque[14] == 3`); v1/v2 se siguen leyendo. |
| B-43 | `pantallaTarjeta()` repintaba la franja sobre las vistas de configuración Wi-Fi, enrolado y armado, rompiendo el QR o los pasos hasta el siguiente cambio de vista. | M | **Corregida**: solo dibuja si la vista no es COBRO, RECHAZO, CONFIG, ARMADO o ENROLADA. |
| B-44 | El último fix GPS no caducaba: si el módulo se desconectaba, se seguían reportando coordenadas viejas como actuales en cada cobro. | M | **Corregida**: el fix vale 10 s (`GPS_FIX_MS`); después `latitud()` y `longitud()` devuelven 0. |
| B-45 | La búsqueda de seriales en las listas usaba subcadenas (`indexOf(serial + "\n")`): un serial corto casaba dentro de otro y bloqueaba una tarjeta válida. | A | **Corregida**: `contieneLinea()` compara la línea completa. |
| B-46 | `cerrarPortal()` descartaba la red pendiente si el chofer pulsaba «Terminar» en los 800 ms posteriores a Guardar. | M | **Corregida**: aplica la pendiente antes de apagar el AP. |
| B-47 | `Serial.readStringUntil` sin límite bloqueaba `loop()` hasta 1 s por carácter ausente y aceptaba líneas de longitud ilimitada. | M | **Corregida**: `Serial.setTimeout(50)` y rechazo de líneas de más de 160 caracteres con `ERROR,comando=largo`. |
| B-48 | Sin GPS ni NTP se escribía el uptime como epoch en el chip y en la telemetría, produciendo fechas de 1970 indistinguibles de un reloj real. | B | **Corregida**: se escribe 0 y la nube decide. |
| B-49 | El bloque de integridad (CRC-16 de ID + saldo + contador) se escribe al cobrar, pero no se lee ni se verifica en el siguiente toque; solo se comprueba el CRC-8 de identidad. | M | **Abierta**: verificar el bloque y marcar `corrupta` o `valor` si no coincide (BLINK-DOC-16 §3). |
| B-50 | El back-office ignora las líneas `ERROR,*` del lector: si `ENROLAR` falla, la estación sigue como si hubiera armado y la siguiente tarjeta no se graba. | M | **Abierta**: mapear `ERROR` a un aviso y detener la secuencia (`backoffice/src/lib/serial.ts`, `Estacion.tsx`). |
| B-51 | La exportación CSV de inventario usa solo la página visible de 300 tarjetas: si hay más, el archivo queda incompleto aunque la pantalla avise «se listan hasta 300». | M | **Abierta**: exportar por tandas o generar el archivo en el servidor. |
| B-52 | La estación no envía `ENROLAR_OFF` al desmontar la vista ni al cerrar sesión; solo al pulsar «Desconectar» o «Detener». Si el operador navega, el lector sigue armado hasta que vence la ventana. | B | **Abierta**: limpieza en `useEffect` y antes de `salir`. |
| B-53 | El arranque del portal espera `bt_ajustes` sin timeout; con la red colgada no se muestra nada aunque exista copia offline válida. Si falla, usa `AJUSTES_POR_DEFECTO` en silencio, incluido el Pago Móvil de ejemplo (B-20). | M | **Abierta**: timeout de 3–5 s, arrancar con la copia y marcar «datos de ejemplo». |
| B-54 | Las llamadas `fetch` del back-office no tienen timeout ni aborto; un 401/403 se trata como «permiso» y no como sesión vencida, y `response.json()` de una respuesta 200 vacía lanza un error no tipado. | B | **Abierta**: `AbortController`, mapear 401 a `sesion` y validar el cuerpo antes de convertirlo. |
| B-55 | `bt_recargar_pasajes` acepta tarjetas `BLOQUEADA` o `VENCIDA` de la cuenta: `bt_tarjeta_de_cuenta` solo filtra por dueño. Se puede reportar una recarga para un plástico bloqueado. | M | **Abierta**: rechazar estados no operativos en la RPC; hoy solo la aprobación manual puede frenarla. |
| B-56 | El texto de Pago Móvil sugiere `tarifa × 10` sin gross-up: no incluye comisión de entrada, provisión de salida ni margen, así que el pasajero transfiere menos de lo que exige una recarga de 10 pasajes. | M | **Abierta**: calcular con `cotizarRecarga(10, ajustes)` y acotar al tope (`App.tsx:332`). |

## 3. Deuda técnica

| ID | Deuda | Consecuencia | Prioridad |
| --- | --- | --- | --- |
| D-01 | Dos implementaciones del mismo contrato (`local.ts` y `nube.ts`). | Un cambio debe replicarse en ambas. | Alta |
| D-02 | Funciones legadas (`bt_activar`, `bt_tarjeta`, `card_sessions`). | Superficie de ataque y confusión. | Media |
| D-03 | Firmware del **lector** fuera de git (`~/Arduino`). El validador ya tiene repositorio propio en `~/BLINK/firmware/validador`. | Se pierde el lector si falla el equipo. | Alta |
| D-04 | Sin E2E en CI. | Regresiones detectadas tarde. | Media |
| D-05 | Sin alertas de recargas pendientes ni validadores caídos. | Operación a ciegas. | Media |
| D-06 | Pruebas de integración se hacen contra producción con rollback. | Riesgo de dejar datos si falla a mitad. | Media |
| D-07 | Prettier no corre en CI (el CSS actual no está formateado). | Ruido en diffs. | Baja |
| D-08 | `VITE_SUPABASE_ANON_KEY` guarda una clave publishable (nombre heredado). | Confusión al rotar. | Baja |
| D-09 | La copia sin conexión no se cifra con WebCrypto ni se ata al PIN. | Un XSS o un teléfono desbloqueado puede leer los datos mientras la copia viva (12 h). | Media |
| D-10 | La simulación local no está integrada al CI y depende de `docker-compose` v1. | El contrato RPC se prueba a mano; un cambio puede llegar a `main` sin pasar por el flujo completo. | Media |
| D-11 | La aprobación de recargas no verifica que exista su movimiento y la sincronización de toques no usa `ON CONFLICT`. | Una recarga podría acreditarse sin historial y dos sincronizaciones simultáneas podrían abortar el lote (BLINK-DOC-15 §9, F-01/F-02). | Media |
| D-12 | `trips_telemetry.chip_counter` se guarda pero no se compara con la secuencia esperada por tarjeta. | La detección de replay o de un contador retrocedido es manual; falta una consulta o alerta automática (BLINK-DOC-16 §5.3). | Media |
| D-13 | La fórmula tarifaria vive en dos lenguajes (`tarifa.ts` y `bt_cotizar_recarga`). | Una divergencia haría que la vista previa no coincida con lo guardado; el servidor manda, pero el pasajero vería otro monto. | Media |

## 4. Limitaciones conocidas de la plataforma

| ID | Limitación | Efecto |
| --- | --- | --- |
| L-01 | Web Serial solo existe en Chromium de escritorio. | El lector no funciona en móvil ni en Safari/Firefox. |
| L-02 | El host directo de Supabase es IPv6. | Hay que usar el pooler desde redes IPv4. |
| L-03 | GitHub Pages no permite cabeceras personalizadas. | No se pueden añadir CSP/HSTS propios en TARJETA/BACKOFFICE ni en la redirección. |
| L-04 | Pages sirve con base `/TARJETA/`; mover a subdominio exige compilar en la raíz. | Cambio de `base` y de `vite.config.ts` si se decide `tarjeta.blink.com.ve`. |
| L-05 | La tarjeta Alfa se crea por consola (`bt_crear_tarjeta_alfa`), no desde el back-office. | Crear el plástico del propietario exige acceso a SQL. |
| L-06 | La redirección de `pasajes.blink.com.ve` es HTML (`meta refresh` + JS), no un 301 del servidor. | GitHub Pages no permite reglas de servidor; sin JS igual redirige por el `meta`, pero no hay control de cabeceras ni de caché. |
| L-07 | El validador no acciona relé ni torniquete: el aviso es pantalla y buzzer. | «Cero saldo = cero acceso» depende del conductor o del sistema de la unidad (ADR-11, BLINK-DOC-16 §7). |

## 5. Plan de mitigación inmediato

| # | Acción | Responsable | Plazo |
| --- | --- | --- | --- |
| 1 | ~~Aplicar `0006` en producción~~ (hecho el 2026-10-29; ver BLINK-DOC-07 §3.2). | Administrador | Cerrado |
| 1b | ~~Aplicar `0007` y `0008`; publicar el back-office~~ (hecho el 2026-10-29; ver BLINK-DOC-07 §3.3, §3.4 y §4.2). | Administrador | Cerrado |
| 1c | Inscribir el segundo factor de la cuenta administradora desde el teléfono del operador. | Operador | Inmediato |
| 1d | ~~Aplicar `0009` y crear la tarjeta maestra~~ (hecho el 2026-10-30; ver BLINK-DOC-07 §3.5 y BLINK-DOC-12). | Administrador | Cerrado |
| 1e | ~~Aplicar `0010` y renumerar la maestra a `00-0-0000000-0`~~ (hecho el 2026-10-30; ver BLINK-DOC-07 §3.6). | Administrador | Cerrado |
| 1f | ~~Aplicar `0018`, construir y publicar la bandeja de recargas~~ (hecho el 2026-11-01; cierra B-04, ver BLINK-DOC-07 §4.8; Pages en verde). | Administrador | Cerrado |
| 2 | Rotar contraseña de PostgreSQL y tokens expuestos (checklist en BLINK-DOC-11). | Administrador | Inmediato |
| 3 | Mover el firmware del **lector** a un repositorio con `firmware/` (el validador ya está en git). | Desarrollo | Corto |
| 4 | ~~Migrar BLINK PASAJES al esquema `bt_*`~~ (cerrado el 2026-10-31: panel retirado y dominio redirigido a TARJETA). | Desarrollo | Cerrado |
| 4b | Construir el panel de fiscales sobre `trips_telemetry` y `bt_liquidar`. | Producto | Próximo hito |
| 5 | Añadir E2E de registro/recarga en CI. | Desarrollo | Medio |
| 6 | Implementar recuperación de PIN. | Producto | Medio |
| 7 | Añadir alertas de pendientes y validadores. | Operación | Medio |
| 8 | Grabar el chip desde la estación web (B-14) y añadir cola secuencial con *tap & next* (B-15). | Desarrollo | Corto |
| 9 | Generar el paquete de producción ZIP VDP / PDF-VT y permitir la carga de artes (B-16). | Desarrollo | Medio |
| 10 | Restringir la estación al rol del propietario (B-17). | Desarrollo | Corto |
| 11 | Cifrar la copia sin conexión con WebCrypto y el PIN del pasajero (R-10, D-09). | Desarrollo | Medio |
| 12 | Llevar `simulacion/flujo.sh` al CI (B-19, D-10). | Desarrollo | Corto |
| 13 | Aplicar las guardas F-01 y F-02 del ciclo de recarga (D-11) y definir la caducidad de pendientes (B-21). | Desarrollo | Corto |
| 14 | Cargar el Pago Móvil real en `settings.publico` (B-20). | Propietario | Inmediato |
| 15 | Añadir un comando de `inciertas` al back-office y reportarlas a la nube (B-22). | Desarrollo | Corto |
| 16 | Forzar un corte a media escritura y medir el tiempo de cobro con hardware (B-23). | Desarrollo | Corto |
| 17 | Guardar o contar los códigos de rechazo por unidad y exponerlos en el panel fiscal (B-24). | Desarrollo | Medio |
| 18 | Validar en el panel real colores, banda amarilla y legibilidad a plena luz; ajustar la cabecera si no se lee (B-25). | Propietario · Desarrollo | Corto |
| 19 | Vigilar la estabilidad del SPI a 40 MHz en operación y tener el retorno a 24 MHz documentado (B-26). | Desarrollo | Medio |
| 20 | Aportar el decreto u ordenanza municipal que homologue la tarifa por pasaje, o ajustar `settings.publico.tarifario.base` a la tarifa homologada (B-32, R-14). | Propietario | Inmediato |
| 21 | Someter la hoja legal a revisión de un abogado antes de imprimirla en las tarjetas y de la campaña pública (R-15). | Propietario | Corto |
| 22 | Definir si se implementan las gratuitades y descuentos de la Gaceta 43.335 y, en su caso, cómo se verifica la condición del pasajero (B-33). | Producto | Medio |
| 23 | Cerrar R-16: proteger el AP de configuración con clave WPA2 por unidad impresa en la etiqueta, o abrirlo solo con un botón físico y un LED que avise. | Desarrollo | Corto |
| 24 | Ejecutar el protocolo de medición de usabilidad con 5–8 choferes y ajustar textos u objetivos según el resultado (B-34). | Producto · Desarrollo | Corto |
| 25 | Añadir una sonda de Internet antes de declarar «conectado» y reflejarla en la banda de estado (B-35). | Desarrollo | Medio |
| 26 | Contar los fallos de TOTP y bloquear la cuenta con la misma política del PIN (R-17). | Desarrollo | Inmediato |
| 27 | Añadir `bt_admin_salir` y revocar el token al cerrar sesión del back-office (R-18). | Desarrollo | Inmediato |
| 28 | Exigir TOTP vigente o PIN para reinscribir el segundo factor (R-19). | Desarrollo | Corto |
| 29 | Separar `V` y `E` en la clave única de cédula (R-20) y hacer atómico el contador de intentos (R-21). | Desarrollo | Corto |
| 30 | Neutralizar fórmulas en los CSV exportados (R-22) y completar la exportación de inventario (B-51). | Desarrollo | Corto |
| 31 | Rechazar tarjetas bloqueadas o vencidas en `bt_recargar_pasajes` (B-55). | Desarrollo | Corto |
| 32 | Corregir el monto sugerido de Pago Móvil con `cotizarRecarga` (B-56). | Desarrollo | Corto |
| 33 | Verificar el bloque de integridad al leer (B-49) y sacar la sincronización HTTPS del `loop()` (B-38). | Desarrollo | Medio |
| 34 | Repetir la prueba física de bloqueo offline y de fallo de escritura en la unidad (B-02, B-23, B-36). | Desarrollo | Corto |

## 6. Revisión

Este registro se actualiza al cerrar cada hito. La última revisión corresponde al
2026-11-02 y acompañó la auditoría completa de firmware, TARJETA, BACK-OFFICE y
documentación: se corrigieron trece defectos de firmware (B-36 a B-48), se
añadieron siete riesgos (R-17 a R-23) y ocho brechas de las aplicaciones
(B-49 a B-56). En la misma revisión se corrigieron quince desajustes entre los
documentos y el código: runbook con seriales retirados (DOC-06), RPC y límites
eliminados en `0014` (DOC-04), modelo de seriales y tarjeta maestra (DOC-03),
hardware inexistente y puertos de desarrollo (DOC-02), estado de RF-12 (DOC-01),
cadena de migraciones truncada (DOC-06), constante `PORTAL_PRUEBA_MS` mal
atribuida (DOC-06), versión del back-office (DOC-00), código duplicado de
DOC-14, rango documental del README del back-office y ejemplo de `READY` con
versión 8 en el firmware. Las cifras de la página del portal (8.147 B) se
midieron con `curl` sobre la unidad y quedan reproducibles; las de redes y
toques siguen siendo mediciones de banco del 2026-11-01. R-16 y B-38 siguen
abiertos.
La revisión anterior, del 2026-11-01, acompañó la revisión de usabilidad de la
vinculación Wi-Fi (BLINK-DOC-21, firmware 9): se añadieron B-34 (falta la
medición con choferes reales y con el navegador de un teléfono) y B-35 (se
confirma el enlace, no el alcance de Internet); R-16 sigue abierto.
La revisión anterior, del 2026-11-01, acompañó el modo de configuración Wi-Fi del
validador (firmware 9): se cerró B-29 (ya no hace falta consola para cambiar de
red) y se añadió R-16 (el AP de configuración es abierto mientras dura la
ventana).
La revisión anterior, del 2026-11-01, acompañó la capa legal del portal
(LEG-TER-001 y Gaceta Oficial N.º 43.335, BLINK-DOC-20): se añadieron R-14
(tarifa sin homologar publicada en términos) y R-15 (la hoja no es una revisión
legal), B-32 (falta el instrumento municipal que respalde los Bs 500) y B-33
(gratuidades y descuentos de la Gaceta sin implementar).
La revisión anterior, del 2026-11-01, acompañó la bandeja de recargas del
back-office (migración `0018`): se cerró B-04 (aprobación de recargas sin
pantalla en el panel).
La revisión anterior, del 2026-10-31, acompañó la interfaz datáfono
`ISO-UI-240-REV2` del firmware 8
(BLINK-DOC-18): se añadieron B-25 (contraste de cabecera y título, falta la
prueba de luz real) y B-26 (SPI a 40 MHz sin validación de integridad).
La revisión anterior, del 2026-10-31, acompañó los códigos de respuesta POS del
validador (BLINK-DOC-17, firmware 7): se añadió B-24 (los códigos no se guardan
en la nube).
La revisión anterior, del 2026-10-31, acompañó el cobro repetido por tarjeta y
la especificación offline
(BLINK-DOC-16): se cerró B-01 (mapa de bloques y llaves derivadas), se añadieron
B-22 (inciertas solo por consola), B-23 (falta prueba de fallo de escritura y
medición de tiempos), D-12 (`chip_counter` sin validación de secuencia) y L-07
(sin relé).
La revisión anterior, del 2026-10-31, acompañó la auditoría de datos y el cierre
del ciclo de recarga (BLINK-DOC-15): se cerró la prueba física de enrolado y
cobro, se purgó la unidad demo, se añadieron B-20 (Pago Móvil de ejemplo), B-21
(pendientes sin caducidad) y D-11 (guardas del ciclo), y se acotó D-03 al
firmware del lector.
La revisión anterior, del 2026-10-31, acompañó el retiro de BLINK PASAJES (B-03
cerrada, L-03 acotada a TARJETA/BACKOFFICE), la redirección del dominio (L-06)
y la simulación local del flujo completo (B-19, D-10). La revisión del
2026-10-31 anterior acompañó la seguridad del portal sin conexión: se añadieron
R-10, R-11 y D-09, y se endurecieron la caducidad de la copia local y el alcance
del service worker. La revisión del 2026-10-30 acompañó las migraciones `0009`
(serie de 7 dígitos) y `0010` (maestra `00-0-0000000-0`) y la alineación de
BLINK-DOC-12 con el estándar de producción del propietario (impresión ID-1,
paquete VDP y enrolado secuencial).
