# BLINK · interfaz datáfono 240×240 (ISO-UI-240-REV2)

| Campo | Valor |
| --- | --- |
| Código | BLINK-DOC-18 |
| Versión | 1.2.0 |
| Fecha | 2026-11-01 |
| Estado | Vigente |
| Autor | Equipo BLINK (desarrollo asistido) |
| Normas de referencia | ISO 9241-3 · ISO/IEC 25010 · ISO/IEC 27001 · ISO/IEC/IEEE 26514 |

## 1. Objetivo y alcance

Adoptar la especificación externa `ISO-UI-240-REV2` —interfaz de estilo
datáfono sobre un panel TFT IPS de 240×240— en el validador BLINK con firmware
8, y dejar constancia de **qué se cumple, qué se adapta y qué se desvía con
motivo**, con la evidencia de las mediciones hechas sobre la unidad física
(`A12BC3D`, MAC `1C608BDF948C`).

La pantalla no solo informa la transacción: en reposo conserva el **panel de
estado vivo** que el propietario pidió para operar sin consola (enlace, última
tarjeta, cola, GPS y tarifa). El resultado del cobro, en cambio, pasa a ocupar
la pantalla completa, como pide la especificación.

Documentos relacionados: BLINK-DOC-17 (códigos POS y contrato serie),
BLINK-DOC-16 (cobro offline y estado incierto), BLINK-DOC-07 §4 (pruebas).

## 2. Veredicto por requisito

| Requisito de `ISO-UI-240-REV2` | Estado | Dónde |
| --- | --- | --- |
| Tres zonas: barra 0–30, núcleo 31–180, banda 181–240 | Cumplido con 3 px de ajuste en la banda (184–240) | §3 |
| Logotipo `BLINK` arriba a la izquierda | Cumplido | §3 |
| Indicador de latido de nube arriba a la derecha | Cumplido (verde / ámbar / rojo) | §3.2 |
| Reposo: fondo negro `#000000` | Cumplido | §4 |
| Reposo: icono NFC azul `#007AFF` y «ACERQUE SU TARJETA» | Cumplido | §4 |
| Pie de reposo con tarifa base | Cumplido | §4 |
| Banda amarilla `#FFD700` con texto negro sin conexión | Cumplido y persistente (ADR-15) | §4.2 |
| Aprobado: fondo verde sólido `#00C853`, ✓ blanco, «APROBADO» | Cumplido | §5 |
| Aprobado: `- 5,00 Bs` y `Saldo: 2.450,00 Bs` | Cumplido (importe en tinta oscura, §10) | §5 |
| Retención de aprobado de 2,5 s | Cumplido (`RESULTADO_OK_MS = 2500`) | §5 |
| Denegado: fondo rojo sólido `#D50000`, ✗ blanco, «DENEGADO» | Cumplido | §6 |
| Denegado: motivo normado en el pie | Cumplido (`SALDO INSUFICIENTE`, `BLOQUEADA`, …) | §6 |
| Retención de denegado de 3,0 s | Cumplido (`RESULTADO_ERROR_MS = 3000`) | §6 |
| Cambio de color sólido en menos de 50 ms | Cumplido: 39–40 ms medidos | §7 |
| Prohibido bajar de 12 px en montos y saldos | Cumplido: mínimo tamaño 2 (12×16 px) | §10 |
| Multiplicador `(x2)` por multi-toque | No aplica: un toque = un pasaje (ADR-09) | DOC-16 |
| Apertura de relé | No aplica al hardware (ADR-11) | DOC-16 |

## 3. Arquitectura de pantalla

El lienzo de 240×240 se divide en tres capas, de arriba abajo:

| Zona | Filas | Contenido |
| --- | --- | --- |
| Barra superior | 0–29 | `BLINK` (18×24 px) y, a la derecha, unidad + placa; punto de latido |
| Núcleo | 30–183 | Diagnóstico en reposo; icono a pantalla completa durante el resultado |
| Banda inferior | 184–239 | Aviso amarillo o cola/GPS/tarifa; en el resultado, nada (el fondo es sólido) |

La especificación fija el núcleo hasta 180 y la banda desde 181. Se usa 184
porque la banda de reposo necesita tres líneas de 8 px con aire (aviso, GPS y
tarifa) y el resultado ocupa toda la pantalla, así que la diferencia de 3 px
solo afecta al panel de reposo. La desviación se registra en §12.

