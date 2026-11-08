# Changelog — BLINK PAY

Todos los cambios relevantes de este producto se documentan aquí.

Formato basado en [Keep a Changelog 1.1.0](https://keepachangelog.com/es-ES/1.1.0/)
y versionado [SemVer 2.0.0](https://semver.org/lang/es/). Las fechas usan ISO 8601.

## [No publicado]

## [2.4.1] — 2026-11-07

Parche de firmware y base de datos: el validador ya genera la clave de
idempotencia que exige `0025` y la nube de producción queda al día con las
migraciones del contrato bancario.

### Firmware del validador (repo `~/BLINK/firmware/validador`)

- **Versión 15 por OTA**: cada toque nace con un `offline_id` UUID v4 generado
  con 16 bytes del RNG hardware del ESP32 (versión 4 y variante RFC 4122),
  como exige `0025` y `QODER-BLINK-BANKING-SEC-2026` §2. La 14 mandaba una
  clave de texto (`UID-epoch-contador-azar`) que la nube viva rechazaba con
  «Clave de idempotencia inválida (UUID v4)». Binario de **1 527 232 B**,
  SHA-256 `e90cb24f20b3459236e1e192e73f09fb1d226600f649c148168ead78df2673ea`.
- `public/firmware/manifest.json` apunta a la 15; el canal sigue siendo
  `https://pay.blink.com.ve/firmware/`.
- La firma HMAC de §3 (`bt_validador_sincronizar_firma`) sigue pendiente para
  una versión posterior; el camino por token de 0004 permanece.

### Base de datos (producción `gakkfzqcrapxeierfdhk`)

- **`0024` y `0025` verificadas como ya aplicadas** en la nube viva: marcador
  de esquema, `bt_validador_sincronizar` rechazando claves de texto, 22
  viajes históricos normalizados y `transactions_log` con 31 movimientos.
- **`0021_endurece_acceso.sql` aplicada** (faltaba en producción aunque
  `0024`/`0025` estaban): crea `account_sessions.mfa` y
  `accounts.totp_ultimo_contador`, sin los cuales `bt_reanudar` —el enlace
  biométrico de 0024— fallaba en tiempo de ejecución. Aplicada en una sola
  transacción con respaldo previo de las definiciones anteriores;
  `notify pgrst, 'reload schema'` emitido.

### Pruebas

- Generador UUID v4 probado en host: **100 000 claves**, 0 inválidas contra
  el regex exacto de `0025`, 0 colisiones; caso extremo `0xFF` produce
  versión 4 y variante `b`.
- Prueba transaccional contra la nube viva (con rollback): un toque con
  UUID v4 de la 15 se procesa (`procesadas=1`); el mismo toque con clave de
  texto de la 14 se rechaza y queda en `validator_rejections`.
- Unidad de banco (`/dev/ttyUSB0`, MAC `1C608BDF948C`): flasheada por USB con
  la 15 conservando la NVS (token, placa `A12BC3D` y colas), `INFO` reporta
  `fw=15` y `SYNC,ok=1,…,placa=A12BC3D` contra producción.

### Conocido

- La instalación de una versión mayor por OTA en la flota sigue sin
  comprobarse en calle (D-14: corte de energía a mitad de descarga); la
  unidad de banco ya corre la 15 por USB.
- La escritura del canal OTA sigue siendo la del repo Pay (R-24): proteger
  `main`.

## [2.4.0] — 2026-11-07

Nueva puerta de entrada pública y canal OTA de la flota de validadores. GitHub
Pages vuelve a servir el paquete de interfaz (la 2.3.0 fue solo contrato de
base de datos) y ahora aloja también el firmware del validador.

### Añadido

- **Landing de `pay.blink.com.ve`** (`src/pages/Landing.tsx`,
  `src/styles/landing.css`): sin sesión, `/` muestra una página de producto
  réplica de la estructura de apple.com/la/apple-pay, con maquetas CSS del
  validador y de la PWA (el alta, el cobro y el saldo). El acceso se abre con
  `#entrar` o `#registro`; las anclas `#configurar`, `#seguridad` y `#preguntas`
  navegan dentro de la propia landing. `App.tsx` la carga perezosa y memoizada.
- **Activos de marca** en `src/assets/` (isotipo y ondas NFC) y
  `marca/blink-pay-sin-contacto.svg` (el símbolo sin contacto con las tres
  ondas de la marca), más la referencia de geometría en `marca/referencias/`.
- **Canal OTA del firmware** en `public/firmware/`: `manifest.json` y
  `BLINK_Validador.bin` de la versión 14, servidos por HTTPS en
  `https://pay.blink.com.ve/firmware/`. El workflow `pages.yml` los copia a
  `dist/firmware/` en cada despliegue.
- **`scripts/build-firmware-assets.mjs`**: rasteriza los SVG maestros de
  `marca/` a bitmaps RGB565 (`assets.h`) para el splash, el isotipo y el
  símbolo sin contacto del validador ESP32. `potrace` entra como devDep.

### Cambiado

- **`Icon` reenvía las props de `BlinkSymbol`** (`tamano`, `variante`,
  `animacion`, colores y título): el envoltorio ya no las descarta, así que la
  landing puede pedir símbolos monocromos y tamaños concretos. `BlinkSymbol`
  exporta su tipo `Props`.
- **Iconos, favicon y maskable** regenerados desde los SVG maestros con
  `scripts/build-icons.mjs`; el favicon va con fondo transparente.
- **Caché del service worker** a `blink-pay-v10` para forzar el refresh del
  armazón anterior.
- La puerta pública por defecto pasa de la pantalla de acceso a la landing;
  «volver» desde el acceso regresa a la landing en lugar de salir de la app.

### Firmware del validador (repo `~/BLINK/firmware/validador`)

- **Versión 14**: corrige la sincronización con Pay añadiendo las cabeceras
  `Accept-Profile` y `Content-Profile: public` a la RPC (PostgREST de Pay
  expone `api` por defecto y la función vive en `public`; antes daba PGRST202,
  HTTP 404). Binario de **1 526 944 B**, SHA-256
  `48962f7244e1b2eccc6c78edced4cce345e5ac9729f8e2d748846c3131cccca2`.
- El canal OTA queda apuntado en `config.example.h`
  (`OTA_MANIFEST_URL = https://pay.blink.com.ve/firmware/manifest.json`).

### Pruebas

- `npm run typecheck` limpio; `npm test`: **111 pruebas** en 9 archivos;
  `npm run build` correcto. El workflow de Pages (`construir` + `publicar`)
  terminó en `success`.
- **Canal OTA verificado en vivo**: `manifest.json` devuelve la 14 con su URL,
  SHA-256 y `size`; el binario responde HTTP 200 con `Content-Length: 1526944`
  y el SHA-256 descargado coincide con el del manifest y con el flasheado por
  USB en la unidad real.
- **Unidad de banco** (`/dev/ttyUSB0`, fw 14): tras fijar `OTA_URL` y forzar
  `OTA`, el equipo descargó el manifest por HTTPS y respondió
  `OTA,sin-novedad,actual=14,remota=14`; `OTA_ESTADO` persiste `remota=14`,
  `fallo=0`. En la misma pasada `SYNC,ok=1,…,placa=A12BC3D` reconfirma el fix
  de sincronización en hardware real.

### Conocido

- **La escritura del canal OTA es la del repo Pay**: quien pueda pushear a
  `main` publica firmware. La rama debe estar protegida (R-24); el SHA-256
  detecta corrupción, no un canal comprometido.
- Sigue pendiente el corte de energía a mitad de descarga OTA (D-14) y la
  instalación de una versión mayor en la flota (la 14 solo pudo comprobarse
  como `sin-novedad` por ser la misma que corre la unidad).
- ~~`0024` y `0025` continúan sin aplicar en Supabase~~: esta nota era
  incorrecta; la verificación en vivo de la 2.4.1 demostró que ambas ya
  estaban aplicadas. Lo que faltaba era `0021`, aplicada en la 2.4.1.

## [2.3.0] — 2026-11-07

Implementa `QODER-BLINK-BANKING-SEC-2026` en `0025_escudo_validador.sql` y fija
el contrato del firmware en [`docs/seguridad-validador.md`](docs/seguridad-validador.md).

### Añadido

- **Firma HMAC-SHA256 por equipo** (§3 de la norma): `validator_secrets` guarda
  la clave de 32 bytes de cada ESP32, `validator_nonces` impide reutilizar una
  trama y `bt_validador_sincronizar_firma(mac, cuerpo, timestamp, nonce, firma)`
  recalcula el HMAC, rechaza sellos de más de 30 s y compara los digests de las
  firmas. `bt_validador_emitir_secreto` emite o rota la clave (solo
  `service_role`) y la devuelve una única vez.
- **Idempotencia en UUID v4** (§2 de la norma): el toque debe traer
  `offline_id` con forma de UUID v4; `trips_telemetry.idempotency_key` guarda la
  clave como `uuid` con índice único y `card_movements.idempotency_key` enlaza
  el recibo con el toque. Un texto libre se rechaza y queda en
  `validator_rejections` con el motivo «Clave de idempotencia inválida (UUID v4)».
- **Bitácora particionada por mes** (§1.2 de la norma): `transactions_log`
  copia cada movimiento de dinero, con particiones mensuales creadas por
  `bt_asegurar_particion` y el disparador de `card_movements`; el histórico se
  copia una vez y la partición por defecto queda como red de seguridad. Solo
  `service_role` la lee.
- **Pasos 13 (bitácora) y pruebas de firma** en `simulacion/flujo.mjs`: sello
  vencido, firma falsa, nonce reutilizado, clave de texto y toque sin clave.
- **`docs/seguridad-validador.md`**: contrato del toque, formatos de la firma,
  aprovisionamiento, archivo de meses cerrados, permisos y transporte.

### Cambiado

- `bt_validador_sincronizar` exige UUID v4, enlaza el viaje con su movimiento y
  deja de admitir claves de texto. El camino por token de 0004 sigue vivo para
  el firmware instalado y comparte el mismo núcleo endurecido.
- `simulacion/seed.sql` crea el operador con la cédula numérica que exige 0024.
- Los toques históricos con clave de texto se normalizan a un UUID v4 derivado,
  de modo que la liquidación de viajes viejos siga funcionando.

### Pruebas

- `node simulacion/flujo.mjs` completo (14 pasos) sobre la base local recién
  migrada: firma, token, rechazos, transferencias y bitácora sin errores.
- 0025 aplicada sobre una base con toques anteriores de texto: se normalizan,
  la restricción queda validada y un `update ... set settled = true` sobre las
  filas viejas pasa. Un segundo pase de la migración no cambia nada.
- `npm run typecheck`, `npm test` (110 pruebas) y `npm run build` sin cambios
  respecto de 2.2.0: esta entrega no toca el portal.

### Conocido

- ~~`0024` y `0025` siguen sin aplicar en Supabase~~: nota corregida en la
  2.4.1 tras verificar en vivo que ambas ya estaban aplicadas; la que
  faltaba era `0021` (prerrequisito del enlace biométrico), aplicada allí.
- El firmware ESP32 no está en este repositorio. Hasta que implemente el UUID
  v4 y la firma de la sección 2 del documento, los equipos en calle siguen
  usando el camino por token.
- GitHub Pages continúa sirviendo el paquete de 2.2.0; no hay cambios de
  interfaz en esta versión.

## [2.2.0] — 2026-11-07

### Añadido

- **Enlace permanente del teléfono** (`bt_crear_enlace` y `bt_reanudar` en
  `0024_cedula_solo_digitos.sql`): al activar la huella o el rostro, el
  dispositivo guarda una llave propia y la nube solo conserva su hash bcrypt en
  `accounts.enlace_hash`. Al reabrir la app, la llave abre una sesión nueva sin
  PIN; desactivar la biometría en el perfil rompe el enlace, y el PIN sigue
  sirviendo de respaldo.
- **Cédula de solo dígitos** en el acceso y en el registro de la cuenta de pago:
  teclado numérico, sin selector V/E, y la migración normaliza los registros
  existentes a `cedula_digitos` para que las consultas coincidan.
- **Tiempo máximo de 20 s** en las llamadas a la nube (`src/lib/nube.ts`): una
  solicitud sin respuesta ya no deja el formulario girando; se informa del corte
  y se puede reintentar.
- **`scripts/build-icons.mjs`** regenera favicon, iconos de la PWA y logo de
  Apple a partir de los SVG de `marca/`, para que la marca se mantenga idéntica.
- **`0023_endurece_validador.sql`** (esquema compartido): la sincronización del
  validador queda reservada a `service_role` con un envoltorio
  `bt_validador_sincronizar_token` para el resto de clientes; cada toque se
  procesa con `for update` sobre la fila de la tarjeta; un viaje solo se acepta
  si la tarjeta está `ACTIVE` y su saldo virtual lo cubre; los importes de
  transferencias, ajustes y telemetría se restringen a bolívares enteros; y los
  toques rechazados se guardan en `validator_rejections`. Aplicada en la
  simulación el 2026-11-05 y **en Supabase el 2026-11-06**, con la revocación
  verificada en vivo: la RPC cruda responde 401/42501 y el envoltorio sin token
  403/28000.
- **Aviso de datos de ejemplo** (`src/components/AvisoDemo.tsx`): cuando el
  portal apunta a un backend con `settings.publico` sin personalizar, la pantalla
  de inicio lo dice en vez de fingir que los datos son reales (B-68).
- **Paso 12 adversarial** en `simulacion/flujo.mjs`: llama la RPC de
  sincronización sin token, con tarjeta inactiva, con saldo virtual insuficiente
  y con céntimos, y comprueba que la nube rechaza y registra cada caso. La
  batería son ahora 13 pasos.
- **Prueba unitaria** que rechaza `monto: 100.5` en la transferencia local
  (9.ª prueba del bloque de transferencias; 110 en total).

### Cambiado

- **Identidad** (§1): favicon, icono de app y logo usan exclusivamente el
  isotipo más «Pay»; la pantalla de carga ya no lleva subtítulo.
- **Tarjeta** (§3): el frente muestra solo saldo, pasajes y titular, con las
  cifras al 50 % de opacidad sobre `#FFFEFB`; el reverso es azul plano con el
  serial y sin caducidad; el botón «Ver reverso» lleva icono QR y ancho fijo de
  148 px.
- **Acceso** (§2): sin vista previa de la tarjeta y sin indicaciones técnicas;
  la biometría queda ligada al teléfono, no a la sesión.
- **Limpieza visual** (§4 y §6): se retiran la barra superior flotante, la
  etiqueta «Cartera», los textos de sincronización, los accesos rápidos, el
  rótulo «Tarjeta seleccionada» y el pie «BLINK PAY • 1 TARJETA». También salen
  el serial duplicado, los contadores del extracto, los metadatos y códigos
  técnicos del inspector, recibos y hojas legales.
- **Transferir** (§5): si la cuenta tiene una sola tarjeta, el formulario queda
  visible con un aviso de que las transferencias están en preparación; la
  validación y la confirmación siguen operativas para cuentas con dos tarjetas.
- La transferencia exige **bolívares enteros** en lugar de redondear a dos
  decimales: el mensaje de error es «Transfiere solo bolívares enteros, sin
  céntimos.» y la ayuda del campo lo aclara al pasajero (B-65).
- Un fallo de red al leer el extracto ya no se presenta como «sin movimientos»:
  `App.tsx` guarda `errorMovimientos` y `Movimientos.tsx` muestra el aviso con
  su botón de reintento (B-68).

### Corregido

- **Pantalla negra en Transferir**: la clave de idempotencia se genera sin
  `crypto.randomUUID`, que no existe en contextos sin HTTPS.

### Pruebas

- `npm run typecheck` limpio; `npm test`: 110 pruebas en 9 archivos.
- `npm run build` correcto (453,66 kB de JS y 57,79 kB de CSS).
- `npm run verificar:hig`: todas las comprobaciones pasan en 393 y 1440 px,
  con tema claro y oscuro, incluida la de cero desplazamiento de diseño.

### Conocido

- `0022` y `0023` están aplicadas en Supabase desde el 2026-11-06. `0024`
  todavía debe pegarse en el SQL Editor del proyecto: hasta entonces la
  biometría del portal en la nube no puede crear ni reabrir enlaces, y el modo
  local no se ve afectado. La **2.1.0 quedó publicada en GitHub Pages el
  2026-11-06** (commit `2048157`, bundle `index-0DsCmtA8.js`, `CACHE` `v7`).
- La defensa contra dos sincronizaciones simultáneas del mismo validador no es
  medible con una sola conexión de prueba (BLINK-DOC-07 §4.18).

## [2.1.0] — 2026-11-04

### Añadido

- **Transferencia de saldo entre tarjetas** (`src/pages/Transferir.tsx` y
  `bt_transferir_saldo` en `0022_transferencias.sql`): desde la quinta pestaña
  se elige la tarjeta de destino por serial, el monto y se confirma con el PIN
  del titular. Sirve para tarjetas de la misma cuenta o de otra persona.
  Devuelve comprobante con número de referencia, saldo anterior y resultante,
  y aparece como movimiento «Transferencia» en ambas billeteras.
- **Topes y disponibilidad**: límite por operación y por día configurables en
  `ajustes` (5.000 y 20.000 Bs por defecto), PIN con el mismo bloqueo de cinco
  intentos del acceso y disponibilidad acotada a lo que el chip también puede
  descontar, para no dejar el plástico con saldo negativo (ADR-39).
- **Idempotencia por clave**: cada intento lleva una clave UUID; un reintento
  por corte de red devuelve la misma transferencia en lugar de mover el dinero
  dos veces (ADR-37).
- **Ajustes firmados del chip** (`card_adjustments`): la nube registra el
  crédito del destino y el débito del origen como pendientes que el validador
  aplica y acusa en su siguiente sincronización; `virtual_balance` sigue siendo
  el libro mayor autoritativo (ADR-38).
- **BLINK-DOC-26** con el contrato, la matriz de amenazas y las consultas
  operativas; RF-20 en BLINK-DOC-01 y manual del pasajero en BLINK-DOC-08 §1.11.

### Cambiado

- La navegación pasa a **cinco secciones**: Inicio, Movimientos, Recargar,
  Transferir y Perfil, tanto en la barra de pestañas del teléfono como en la
  barra lateral de la computadora. El inspector reconoce el detalle de una
  transferencia.
- La copia local sube a la **versión 5** para guardar el disponible y los
  ajustes pendientes; el armazón del service worker pasa a
  `blink-tarjeta-v7`.
- `bt_validador_sincronizar` aplica primero los acuses de recargas y ajustes y
  después los toques, acota `chip_balance_after` y no sobrescribe el libro
  mayor.

### Corregido (seguridad, `0021_endurece_acceso.sql`)

- El segundo factor del back-office se exige **por sesión** (`account_sessions.mfa`)
  y no solo por operador: una sesión abierta antes de activar TOTP ya no evita
  el código.
- Los códigos TOTP no se pueden repetir dentro de su ventana
  (`totp_ultimo_contador`).
- El cambio de PIN queda sujeto al mismo contador de intentos que el acceso.
- La vinculación de tarjetas tiene límite por cuenta y ventana de tiempo, y las
  entradas y vinculaciones bloquean la fila (`for update`) para evitar carreras.
- La recarga solo se acepta sobre tarjetas activas y vigentes.

### Pruebas

- `npm run typecheck` limpio; `npm test`: 108 pruebas en 9 archivos.
- `simulacion/flujo.mjs` cubre la transferencia entre tarjetas de la misma
  cuenta y hacia otra cuenta, el reintento idempotente y los ajustes del chip.
- `npm run verificar:hig`: 78 comprobaciones correctas con la quinta sección.

### Riesgos

- El firmware 9 ignora los ajustes negativos: el plástico emisor conserva el
  importe hasta que se actualice a la versión 10 (**R-27**, **B-60**). El saldo
  virtual ya está debitado y la transferencia queda registrada; la corrección
  del chip es la acción 39 de BLINK-DOC-09.

## [2.0.0] — 2026-11-03

### Añadido

- **Rediseño completo al estilo Apple** con dos chasis que comparten datos y
  dominio: iPhone/PWA por debajo de 768 px (título grande colapsable, tarjeta
  tipo Wallet con proporción 1,586:1 y radio 16 px, hoja inferior con asa,
  selector segmentado de pasajes, listas agrupadas con filas de 44 pt,
  separadores de 0,5 px desplazados 56 px y barra de pestañas translúcida de
  49 px) y macOS desde 768 px (barra lateral de 240 px, barra unificada de
  52 px e inspector de 300 px desde 1080 px), con tablas y resúmenes tipo
  Bento.
- **`src/components/ui/BlinkSymbol.tsx`**: adaptador único de SF Symbols con
  cuatro variantes (monocromo, jerárquico, paleta y multicolor) y cuatro
  animaciones (rebote, pulso, color variable y reemplazo mágico). Toda la
  iconografía de la app pasa por él; dependencia `sf-symbols-lib` 2.0.1.
- **Fundamentos HIG**: pila tipográfica del sistema con escala de iOS,
  cifras tabulares en saldos e importes, colores de sistema claro/oscuro,
  materiales `blur(24px) saturate(180%)`, separadores de 0,5 px, objetivos
  táctiles de 44 pt, respeto de `prefers-reduced-motion` y del esquema de
  color del sistema.
- **`npm run verificar:hig`** (`scripts/verificar-hig.mjs`): 78 comprobaciones
  en Chromium a 393×852 y 1440×900, claro y oscuro, con capturas en
  `/tmp/blink-hig`.
- **BLINK-DOC-25** e **ISO-HIG-BLINK-001**, documento maestro de estética
  Apple, con ADR-32 a ADR-35.

### Cambiado

- El inspector solo permite seleccionar movimientos en macOS (≥ 1080 px); en
  iPhone el detalle se abre como hoja.
- Al cambiar de sección el inspector vuelve al resumen en lugar de arrastrar
  el detalle anterior.
- La tarifa sigue viniendo de `ajustes.tarifario` y `cotizarRecarga()`: la
  interfaz no fija el monto base ni la comisión; el recibo mantiene la
  separación de LEG-TER-001 y la tarifa homologada sigue pendiente (B-32).
- Se retiraron las dependencias sin uso `@bradleyhodges/sfsymbols` y
  `@bradleyhodges/sfsymbols-react`.

### Corregido

- 20 px de desbordamiento horizontal en 393 px producido por el carrusel a
  sangre; el chasis recorta el desborde.
- Punto de conexión flotando solo en la esquina del iPhone; ahora aparece con
  la barra compacta al desplazar.
- Franja de degradado recortada en la pantalla de acceso de escritorio; el
  fondo cubre toda la ventana y el panel queda centrado.
- Saldo truncado en la lista de tarjetas del Perfil; el importe va primero.

### Pruebas

- `npm run typecheck` limpio; `npm test`: 100 pruebas en 9 archivos.
- `npm run verificar:hig`: 78 comprobaciones correctas en dos corridas
  consecutivas, sin desbordamiento en las cuatro secciones.
- Verificación en Chromium de escritorio emulando el viewport; falta probar en
  iPhone y Android reales (B-59).

### Riesgos

- SF Symbols está licenciado por Apple solo para plataformas Apple y BLINK
  también corre en Android y web. Riesgo aceptado por el propietario el
  2026-11-03 (**R-26**, **L-16**); la sustitución queda como acción 38 de
  BLINK-DOC-09.

## [1.9.0] — 2026-11-03

### Añadido

- **Aviso de actualización** con comportamiento de app nativa
  (`src/lib/actualizacion.ts` y `src/components/AvisoActualizacion.tsx`):
  cuando GitHub Pages publica una versión nueva, el portal muestra
  «Actualización disponible» con **Ahora no** y **Actualizar**. La versión
  nueva queda en espera y solo toma el control cuando el pasajero lo confirma,
  con una única recarga y la purga de las cachés anteriores.
- La comprobación de versión ocurre al arrancar, cada 30 minutos, al volver a
  primer plano y al recuperar la red, con un mínimo de 60 segundos entre
  intentos y `updateViaCache: "none"`.
- **BLINK-DOC-24** con el flujo, la interfaz, los límites y la decisión
  ADR-31; RF-18 en BLINK-DOC-01 y tres pruebas en
  `src/lib/actualizacion.test.ts`.

### Cambiado

- El service worker ya no llama a `skipWaiting()` al instalar: la versión
  nueva se retiene en `waiting` hasta que la página envía
  `{tipo: "activar"}`. Evita recargar en medio de una recarga o de un cobro y
  mezclar HTML y JavaScript de versiones distintas.
- La caché pasa a `blink-tarjeta-v6`; `activate` borra las anteriores.
- La primera visita (sin controlador previo) no muestra el aviso: la
  instalación inicial no es una actualización.
- «Ahora no» oculta el aviso hasta el próximo arranque; la app sigue operando
  con la versión anterior.

### Pruebas

- `npm test`: 100 pruebas en 9 archivos. Se añaden 3 casos para la
  suscripción y el descarte del aviso.
- Verificación E2E en Chromium con dos publicaciones simuladas: sin aviso en
  la primera carga, aviso al detectar `v7`, ocultamiento con «Ahora no»,
  activación con «Actualizar», purga de `v6` y recarga única.

## [1.8.0] — 2026-11-03

### Añadido

- **Acceso con huella o rostro** en dispositivos compatibles mediante WebAuthn
  (`src/lib/biometria.ts`): tras el primer acceso con PIN, el portal ofrece
  activar una credencial de plataforma (`authenticatorAttachment: "platform"`,
  `userVerification: "required"`). En los siguientes arranques, una pantalla de
  desbloqueo permite abrir la billetera verificando la biometría, sin escribir
  cédula ni PIN.
- **Hoja de activación** tras el primer inicio de sesión, con instrucciones y
  opción «Ahora no»; no se vuelve a ofrecer para la misma cédula.
- **Perfil › Seguridad** permite activar o desactivar el acceso con huella e
  indica cuándo no está disponible en el navegador.
- **BLINK-DOC-23** con el diseño, el modelo de amenazas, los flujos, los
  límites y las decisiones ADR-29/ADR-30.

### Cambiado

- El cierre por inactividad de 30 minutos ya no expulsa la sesión cuando hay
  biometría activa: muestra la pantalla de desbloqueo. Sin biometría se
  mantiene el cierre de sesión completo.
- La sesión guardada con biometría ya no se restaura sola al recargar: primero
  se exige la verificación del teléfono.

### Seguridad

- Solo se guarda el **token de sesión** (`blink.tarjeta.biometria.v1`), nunca el
  PIN. El token caduca a las 12 horas, se borra al cerrar sesión y se renueva
  con cada acceso por PIN; la credencial del teléfono se conserva para volver a
  enlazarla. Una copia con fecha futura, caducada o incoherente se descarta.
- BLINK no recibe ni almacena datos biométricos: la verificación ocurre en el
  autenticador del dispositivo.

## [1.7.0] — 2026-11-01

### Añadido

- **Términos y condiciones en el portal** (LEG-TER-001, BLINK-DOC-20): hoja
  legal accesible desde el pie del acceso y desde la sección BLINK del perfil,
  con seis apartados —naturaleza del servicio, tasa administrativa, desglose de
  la recarga, tarjeta MIFARE Classic 1K, datos personales y base normativa—.
  La tarifa mostrada es la de la tarjeta activa, no un valor fijo.
- **Desglose del recibo** exigido por los términos: «Pasaje urbano» (pasajes ×
  tarifa, monto acreditado) y «Tasa administrativa digital» (diferencia contra
  el total). Antes el recibo hablaba de comisión, provisión y utilidad.
- **BLINK-DOC-20** con el veredicto de LEG-TER-001 y de la Gaceta Oficial
  N.º 43.335, ADR-21 a ADR-23, las brechas B-32/B-33 y los riesgos R-14/R-15.
- **RF-15** en BLINK-DOC-01: los términos deben abrirse desde el acceso y el
  perfil, y el recibo debe separar tarifa de tasa administrativa.

### Cambiado

- El texto de la recarga aclara que el monto a transferir incluye la tasa
  administrativa por el servicio digital.
- El manual de usuario (BLINK-DOC-08 §1.7) explica cómo abrir los términos y
  qué datos tratan; la prueba de sistema (BLINK-DOC-07 §4.10) registra la
  verificación en navegador.
- La caché del service worker sube a `v5` para que los pasajeros con el armazón
  anterior reciban la hoja legal.

### Importante

- La tarifa de Bs 500 sigue siendo la aplicada y acreditada en la tarjeta, pero
  **no se presenta como tarifa nacional oficial**: la Gaceta 43.335 fija Bs 100
  de referencia y exhorta a las alcaldías a armonizar, y la competencia es
  municipal (art. 178.2 CRBV). Falta el decreto u ordenanza que homologue el
  monto (B-32, R-14).

## [1.6.0] — 2026-11-01

### Añadido

- **Motor tarifario y recarga por pasajes** (migración `0019`): el pasajero
  elige cuántos pasajes compra (1, 2, 3, 5, 10 o una cantidad entera) y el
  portal calcula el monto exacto con gross-up de la comisión de entrada (1,5 %),
  provisión de salida (0,3 %), margen del 4 % y redondeo a la decena superior.
  El recibo muestra lo que se transfiere, lo que se acredita y el saldo
  resultante (BLINK-DOC-19).
- **`bt_recargar_pasajes`** recotiza en el servidor con `cards.tarifa`; guarda
  `pasajes`, `tarifa_base`, `monto_base`, `comision_entrada`,
  `provision_salida`, `margen_blink`, `excedente_redondeo` y una copia del
  tarifario en cada recarga. `amount` sigue siendo el bruto que se concilia.
- **`bt_aprobar_recarga` acredita el monto base**, no el bruto; las recargas
  anteriores a `0019` conservan su importe.
- **Migración `0020`**: la sincronización del validador entrega `monto_base` al
  chip (antes enviaba el bruto y el plástico quedaba con más saldo que la nube).
- Botones **Copiar monto** y **Copiar datos y monto** en el paso de Pago.
- El tope por recarga sube a Bs 20.000 para que quepan los bloques de 10 y 20
  pasajes; el campo libre indica el máximo (37 a Bs 500).
- **BLINK-DOC-19** con el veredicto de las tres especificaciones, ADR-16 a
  ADR-20 y las brechas B-27 a B-31.

### Cambiado

- El paso 1 de **Recargar** ya no acepta un monto en bolívares: se compra una
  cantidad de pasajes. El monto a transferir es calculado y de solo lectura.
- La bandeja del back-office y el manual muestran pasajes, monto por conciliar
  (bruto) y monto a acreditar por separado.

### Corregido

- La simulación (`flujo.mjs`) prueba la recarga por pasajes y verifica el
  desglose y el importe que recibe el chip.
- La caché del service worker sube a `v4` para que los pasajeros con la
  versión anterior instalada reciban el portal por pasajes y no el armazón
  viejo.

### Añadido (acumulado desde 1.5.0)

- **Migración `0018_admin_recargas`**: `bt_admin_recargas` y
  `bt_admin_resolver_recarga` exponen la bandeja de Pago Móvil y su resolución
  al back-office con sesión y TOTP, reutilizando `bt_aprobar_recarga` y
  `bt_rechazar_recarga`. Las funciones crudas siguen cerradas a `anon`; la fila
  se bloquea antes de resolver y el rechazo exige motivo.
- **Interfaz datáfono `ISO-UI-240-REV2`** (firmware 8, BLINK-DOC-18): el cobro
  aprobado ocupa la pantalla completa en verde `#00C853` durante 2,5 s y el
  rechazo en rojo `#D50000` durante 3,0 s, con visto bueno o cruz trazados,
  importe y saldo en formato `2.450,00 Bs`. Al vencer la retención se repinta
  el panel de estado vivo.
- **Banda amarilla sin conexión** `#FFD700` con texto negro
  `SIN CONEXION A INTERNET` y el número de cobros pendientes, persistente
  mientras no haya Wi-Fi (ADR-15).
- **Renderizado en RAM de 39–40 ms**: lienzo de 240×120 px en el heap, dos
  pasadas y envío en bloques de 40 líneas; el resultado completo baja de
  63 ms (24 MHz) a 39–40 ms (40 MHz), dentro del límite de 50 ms de la
  especificación.
- **Comando serie `PANTALLA_TEST`**: pinta las dos pantallas de resultado y el
  panel, e informa `PANTALLA,ms=` de cada una sin gastar un toque.
- **`pantallaReservar()`** reserva el lienzo antes de Wi-Fi; si falla, la
  interfaz dibuja directo sobre el panel y el arranque lo informa con
  `PANTALLA,lienzo=directo`.
- **BLINK-DOC-15**: auditoría de datos, RLS, integridad referencial y cierre
  del ciclo de recarga, con la evidencia de la prueba física.
- **Script de limpieza** `supabase/limpieza/2026-10-31_auditoria_y_purga.sql`:
  transaccional e idempotente, archiva lo que borra en
  `respaldo.purga_20261031` y se niega a tocar unidades con operación.
- **Prueba real de punta a punta**: la maestra `A-00000-000-H` quedó grabada
  en el chip (UID `3981BF06`); el primer toque aplicó una recarga de 5000 Bs y
  cobró 500, dejando `virtual_balance = last_chip_balance = 4500`, la recarga
  con `synced_to_chip = true` y una fila de telemetría.
- **BLINK-DOC-16** *Especificación offline del validador*: mapa real de
  memoria, ciclo de cobro con Read-After-Write, estado incierto, sincronización,
  matriz RSK-01…05, ADR-09 (un toque = un pasaje), ADR-10 (llaves derivadas) y
  ADR-11 (sin relé), con la tabla de verificación física del 2026-10-31.
- **Migración `0017_contador_de_chip.sql`**: columna
  `trips_telemetry.chip_counter` y disparador `bt_trip_contador_chip()` que la
  extrae del `offline_id` (`UID-epoch-contador-aleatorio`); 8 filas históricas
  rellenadas. Permite auditar la secuencia de escrituras del chip.
- **Verificación de escritura en el validador** (firmware v6): cada cobro y
  recarga relee el chip y exige saldo y contador exactos. Un fallo de escritura
  o de relectura emite `INCIDENCIA`, marca el serial como incierto y bloquea
  toques posteriores con **VERIFICAR** hasta que un operador envía
  `LIMPIAR_INCIERTAS`.
- **Códigos de respuesta POS** (firmware 7, BLINK-DOC-17): cada `TAP` lleva
  `codigo=ISO-00` o `ERR-12/30/41/54/63/91`; la pantalla pinta el código con
  un visto bueno o una cruz y el monto/saldo en la franja del resultado.
  `ERR-91` se reserva a la tarjeta retirada a medio gesto; un timeout durante
  la escritura sigue siendo `ERR-63` e incierta (ADR-13).
- **Nuevo BLINK-DOC-17** con el catálogo de códigos, la adaptación de la
  interfaz al panel de 240×240 (ADR-12) y la matriz de retención (hoy 2,5 s y
  3,0 s con el firmware 8).

### Corregido (acumulado desde 1.5.0)

- **«Cobra una vez y luego no lee»** (firmware v6): tras autenticar, el
  MFRC522 quedaba en Crypto1 y el siguiente `REQA` viajaba cifrado, así que el
  lector no veía tarjetas nuevas hasta reiniciar. Todas las salidas pasan ahora
  por `soltarTarjeta()` (`PICC_HaltA()` + `PCD_StopCrypto1()`). Verificado con
  dos toques seguidos el 2026-10-31 21:41 (contadores 8 y 9).
- **Doble cobro latente por ciclo de antena**: el bucle re-energizaba la antena
  cada 2 s y despertaba la tarjeta en `HALT`, cobrándola en bucle. Se retiró el
  ciclo; la tarjeta cobrada queda en `HALT` hasta que se retira del campo.
- **Segundo toque perdido**: `REPETIR_MS` baja de 1500 a 500 ms para que un
  segundo toque deliberado (pagar dos pasajes) no caiga en la ventana de
  rebote.
- **Re-enrolado tras autenticación fallida (firmware v6)**: `reseleccionar()`
  corta y reenciende el campo RF antes de reintentar, porque el PICC no vuelve
  a IDLE por sí solo. El comando `ENROLAR … FORZAR` ya no termina en
  `ERROR,enrolado,lector`.

### Cambiado (acumulado desde 1.5.0)

- **Firmware 8**: `READY` e `INFO` informan `fw=8`; la retención del resultado
  pasa de 5 s a 2,5 s (aprobado) y 3,0 s (denegado); el resultado deja de
  ocupar la franja y pasa a pantalla completa; el SPI de la pantalla sube de
  24 a 40 MHz.
- **Suite documental 1.10.0**: DOC-18 nuevo (interfaz datáfono), DOC-17 1.1.0
  (resultado a pantalla completa y retención 2,5/3,0 s), DOC-02 1.5.0
  (ADR-14 y ADR-15), DOC-07 1.8.0 (§4.7 con las mediciones) y DOC-09 1.10.0
  (B-25 y B-26).
- **Purga del vehículo demo `A99XY7Z`** (MAC `001122334455`, sin viajes ni
  liquidaciones); queda la unidad real `A12BC3D`. No se reiniciaron secuencias
  ni se tocaron cuentas, tarjetas, recargas, movimientos ni telemetría.
- **Suite documental 1.7.0**: DOC-07 §4.4 (prueba física), DOC-09 1.7.0
  (B-20, B-21, D-11) y DOC-15 nuevo. Pasa a 1.8.0 con DOC-16, DOC-07 §4.5,
  DOC-09 1.8.0 (B-23, D-12, L-07) y el cambio de política de ADR-09.
- **Un toque = un pasaje (ADR-09)**: se descarta acumular toques durante 2 s y
  el rebote de 15 s; cada presentación de la tarjeta cobra un pasaje, lo que
  permite pagar dos pasajes con dos toques.
- **Firmware 7**: `READY` e `INFO` informan `fw=7` y cada `TAP` agrega el campo
  `codigo=`; el resto del protocolo serie no cambia. Un anfitrión que ignore el
  campo sigue funcionando con `ok` y `motivo`.

### Pendiente

- Cargar el Pago Móvil real en `settings.publico` (hoy RIF y teléfono de
  ejemplo).
- Aplicar las guardas F-01/F-02 y la caducidad de pendientes (F-04).
- Revisar las recargas pendientes `6466` y `4346` reportadas durante la prueba.
- Probar el corte de energía a mitad de escritura y medir el tiempo de cobro
  (B-23); exponer `inciertas` en el back-office (B-22).
- Rotación de secretos y restauración del MFA.

## [1.5.0] — 2026-10-31

### Seguridad

- **Copia sin conexión con caducidad**: el respaldo local de la billetera
  (datos personales y token de sesión) vence a las 12 horas de la última
  sincronización, se descarta si la fecha está en el futuro y se borra al
  cerrar sesión, al expirar la sesión o al rechazarla el servidor. Una copia
  vencida o corrupta se elimina en vez de mostrarse.
- **Service worker acotado**: al actualizarse borra solo las cachés con
  prefijo `blink-tarjeta-` (el origen de GitHub Pages es compartido con las
  demás publicaciones), valida el origen y el ámbito de los mensajes, ignora
  URLs fuera de `/TARJETA/` y solo guarda recursos estáticos de su armazón;
  las respuestas de API nunca entran en la caché.
- Nuevas pruebas de la copia local: caducidad, desfase de reloj, formato
  anterior, JSON corrupto, aislamiento por token y almacenamiento lleno.
- Registro de riesgos actualizado con R-10 (datos en el teléfono) y R-11
  (cachés compartidas del origen) en BLINK-DOC-09.

### Añadido

- **Simulación local del flujo completo** (`simulacion/`): PostgreSQL 16,
  PostgREST v12 y un gateway nginx que reproduce `/rest/v1/rpc/*`. Los scripts
  `arrancar.sh`, `flujo.sh`, `portal.sh`, `backoffice.sh` y `detener.sh` cubren
  lote, enrolado, registro, reclamo, recarga, aprobación, sincronización con el
  validador, aplicación al chip, cobro y referencia duplicada, con aserciones y
  sin tocar producción. Incluye semilla de ruta, vehículo y cuenta `ADMIN`.
- **Redirección del dominio retirado**: `pasajes.blink.com.ve` lo sirve el
  repositorio `PASAJES-REDIRECT`, que lleva a BLINK TARJETA conservando el ancla.
- **Portal instalable y sin conexión**: service worker que guarda el armazón y
  los recursos, y copia local de la última billetera con sus movimientos. Sin
  red se abre la tarjeta y el saldo guardados, con el aviso «Saldo guardado en
  este teléfono · sin conexión». Recargar, vincular, cambiar PIN o datos de
  pago siguen necesitando internet.
- **Migración `0014_serie_cinco_mas_tres.sql`**: adopta BLINK-DOC-12 v2.0.0,
  BLINK-DOC-13 v2.0.0 y BLINK-DOC-SEC-01 v1.0.0.
  - Serie `T-LLLLL-UUU-V` con letra verificadora Luhn mod 23; el código de
    barras pasa a ser el serial compacto de 10 caracteres (`G00001001N`).
  - La tarjeta maestra `00-0-0000000-0` se renombra a `A-00000-000-H` y
    `bt_crear_tarjeta_alfa` reemplaza a `bt_crear_tarjeta_maestra`.
  - Lotes de 1 a 999 unidades y números de lote de 5 dígitos.
  - Estado `SCRAP` y eventos `RFPGC` / `CHIP_ERR`; nuevo `bt_admin_merma`.
  - Importes enteros en bolívares (pasaje 500, estudiante 250) en tarjetas,
    movimientos, recargas, rutas, viajes y liquidaciones.
- **Migración `0015_lotes_con_mermas.sql`**: `bt_admin_lotes` entrega
  `desechadas` y `sinEnrolar` exactos para que la estación no cuente las
  mermas como trabajo pendiente.
- **Migración `0016_corrige_alfabeto_verificador.sql`**: la clase de
  caracteres de 0014 excluía la `U` del alfabeto verificador; ahora el CHECK y
  las funciones aceptan seriales como `G-00007-005-U`.
- **Firmware v6 del validador**: bloque de identidad v3 con los 10 caracteres
  del serial compacto (`G00001001N`) en el sector 1, tarifa por defecto de
  Bs 500 y montos enteros en el protocolo serie, la pantalla y las colas NVS.
  Las colas heredadas en céntimos se convierten solas al arrancar. El comando
  `ENROLAR` admite `FORZAR` y re-enrolla la maestra en su sitio.
- Documentos BLINK-DOC-12 v2.0.0, BLINK-DOC-13 y BLINK-DOC-14 en `docs/`.

### Cambiado

- **Se retira BLINK PASAJES**: el panel de la línea se archiva y su dominio pasa
  a redirigir a este portal. El perfil ya no muestra el enlace «Panel de la línea»
  y las referencias visibles dicen **BLINK TARJETA** (el titular legal de la
  cuenta de Pago Móvil sigue siendo BLINK PASAJES, C.A.).
- El back-office deja de ofrecer la asignación en taquilla: el flujo es
  estación del propietario → venta en comercios → reclamo en el portal.
- `bs()` del back-office muestra bolívares enteros, sin céntimos.
- El portal del pasajero también muestra bolívares enteros y valida montos sin
  céntimos; la tarjeta virtual oculta la coma cuando no hay decimales.
- El portal vincula con la máscara `G-00001-001-N`, exige la letra
  verificadora mod 23 y el Code 128 del reverso codifica el serial compacto
  alfanumérico con los juegos B y C.
- La semilla de demostración del portal usa la serie nueva y la tarifa de
  500 bolívares.

### Corregido

- **Tarjeta virtual en navegadores sin *container queries*** (iOS 15 y
  anteriores, Android viejo): cada medida del naipe lleva una unidad de
  respaldo proporcional al ancho (`--np`) antes del valor en `cqw`, de modo que
  la maqueta se mantiene aunque el navegador no entienda contenedores. La
  leyenda del reverso se reparte equilibrada y el sello de sincronización queda
  pegado al texto cuando ocupa dos líneas.
- **Migración `0012_asignar_exige_enrolada.sql`**: `bt_estacion_asignar` ya no
  activa plásticos sin `chip_uid`. Antes la taquilla podía asignar una tarjeta
  que el validador no podía leer; ahora responde `bt:sin-enrolar` y remite a la
  estación de enrolado.
- **Migración `0013_portal_exige_enrolada.sql`**: misma guarda en `bt_vincular`
  y en la heredada `bt_activar`; el portal y el back-office reconocen el código
  `sin-enrolar` y muestran el mensaje de la base.

### Documentación

- **Suite documental 1.6.0 (BLINK-DOC-00)**: alcance reducido a TARJETA +
  BACK-OFFICE con el panel fiscal como próximo hito; retiro de PASAJES,
  redirección del dominio y consolidación en `~/BLINK`.
- **BLINK-DOC-06 1.5.0 §5.7** y **BLINK-DOC-07 1.4.0 §4.3**: simulación local del
  flujo completo, puertos, semilla y resultados de la prueba del 2026-10-31.
- **BLINK-DOC-09 1.6.0**: brechas B-03 cerrada y B-04/B-18/B-19 actualizadas,
  deuda D-10 y limitación L-06 del redirect.
- **BLINK-DOC-06 1.4.0 §5.6**: ciclo completo de una recarga (reporte del
  pasajero, bandeja `bt_recargas_pendientes`, revisión contra el banco,
  aprobación/rechazo, entrega al chip por el validador y consultas de
  verificación), con los efectos exactos de cada RPC y los errores típicos.
- **BLINK-DOC-08 1.3.0 §5.1**: resumen operativo de la aprobación para el
  administrador de línea. Suite documental 1.5.2.

### Pendiente

- Recuperación de PIN en el portal.
- Interfaz de aprobación de recargas para el administrador.
- Notificaciones por correo al acreditar una recarga.
- Gestión de operadores y reinicio de TOTP desde la interfaz del back-office.
- Prueba física de enrolado y cobro con el lector (tarea #28).
- Grabado del chip desde la estación web y cola secuencial con *tap & next*.
- Carga de artes y paquete de producción ZIP VDP / PDF-VT.

## [1.4.0] — 2026-10-30

Serial maestro de once dígitos `00-0-0000000-0` y alineación de la guía de
enrolado con el estándar de producción del propietario (impresión ID-1/CR80,
paquete de datos variables y enrolado secuencial).

### Añadido

- **Migración `0010_maestra_once_digitos.sql`**: `bt_crear_tarjeta_maestra` crea
  `00-0-0000000-0` y el evento `ASIGNADA` queda en canal `sistema`; el bloque
  final renumera la maestra existente desde el serial heredado de 10 dígitos y
  registra el cambio en `card_events`.
- **BLINK-DOC-12 v2.0.0**: exclusividad de la estación, distribución pre-enrolada
  sin taquilla, medidas de sangrado/corte/zona segura, paquete ZIP VDP y PDF/VT,
  enrolado en ráfaga con *tap & next* y punto de control, y tabla de estado de
  implementación.
- **Suite de aceptación ampliada** con el serial maestro heredado como caso de
  compatibilidad (BLINK-DOC-07 §3.6).

### Cambiado

- El serial maestro pasa de 10 a 11 dígitos: `barcode_data` queda en
  `00000000000`. La serie de lote no cambia.
- BLINK-DOC-03, 04, 07 y 09 reflejan la migración `0010`; el registro de brechas
  añade B-14 a B-17 (grabado del chip desde el panel, *tap & next*, artes y
  paquete de imprenta, estación exclusiva del propietario).

### Base de datos

- `0010` aplicada en producción el 2026-10-30: la maestra quedó `ACTIVE`,
  `state_code = 0`, `fare_type = 0`, sin `batch_id` y sin UID, con los eventos
  `ASIGNADA` originales más el de la renumeración. Suite `PRUEBAS_0009_OK`.

## [1.3.0] — 2026-10-30

Serie de identificación de siete dígitos (`23-1-0000001-9`), tarjeta maestra del
propietario y guía de enrolado por lotes. La serie heredada de seis dígitos sigue
siendo válida.

### Añadido

- **Migración `0009_serie_siete_digitos.sql`**: `bt_luhn_digito` y
  `bt_luhn_valido` aceptan 10 y 11 dígitos; `bt_generar_lote` numera a siete
  dígitos con `p_desde` opcional y rechaza rangos que se solapan.
- **Tarjeta maestra**: `bt_crear_tarjeta_maestra(cedula, uid, operador, tarifa)`
  la crea activa, asignada a la cuenta dueña, con `fare_type = 0`, fuera de todo
  lote y con bitácora `ASIGNADA`/`ENROLADA`. Solo `service_role`. Nació con el
  serial de 10 dígitos `00-0-000000-0`; `0010` la renumeró a `00-0-0000000-0`.
- **BLINK-DOC-12**: guía de enrolado de lotes, desde la maestra hasta la entrega,
  con verificación y resolución de problemas.
- **Hoja imprimible del lote de arranque** (`lotes/lote-001.csv` y `.html`):
  20 tarjetas `23-1-0000001-9` … `23-1-0000020-9`, cuadradas contra la base.
- **Suite `supabase/pruebas/0009_serie.sql`** con nueve comprobaciones dentro de
  una transacción que termina en `ROLLBACK`.

### Cambiado

- El portal formatea y valida seriales de 10 y 11 dígitos; el Code 128 usa juego
  C con símbolo de cambio a B para el dígito final.
- `cards_visible_id_check` admite `\d{6,7}` en el bloque secuencial;
  `cards_fare_type_check` admite `0` para la maestra.
- La renumeración del lote de arranque es idempotente: se aplica solo a tarjetas
  `FABRICADA` sin UID, sin cuenta y sin movimientos.

### Corregido

- `npm run lote` volvía a fallar con Node 22 por un import sin extensión en
  `src/lib/dominio.ts`; el generador de hojas ya corre con el Node del sistema.

### Firmware (fuera de git: `~/Arduino/BLINK_Validador`)

- Bloque de identidad v2 con el serial en ASCII y longitud explícita (hasta 11
  dígitos); las tarjetas v1 se siguen leyendo. `VERSION_FW = 4`.
- `ENROLAR` acepta seriales de 13 o 14 caracteres y tarifas `0`, `1` y `2`.

### Base de datos

- `0009` aplicada en producción el 2026-10-30: 20 tarjetas renumeradas a
  `23-1-0000001-9` … `23-1-0000020-9`, maestra creada para `V-34201580` (sin
  UID) y suite de aceptación en verde (`PRUEBAS_0009_OK`). El siguiente
  secuencial libre es `21`.

## [1.2.0] — 2026-10-29

Back-office separado del portal, con control de acceso por rol y verificación en
dos pasos; el panel opera con token de sesión, nunca con la clave de servicio.

### Añadido

- **Migración `0007_backoffice_mfa.sql`**: columnas `totp_secret`, `totp_activo`
  y `totp_confirmado_at` en `accounts`, y verificación TOTP RFC 6238 (HMAC-SHA1,
  30 s, 6 dígitos, ventana ±1) implementada en PL/pgSQL sobre `pgcrypto`.
- **Sesiones de back-office**: `bt_admin_sesion` valida token vigente y rol
  `ADMIN`/`TAQUILLA`; `bt_admin_sesion_mfa` exige además el segundo factor.
- **Acceso del operador**: `bt_admin_entrar`, `bt_admin_estado`,
  `bt_admin_mfa_inscribir` y `bt_admin_mfa_activar`. El secreto TOTP solo sale al
  inscribir el dispositivo.
- **RPC administrativas con token**: `bt_admin_resumen`, `bt_admin_lote`,
  `bt_admin_catalogo`, `bt_admin_enrolar` y `bt_admin_asignar`. Concedidas a
  `anon`; las funciones primitivas de operación siguen cerradas.
- **Migración `0008_backoffice_lectura.sql`**: consultas de solo lectura
  `bt_admin_lotes` y `bt_admin_tarjetas` para lotes e inventario.
- **Aplicación BLINK BACK-OFFICE** (`BLINK-SERVERS/BACKOFFICE`), publicada en
  https://blink-servers.github.io/BACKOFFICE/: acceso, inscripción TOTP, resumen,
  lotes, inventario, estación con lector Web Serial y taquilla; exportación CSV.
- **Documentación**: BLINK-DOC-02/03/04/05/06/07/08/09/10 y el índice pasan a
  1.2.0 con las migraciones, el contrato del panel y las pruebas de aceptación.

### Cambiado

- El rol de la cuenta se verifica en **cada** RPC del panel, no solo al entrar;
  retirar el rol invalida la sesión administrativa sin tocar el token.
- El panel guarda el token en `sessionStorage` (se pierde al cerrar la pestaña).
- `bt_admin_tarjetas` devuelve `titular` y `cedula` en `null` para tarjetas sin
  dueño, en lugar del nombre por defecto del plástico.

### Seguridad

- El navegador del operador ya no necesita `service_role`: todas las operaciones
  pasan por RPC que autentican el token en el servidor.
- El código TOTP se verifica en la base; el secreto nunca vuelve en el inicio de
  sesión ni en la consulta de estado.
- Reiniciar la inscripción invalida el secreto anterior; un secreto mostrado en
  una captura o chat se considera expuesto.
- Cinco intentos fallidos siguen bloqueando la cuenta 5 minutos, también en el
  back-office.

### Base de datos

- `0007` y `0008` aplicadas en producción el 2026-10-29, con prueba de aceptación
  (`PRUEBAS_0007_OK`) y `ROLLBACK`. Estado posterior: 20 tarjetas `FABRICADA`,
  1 lote, 1 cuenta administradora con segundo factor pendiente y 0 eventos.

## [1.1.0] — 2026-10-29

Aprovisionamiento en lote y activación por reclamo, con base inicial controlada.

### Añadido

- **Estado `FABRICADA`**: los lotes se pre-generan sin dueño, sin saldo y sin
  acceso al portal (Fase 1 del modelo corporativo).
- **Activación por reclamo**: `bt_vincular` convierte una tarjeta `FABRICADA` en
  `ACTIVE`, sella `asignada_at`/`asignada_por` y escribe la bitácora.
- **Estación de asignación**: `bt_estacion_enrolar` carga pares UID↔serial en
  bloque (hasta 5.000 por tanda) con reporte de rechazos; `bt_estacion_catalogo`
  devuelve la hoja del lote y `bt_estacion_asignar` vincula en taquilla a una
  cuenta existente.
- **Bitácora `card_events`** (`ENROLADA`, `ASIGNADA`, `PERDIDA`) con canal y
  operador.
- **Rol de cuenta** (`PASAJERO`/`TAQUILLA`/`ADMIN`) como base del RBAC del
  back-office.
- **Metadatos de lote**: `origen` (`FABRICANTE`/`ESTACION`), `creado_por` y
  `cerrado_at`; `bt_generar_lote` acepta `p_origen` y devuelve el estado.
- **Purga archivada**: las tablas de demostración se copian a `respaldo.*_0006`
  y la bitácora `respaldo.bitacora` impide repetirla.
- **Cuenta administradora única**: se crea con el PIN recibido por
  `set_config('blink.admin_pin', …)`; el valor no se versiona.
- **Lote de arranque** de 20 tarjetas cuando la base queda vacía.

### Cambiado

- `bt_reportar_perdida` rechaza tarjetas `FABRICADA` (aún sin dueño).
- `bt_resumen_operativo` informa `fabricadas` y `asignadas`.
- `bt_cuenta_json` incluye `rol`.
- La migración 0006 sustituye `bt_generar_lote(int,text,int,int)` por la firma de
  cinco parámetros (compatible: el quinto tiene valor por defecto).

### Seguridad

- `card_events` con RLS y sin permisos para `anon`/`authenticated`.
- Las funciones de estación, lote y resumen quedan solo en `service_role`;
  `anon` conserva únicamente el contrato del portal.
- La purga es reversible desde el esquema `respaldo` (sin RPC, solo consola SQL).

## [1.0.0] — 2026-10-29

Primera versión publicada con cuenta de pasajero y billetera multi-tarjeta.

### Añadido

- **Cuenta del pasajero** (`accounts`): nombres, apellidos, cédula `V/E`,
  teléfono, correo, PIN de 6 dígitos y fuente de Pago Móvil.
- **Billetera multi-tarjeta**: una cuenta puede vincular varias tarjetas por
  serial (`cards.account_id`); carrusel con varias tarjetas en la interfaz.
- **Sesión de cuenta** (`account_sessions`) con token UUID de 12 horas.
- **Registro en dos pasos**: datos personales y luego pregunta de Pago Móvil
  (propia o de un familiar).
- **RPC nuevas**: `bt_registrar`, `bt_sesion`, `bt_vincular`, `bt_actualizar_pago`
  y las nuevas firmas de `bt_entrar`, `bt_movimientos`, `bt_recargar` y `bt_salir`.
- **Tarjeta virtual ID-1/CR80**: proporción 1,586:1 bloqueada, radio
  `clamp(12px, 3.7cqw, 16px)`, bisel interior y sombra difusa; interior escalado
  con container queries.
- **Perfil**: datos de la cuenta, fuente de pago editable, tarjeta seleccionada,
  apariencia y seguridad.
- **Documentación ISO**: suite `docs/` (BLINK-DOC-00 a 10) y este CHANGELOG.

### Cambiado

- El PIN dejó de vivir en el plástico y pasó a la cuenta (6 dígitos, sin
  repeticiones ni secuencias).
- `bt_movimientos` y `bt_recargar` ahora reciben el serial de la tarjeta.
- El enlace a BLINK PASAJES apunta a `https://pasajes.blink.com.ve/`.
- La tarjeta virtual usa `aspect-ratio` en lugar de `min-height`, y todas las
  medidas interiores se expresan en `cqw`.

### Corregido

- La tarjeta se deformaba en pantallas de 280–360 px: se eliminó `min-height` y se
  escaló el contenido con unidades de contenedor.
- El titular mostrado en la billetera es siempre el de la cuenta (no el grabado
  en la tarjeta).

### Seguridad

- `accounts` y `account_sessions` con RLS y sin permisos para `anon`/`authenticated`;
  acceso solo mediante RPC `security definer`.
- PIN almacenado con bcrypt (`extensions.crypt`, costo 10).
- Bloqueo de 5 minutos tras 5 intentos fallidos.
- Validación de tarjeta bloqueada, vencida, duplicada o de otra cuenta antes de
  vincular.
- Límite de 6 reportes de recarga por tarjeta cada 10 minutos y rechazo de
  referencias repetidas.

### Eliminado

- Firmas anteriores `bt_movimientos(text,int)` y
  `bt_recargar(text,numeric,text,text,text)` (reemplazadas por versiones con serial).

### Base de datos

- Migración `0005_cuentas.sql` aplicada en producción el 2026-10-29 (PostgreSQL
  17.11). Verificada con 14 casos RPC como rol `anon` y `ROLLBACK`.

## Historial anterior a 1.0.0

Commits que construyeron el producto (rama `main`):

| Fecha | Commit | Cambio |
| --- | --- | --- |
| 2026-10-28 | `486dd48` | Portal del pasajero con tarjeta recargable. |
| 2026-10-28 | `eb76d72` | Claves de Supabase desde variables del repositorio. |
| 2026-10-29 | `23b1af3` | ID BLINK de 10 dígitos con Luhn. |
| 2026-10-29 | `5dd8354` | Alineación con el esquema del manual técnico del ecosistema. |
| 2026-10-29 | `e88ddb9` | Generador de lotes con serial Luhn y hoja de impresión. |
| 2026-10-29 | `20ac8e3` | Cierre de las funciones de operación a `anon`. |
| 2026-10-29 | `58e1e5a` | Cuenta de pasajero con billetera multi-tarjeta. |
| 2026-10-29 | `69cb2d3` | Tarjeta virtual con proporción ID-1/CR80 bloqueada. |

## Cómo mantener este archivo

- Añade entradas bajo `[No publicado]` mientras desarrollas.
- Al publicar, renombra a `[x.y.z] — AAAA-MM-DD` y crea un nuevo `[No publicado]`.
- Usa las categorías: Añadido, Cambiado, Obsoleto, Eliminado, Corregido, Seguridad.
- Un cambio incompatible de RPC o esquema obliga a subir la versión mayor.