### 3.1 Barra superior

Fondo azul corporativo `#0088FF`. A la izquierda, `BLINK` en blanco; a la
derecha, `U<unidad> <placa>` o solo la placa si el equipo no está numerado. La
cabecera no se repinta en cada actualización: solo cambia al arrancar o al
cerrar un resultado.

### 3.2 Latido de nube

Un disco de 10 px en la esquina superior derecha resume el enlace:

| Color | Condición | Significado |
| --- | --- | --- |
| Verde `#22C55E` | Wi-Fi conectada, token provisionado y última sincronización < 180 s | Sincronizado con Supabase |
| Ámbar `#FFA500` | Conectada pero sin token, o con sincronización vieja | Enlace sin nube |
| Rojo `#EF4444` | Sin Wi-Fi | Modo local |

El punto se cachea por estado: si el color no cambia no se vuelve a escribir,
para no repintar la barra cada segundo.

## 4. Estado de reposo (standby)

Fondo negro absoluto `#000000`. Debajo de la barra se conserva el panel de
diagnóstico, que es una **desviación razonada** respecto a la especificación
(ADR-14):

| Franja | Filas | Contenido |
| --- | --- | --- |
| Enlace | 32–55 | Wi-Fi y sincronización; IP y versión de firmware |
| Última tarjeta | 58–103 | Tipo, estado, serial y saldo de la última lectura |
| Núcleo | 106–183 | Icono NFC azul `#007AFF` con ondas y «ACERQUE SU TARJETA» (12×16 px) |
| Banda | 184–239 | Banda amarilla si no hay red; si hay, cola, GPS y tarifa |

### 4.1 Pie con tarifa

Con conexión, la banda muestra en gris `Pend <n> Blq <n> Log <n>`, debajo el
GPS (`GPS 10.1234,-66.5678` o `GPS sin fix`) y la tarifa vigente
(`Tarifa 5,00 Bs`) con `Fw8 <n>min` a la derecha.

### 4.2 Banda amarilla sin conexión

Cuando el equipo no tiene Wi-Fi, la banda entera (184–239) pasa a amarillo
`#FFD700` con texto negro: `SIN CONEXION A INTERNET` y, si hay cobros
encolados, `- <n> PEND`. Es **persistente**: no parpadea ni se oculta, para que
el pasajero y el conductor sepan que los cobros se están guardando en local
(ADR-15). El contraste negro sobre amarillo es de 15:1.

### 4.3 Pantalla de configuración Wi-Fi (firmware 9)

Cuando el validador abre su punto de acceso temporal, la pantalla deja el panel
de reposo y muestra la vista `VISTA_CONFIG`. **No lleva cabecera, tarifa, cola
ni latido**: solo el dato que el chofer necesita en ese momento. La vista tiene
dos estados que se alternan según los teléfonos unidos al AP
(`PORTAL,clientes=N`).

**Estado 1 — nadie conectado: código QR.**

| Franja | Contenido |
| --- | --- |
| QR (y 12–197) | Matriz de 29×29 módulos (versión 3, `ECC_LOW`) con 4 módulos de silencio y 5 px por módulo: 185×185 px, centrada en x=27, módulos negros sobre blanco |
| Llamada (y 205) | `ESCANEA` en blanco, 2× |
| Ayuda (y 230) | `con la camara del telefono` en gris, 1× |

El contenido es `WIFI:T:nopass;S:BLINK-XXXX;P:;;`: el teléfono propone unirse
a la red con un toque, sin teclear el nombre. La matriz se genera en RAM
(búfer fijo de 112 B) con la biblioteca QrBlink; si no cupiera, la pantalla
muestra `ERROR QR` con el nombre de la red y la consola informa
`PANTALLA,qr=error,datos=…`. Al pintar se registra `PANTALLA,qr=1,modulos=29,px=185`.

**Estado 2 — al menos un teléfono unido: instrucciones.**

| Franja | Contenido |
| --- | --- |
| Título (y 44) | `YA CONECTADO` en verde, 2× |
| Dirección (y 92–106) | `Abre en el navegador` en gris y `192.168.4.1` en blanco, 2× |
| Ayuda (y 138) | `y elige tu red Wi-Fi` en gris, 1× |
| Cuenta (y 198) | `quedan N min` en ámbar, 1×; se repinta solo esta línea cada segundo |

Al entrar el primer cliente se repinta la vista completa; al salir el último
(`PORTAL,clientes=0`) vuelve el QR. Mientras `VISTA_CONFIG` está activa el
refresco de estado de 3 s no repinta, para no pisar el mensaje. Al cerrar la
ventana la pantalla vuelve al panel de reposo. La lógica de provisión está en
BLINK-DOC-06 §6.1 y las pruebas en BLINK-DOC-07 §4.11; el QR se verificó
decodificando la misma matriz fuera del equipo, pero la lectura con la cámara
de un teléfono aún no se ha comprobado en hardware.

## 5. Transacción aprobada (2,5 s)

| Elemento | Valor |
| --- | --- |
| Fondo | Verde sólido `#00C853` |
| Icono | Visto bueno de 60×60 px trazado en blanco |
| Título | `APROBADO` (18×24 px) en blanco |
| Importe | `- 5,00 Bs` (18×24 px o 12×16 px si no cabe) en tinta `#00331A` |
| Saldo | `Saldo: 2.450,00 Bs` (12×16 px) en tinta `#00331A` |
| Código | `ISO-00` en 6×8 px al pie |
| Retención | 2,5 s y vuelta al panel de reposo |

El importe se calcula con el monto realmente descontado del chip. El código
POS (`ISO-00`) llega del mismo mapeo que el campo `codigo=` del mensaje `TAP`
(BLINK-DOC-17 §4).

## 6. Transacción denegada (3,0 s)

| Elemento | Valor |
| --- | --- |
| Fondo | Rojo sólido `#D50000` |
| Icono | Cruz de 48×48 px trazada en blanco |
| Título | `DENEGADO` (18×24 px) en blanco |
| Motivo | `SALDO INSUFICIENTE`, `BLOQUEADA`, `NO LEGIBLE`, `REPITA EL TOQUE`, `VERIFICAR`… (12×16 px) |
| Serial | Serial de la tarjeta en 6×8 px |
| Saldo | `Saldo: …` (12×16 px) si el chip lo pudo leer |
| Código | `ERR-xx` en 6×8 px al pie |
| Retención | 3,0 s y vuelta al panel de reposo |

Los textos de motivo salen del catálogo de BLINK-DOC-17 §4 y son los mismos
que el código POS. El serial permite al operador identificar la tarjeta sin
consola.

## 7. Tiempo de renderizado (< 50 ms)

La especificación exige que el cambio de color sólido se complete en menos de
50 ms para acompañar el decremento del chip y la apertura del relé. Se mide
dentro del firmware, con `micros()`, desde el primer `fillScreen` hasta el
último píxel enviado.

| Reloj SPI | Relleno de 240×240 | Resultado completo |
| --- | --- | --- |
| 24 MHz | 57 ms | 63 ms |
| 32 MHz | 46 ms | — |
| 40 MHz | 34 ms | **39 ms (ok) / 40 ms (no)** |

Se fija **40 MHz**: el ST7789 admite hasta 62,5 MHz y el ESP32 divide los
80 MHz del bus; a 40 MHz el resultado completo queda dentro del límite con
margen. El RC522 no se ve afectado porque la librería abre su propia
transacción a 4 MHz en cada acceso (`MFRC522DriverSPI`).

El comando serie `PANTALLA_TEST` pinta las dos pantallas de resultado y el
panel de reposo, e informa cada tiempo sin gastar un toque de tarjeta:

```
> PANTALLA_TEST
PANTALLA,ms=39,vista=ok
PANTALLA,ms=40,vista=no
PANTALLA,ms=95,vista=panel
OK,pantalla
```

La vuelta al panel de reposo tarda 95 ms: es posterior a la retención y no
forma parte del cambio de color de la transacción.

## 8. Arquitectura de renderizado

Dibujar texto y líneas directamente sobre el panel cuesta una transacción SPI
por píxel (5–6 µs), y las pantallas de resultado medían 111–151 ms. La solución
tiene tres piezas:

1. **Lienzo de media pantalla en RAM.** `GFXcanvas16` de 240×120 px (57,6 KB)
   sobre un búfer reservado con `malloc`. Compuesto en RAM, el texto no toca
   el bus.
2. **Dos pasadas.** La escena se dibuja completa en coordenadas absolutas dos
   veces: la primera llena las filas 0–119 y la segunda, con un
   desplazamiento de −120 px, las filas 120–239. Las primitivas suman
   `desplazamientoY` y el lienzo recorta lo que cae fuera.
3. **Envío en bloques de 40 líneas.** `setAddrWindow(0, y0, 240, 120)` una vez
   por pasada y `writePixels` de 9 600 píxeles por bloque.

Por qué media pantalla y no completa: el heap del ESP32 no tiene un bloque
contiguo de 115 KB. En el arranque medido, con 268 564 bytes libres, el mayor
hueco era de **110 580 bytes** (el heap está partido en regiones). Un lienzo
completo de 115 200 bytes no se puede reservar; uno de 57 600 sí.

El lienzo se reserva en `pantallaReservar()`, la **primera** llamada de
`setup()`, antes de Wi-Fi y del sistema de archivos: después de arrancarlos el
hueco contiguo desaparece. Si la reserva falla, la interfaz sigue funcionando
dibujando directo sobre el panel (más lento) y el arranque lo informa por serie:

```
PANTALLA,lienzo=ram,heap=209108
```

`ram` indica lienzo en memoria; `directo`, el respaldo.

## 9. Decisiones

### ADR-14 · Resultado a pantalla completa y vuelta al panel de diagnóstico

**Decisión.** El cobro y el rechazo ocupan los 240×240 px durante 2,5 s y 3,0 s
respectivamente; al vencer la retención se repinta el panel de estado vivo.

**Motivo.** La especificación pide color sólido a pantalla completa para la
retroalimentación inmediata, y el propietario pidió conservar el diagnóstico
del equipo. Ambas cosas caben si se separan en el tiempo: el pasajero ve el
resultado sin ruido visual y el operador recupera el panel en cuanto termina.

**Contrapartida.** La pantalla de reposo no es la minimalista de la
especificación: conserva seis franjas de datos. Se documenta como desviación y
se mantiene porque el diagnóstico ya se usa a diario (ADR-12).

### ADR-15 · Banda amarilla persistente cuando no hay internet

**Decisión.** Sin Wi-Fi, la banda inferior se pinta entera de amarillo
`#FFD700` con texto negro y el número de cobros pendientes; con Wi-Fi vuelve a
la banda de cola/GPS/tarifa.

**Motivo.** La especificación exige transparencia operativa cuando se pierde el
enlace. Una banda persistente no se puede confundir con una transacción y
recuerda que los cobros se están guardando en local hasta sincronizar.

**Contrapartida.** Ocupa 56 px de alto y reduce la información de cola a un
solo dato cuando el equipo está offline; la cola completa sigue en `INFO`.

## 10. Contraste y legibilidad

La fuente de la librería es ASCII de 6×8 px; cada tamaño multiplica por
enteros, así que los tamaños posibles son 6×8, 12×16 y 18×24 px. Los montos y
saldos usan **12×16 px como mínimo** (tamaño 2), cumpliendo la regla de 12 px.
Si un saldo largo no cabe con el prefijo `Saldo: … Bs`, se recorta el prefijo
antes que bajar la fuente (`textoSaldo()`), y el valor solo cabe siempre a
12 px hasta 999.999.999,00 Bs.

| Combinación | Contraste | Uso |
| --- | --- | --- |
| Blanco sobre verde `#00C853` | ≈ 2,2:1 | Icono y título de aprobado |
| Tinta `#00331A` sobre verde `#00C853` | ≈ 6,3:1 | Importe y saldo de aprobado |
| Blanco sobre rojo `#D50000` | ≈ 5,5:1 | Todo el rechazo |
| Negro sobre amarillo `#FFD700` | ≈ 15:1 | Banda sin conexión |
| Blanco sobre azul `#0088FF` | ≈ 3,5:1 | Cabecera |
| Azul `#007AFF` sobre negro | ≈ 5,2:1 | Icono NFC |

El blanco sobre el verde de la especificación no llega al 4,5:1 de ISO 9241
para texto pequeño. Por eso el título y el icono (grandes y con forma) quedan
en blanco, como pide la especificación, y **los importes y saldos usan tinta
oscura** `#00331A`, que sí supera el umbral. La cabecera azul con texto blanco
de 6×8 px queda por debajo del umbral y se registra como brecha (B-25).

## 11. Verificación

| Fecha y hora | Prueba | Resultado |
| --- | --- | --- |
| 2026-10-31 23:31 | Compilación del firmware 8 | 1 219 075 bytes (93 %), 51 956 bytes de RAM (15 %) |
| 2026-10-31 23:31 | Arranque tras el flasheo | `PANTALLA,lienzo=ram,heap=209108` y `READY,BLINK,8,0,0` |
| 2026-10-31 23:31 | `PANTALLA_TEST` con lienzo en RAM | `ms=39 vista=ok`, `ms=40 vista=no`, `ms=95 vista=panel` |
| 2026-10-31 | Sondeo de reloj SPI (compilación de prueba) | 24 MHz: 57 ms de relleno; 32 MHz: 46 ms; 40 MHz: 34 ms |
| 2026-11-01 | Compilación del firmware 9 (portal Wi-Fi) | 1 265 479 bytes (96 %), 52 636 bytes de RAM (16 %) |
| 2026-11-01 | Apertura del portal desde el equipo | `PORTAL,abierto,red=BLINK-948C,ip=192.168.4.1,min=5,qr=WIFI:T:nopass;S:BLINK-948C;P:;;` y vista `VISTA_CONFIG` activa |
| 2026-11-01 | Compilación con la pantalla QR | 1 271 599 bytes (97 %) y arranque limpio (`READY,BLINK,9,…`) |
| 2026-11-01 | Dibujo del QR | `PANTALLA,qr=1,modulos=29,px=185` (185 px, 5 px por módulo, 4 de silencio) |
| 2026-11-01 | Teléfono unido y retirado | `PORTAL,clientes=1` cambia a `YA CONECTADO` con `192.168.4.1`; `PORTAL,clientes=0` vuelve a pintar el QR |
| 2026-11-01 | Decodificación del QR | La misma matriz generada en el host con QrBlink devuelve `WIFI:T:nopass;S:BLINK-948C;P:;;` con `cv2.QRCodeDetector` a 1:1 y a 0,5× |
| Pendiente | Escanear el QR con la cámara de un teléfono | Que el sistema proponga unirse a `BLINK-948C` y que la pantalla cambie sola a las instrucciones |
| Pendiente | Toque real con la maestra | Ver el verde con `ISO-00` y volver al panel a los 2,5 s |
| Pendiente | Toque sin saldo | Ver el rojo con `SALDO INSUFICIENTE` durante 3 s |
| Pendiente | Apagar el router y mirar la banda | Amarillo `SIN CONEXION A INTERNET` persistente |

El sondeo y las mediciones se hicieron con la tarjeta maestra ya probada en
hardware y sin tarjetas encima del lector. La comprobación visual de los
colores y de la banda amarilla requiere al operador.

## 12. Límites conocidos

1. La banda inferior empieza en 184 px y no en 181, por las tres líneas del
   panel de reposo (§3).
2. El panel de reposo conserva el diagnóstico del equipo; no es la pantalla
   minimalista de la especificación (ADR-14).
3. El blanco sobre el verde de aprobado queda en 2,2:1; los montos usan tinta
   oscura y el título/icono quedan en blanco por mandato de la especificación.
   La cabecera azul con texto de 6×8 px queda en 3,5:1 (B-25).
4. El icono de visto bueno y la cruz son trazos de líneas, no glifos
   tipográficos: la fuente ASCII no los incluye.
5. No hay multiplicador `(x2)`: un toque, un pasaje (ADR-09). Pagar dos exige
   retirar la tarjeta entre toques.
6. Los códigos POS se muestran y salen por serie, pero no se cuentan en la
   nube (B-24).
7. La vuelta al panel de reposo tarda 95 ms y se nota como un repintado; no
   afecta al límite de 50 ms, que aplica al cambio de color de la transacción.
8. El reloj SPI de 40 MHz se eligió por medición de tiempo, no por análisis
   de integridad de señal: si en una unidad aparecieran píxeles sueltos, el
   primer ajuste es volver a 24 MHz (63 ms) y aceptar la desviación del límite.

## 13. Referencias

- `ISO-UI-240-REV2` (especificación externa del propietario, 2026-10-31).
- BLINK-DOC-17 (interfaz del validador y códigos POS).
- BLINK-DOC-16 (cobro offline, estado incierto, ADR-09 a ADR-11).
- BLINK-DOC-07 §4.7 (pruebas del firmware 8) y §4.6 (códigos POS del firmware 7).
- BLINK-DOC-09 (B-24, B-25).
- `firmware/validador/README.md` (protocolo serie, `PANTALLA_TEST`).
