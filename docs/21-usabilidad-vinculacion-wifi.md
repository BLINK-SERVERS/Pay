# BLINK · usabilidad de la vinculación Wi-Fi del validador

| Campo | Valor |
| --- | --- |
| Código | BLINK-DOC-21 |
| Versión | 1.0.0 |
| Fecha | 2026-11-01 |
| Estado | Vigente (verificado en banco; medición con choferes pendiente) |
| Autor | Equipo BLINK (desarrollo asistido) |
| Normas de referencia | ISO 9241-11:2018 · ISO 9241-110:2020 · ISO 9241-210:2019 · ISO/IEC 25010:2011 · ISO/IEC/IEEE 26514:2022 · ISO 9241-303:2011 |

## 1. Objetivo y alcance

Este documento explica cómo se diseñó, verificó y se medirá el flujo con el que
el **chofer vincula el validador a una red Wi-Fi** (hotspot del teléfono o red
del garaje/terminal), y cómo ese flujo responde a los criterios de usabilidad de
la familia ISO 9241 y de ISO/IEC 25010.

**Dentro del alcance:** la pantalla del validador durante la configuración, la
página web que sirve el propio equipo en `192.168.4.1`, la máquina de estados de
la vinculación (espera, conexión, resultado), el manejo de errores y el
protocolo de medición con usuarios reales.

**Fuera del alcance:** la interfaz de cobro (BLINK-DOC-18), el enrolado
(BLINK-DOC-12) y las pantallas del portal del pasajero o del back-office. La
operación y los comandos de consola están en BLINK-DOC-06 §6; las pruebas, en
BLINK-DOC-07 §4.11.

### 1.1 El problema de partida

La versión inicial del modo configuración (firmware 9, 2026-11-01) ya evitaba la
consola serie, pero seguía pidiendo al chofer algo que no hace en su día a día:
pulsar «Buscar redes», leer una lista, teclear el nombre de la red, la clave y
recordar qué significaba cada aviso. Además, el punto de acceso se cerraba
2,5 s después de guardar **aunque la red no hubiera conectado**, y el mensaje
del teléfono decía «apaga y enciende el validador para repetir». Para un
conductor sin costumbre tecnológica, ese cierre prematuro convertía un error de
tecleo en un reinicio del equipo, con el autobús esperando.

La revisión de usabilidad cambió tres cosas: **cero tecleo del nombre de la
red**, **resultado explícito en el teléfono y en la pantalla** y **reintento sin
apagar el equipo**.

## 2. Perfil de usuario y contexto de uso

ISO 9241-11 exige describir a los usuarios, sus metas, las tareas y el entorno
antes de juzgar la usabilidad. El perfil se construyó con la información del
propietario y de la operación de la línea; la validación con choferes reales es
una brecha abierta (B-34).

| Dimensión | Descripción |
| --- | --- |
| Usuario | Chofer de transporte público, 25–65 años, alfabetización digital baja o media. Su teléfono es Android de gama media o iPhone; usa sobre todo mensajería y llamadas. No administra redes ni conoce términos como SSID, DHCP o portal cautivo. |
| Meta | Que el validador tenga Internet para subir los cobros que guarda en local, sin detener el servicio más de lo necesario. |
| Tareas | Unirse a la red del equipo, elegir la red destino, escribir la clave, confirmar y comprobar el resultado. |
| Entorno | Autobús o terminal, luz solar directa sobre la pantalla, ruido, movimiento, guantes, una sola mano libre, interrupciones para cobrar. |
| Equipo | Validador ESP32 con panel de 240×240 px y un punto de acceso abierto temporal; teléfono con cámara y navegador. |
| Restricciones | Ventana de configuración de 5 minutos; el equipo no puede quedarse sin cobrar; el AP abierto es un riesgo de seguridad (R-16). |
| Consecuencias de diseño | No se teclea ningún nombre de red; objetivos táctiles de 52–58 px; textos cortos sin jerga; alto contraste para el sol; el resultado se repite en dos superficies (teléfono y panel) para que no dependa de mirar una sola. |

## 3. Requisitos de usabilidad y criterio de aceptación

Las tres medidas de ISO 9241-11 —eficacia, eficiencia y satisfacción— se
traducen a requisitos verificables. Los valores son objetivos de diseño; la
medición de campo es el paso pendiente de §10.

| ID | Requisito | Métrica | Objetivo | Estado |
| --- | --- | --- | --- | --- |
| RU-01 | Eficacia: el chofer logra vincular el equipo sin ayuda | Porcentaje de participantes que completan la tarea en el primer intento | ≥ 95 % (5 de 5 en la muestra mínima, con 0 intervenciones) | Verificado en banco; pendiente con choferes |
| RU-02 | Eficiencia: la tarea se hace rápido | Tiempo desde que el QR aparece hasta `CONECTADA`; número de toques | ≤ 90 s y ≤ 6 toques (sin contar la clave) | En banco: 4 toques y enlace confirmado 4 s después de guardar; el tiempo total con usuario se mide en §10 |
| RU-03 | Tolerancia al error | Errores de clave o de red por sesión; recuperación sin reiniciar | ≤ 1 error; 100 % de recuperación en la misma ventana | Verificado: el fallo mantiene el AP y extiende la ventana a 3 min |
| RU-04 | Satisfacción | Cuestionario SUS (10 ítems) al terminar | ≥ 75 puntos | Pendiente (B-34) |
| RU-05 | Aprendizaje | Segunda vinculación, una semana después | ≤ 45 s y sin consultar el manual | Pendiente (B-34) |
| RU-06 | Accesibilidad táctil y visual | Tamaño mínimo de objetivo; contraste de texto | ≥ 48 px de alto; ≥ 4,5:1 | Cumple: botones de 52 px y redes de 58 px; contrastes de 6,2:1 a 17:1 (§4.1) |
| RU-07 | Recuperación del sistema | Si el teléfono se desconecta, la ventana sigue usable | Volver al QR y poder reintentar | Verificado en banco |

### 3.1 Contraste medido de la página

La página usa fondo `#0B1220`, texto `#EEF4FF`, pista `#8FA3BF` y azul de acción
`#2F9BFF`. Relaciones calculadas con la fórmula de luminancia relativa
(WCAG 2.1 / ISO 9241-303):

| Combinación | Relación | Uso |
| --- | --- | --- |
| Texto sobre fondo | 16,96:1 | Párrafos y títulos |
| Pista sobre fondo | 7,27:1 | Ayudas y subtítulos |
| Texto oscuro sobre azul | 6,18:1 | Botón «Guardar y conectar» |
| Azul sobre fondo | 6,47:1 | Enlaces y foco |
| Aviso sobre su caja | 11,62:1 | Mensajes de error |
| Icono de error / de éxito | 5,53:1 / 7,75:1 | Resultado |

## 4. Correspondencia con ISO 9241-110

La norma fija siete principios de diálogo. La tabla los cruza con la decisión de
diseño concreta y con la evidencia que la respalda; las rutas son las del
firmware `~/BLINK/firmware/validador`.

| Principio | Decisión de diseño | Evidencia |
| --- | --- | --- |
| **Adecuación a la tarea** | La pantalla y la página solo contienen lo necesario para vincular: ni logotipo, ni tarifa, ni cola de cobros, ni latido de nube. La página abre directamente en el formulario y busca redes sola. | `pantalla.cpp` (`pantallaConfig…`), `red.cpp` (`paginaConfig`), BLINK-DOC-18 §4.3 |
| **Autodescripción** | Tres pasos numerados («Elige tu red», «Escribe la clave», «Toca Guardar»), un indicador de estado siempre visible («Sin red guardada», «Conectando a…», «Conectado a…», «No se pudo conectar») y una pantalla de resultado en el propio equipo. | `red.cpp` §`paginaConfig`; `/estado`; registros `PORTAL,conectado` / `PORTAL,fallo` |
| **Conformidad con las expectativas** | La red del equipo se ofrece con QR `WIFI:T:nopass;…`, igual que una red doméstica; la elección de red es una lista tocable como la de los ajustes del teléfono; la clave se puede mostrar con «Ver»; el botón dice «Guardar y conectar». | QR de la pantalla (DOC-18 §4.3), `onNotFound` redirige a `/` (portal cautivo), botón `#ver` |
| **Tolerancia al error** | La lista se puede actualizar; si el nombre falta se explica qué hacer; un fallo de conexión **no cierra el AP**: la ventana se extiende a 3 minutos, la red elegida queda escrita en el campo y el botón «Volver a intentar» regresa al formulario. | `PORTAL_FALLO_MS`, `PORTAL_FALLO`, botón `#reintentar`; prueba 20 de DOC-07 §4.11 |
| **Control del usuario** | Puede elegir de la lista o escribir el nombre; puede refrescar; «Más opciones» permite olvidar la red guardada o terminar la configuración; una red abierta no exige clave (el campo se deshabilita). | `#refrescar`, `<details>`, `/olvidar`, `/cerrar`, `elegir()` |
| **Capacidad de aprendizaje** | No hay menús ni pasos ocultos: el mismo flujo sirve la primera vez y las siguientes. El lenguaje es el del teléfono («hotspot», «red», «clave»), no el de la red («SSID», «PSK», «DHCP»). | Textos de la página; BLINK-DOC-08 §2.2 |
| **Individualización** | La interfaz se adapta al contexto: fondo oscuro para el sol, botones grandes para una mano con guantes, textos de 15–22 px y la posibilidad de mostrar la clave para quien la escribe despacio. | Hoja de estilo de `red.cpp`; RU-06 |

## 5. Flujo de vinculación

### 5.1 Los tres pasos del chofer

| Paso | Acción del chofer | Lo que ve | Lo que registra el equipo |
| --- | --- | --- | --- |
| 1 | Enciende el equipo y apunta la cámara al QR. | `ESCANEA` y `con la camara del telefono`; al unirse, `YA CONECTADO` con `192.168.4.1`. | `PORTAL,abierto,…`, `PANTALLA,qr=1,…`, `PORTAL,clientes=1` |
| 2 | Toca su red en la lista (o la escribe) y pulsa «Ver» si quiere comprobar la clave. | Lista de redes con barras de señal y la etiqueta «Con clave»/«Abierta»; el campo de red se rellena solo. | `PORTAL,redes=N` |
| 3 | Toca «Guardar y conectar». | Rueda de espera «Conectando a …» y, después, visto bueno «Conexión lista» con la IP; si falla, «No se pudo conectar» y «Volver a intentar». | `PORTAL,guardado,…`; `PORTAL,conectado,…` o `PORTAL,fallo,…`; `PORTAL,cerrado` |

La página no obliga a pulsar «Buscar redes»: el barrido se lanza al abrir y el
botón «Actualizar lista» existe solo como recurso. El campo de red tiene
`autocapitalize="none"` y `autocorrect="off"` para que el teléfono no cambie el
nombre; la clave se escribe con el teclado normal y se puede revelar.

### 5.2 Máquina de estados y tiempos

La vinculación dejó de ser «guardar y cerrar»: el equipo **confirma el enlace
antes de bajar el punto de acceso**. Los tiempos están en `config.h`.

| Estado | Cuándo | Qué muestra el teléfono | Qué muestra el panel | Salida |
| --- | --- | --- | --- | --- |
| `PORTAL_ESPERA` | Ventana abierta, sin red elegida | Formulario con pasos y lista | QR o instrucciones | Al guardar |
| `PORTAL_CONECTANDO` | 800 ms después de guardar; se aplican las credenciales | «Conectando a …» con rueda | `CONECTANDO` + red + «Espera unos segundos» | Al asociarse o a los 25 s |
| `PORTAL_LISTO` | El equipo está asociado **a la red elegida** | Visto bueno, IP y «Ya puedes cerrar esta página» | `CONECTADA`, IP y «ya tiene internet» | Cierra el AP 10 s después |
| `PORTAL_FALLO` | Pasaron 25 s sin asociarse | «No se pudo conectar», causa probable y «Volver a intentar» | `NO SE PUDO CONECTAR`, red y «Revisa la clave…» | Reintento; ventana extendida a 3 min |

- `PORTAL_PRUEBA_MS = 25 000`: margen para que un hotspot lento asocie y reparta
  IP. Es mayor que el tiempo típico de asociación (1–3 s) para no declarar un
  fallo falso, y menor que la ventana total.
- `PORTAL_CIERRE_OK_MS = 10 000`: deja leer el resultado y la IP en el teléfono
  antes de que el AP desaparezca.
- `PORTAL_FALLO_MS = 180 000`: tras un fallo, la ventana se alarga para corregir
  la clave sin reiniciar. La página sigue respondiendo aunque el teléfono se
  haya quedado sin ruta un instante: el sondeo `/estado` reintenta cada 2 s.
- La decisión de éxito exige `WiFi.status() == WL_CONNECTED` **y** que el SSID
  asociado sea el elegido. Sin la segunda condición, un equipo todavía unido a
  la red anterior se declaraba conectado antes de intentar la nueva (defecto
  detectado y corregido en banco el 2026-11-01; ver ADR-24).

## 6. Manejo de errores

| Situación | Lo que ve el chofer | Lo que hace el equipo | Recuperación |
| --- | --- | --- | --- |
| Clave incorrecta | «No se pudo conectar» con la causa probable y «Volver a intentar» | Mantiene el AP, extiende la ventana a 3 min, conserva el nombre de la red escrito | Corregir la clave y guardar de nuevo |
| Hotspot apagado o fuera de alcance | Igual que arriba | Igual; el panel muestra `NO SE PUDO CONECTAR` | Encender el hotspot y reintentar |
| El teléfono se aleja del AP | El navegador pierde la página; la pantalla vuelve al QR | `PORTAL,clientes=0`; la ventana sigue abierta | Volver a unirse (el QR sigue en pantalla) |
| Dedo resbalado al elegir red | El campo de red muestra otra red | Nada hasta guardar | Tocar la red correcta; el campo se reemplaza |
| Red abierta | El campo de clave se deshabilita con la ayuda «Esta red es abierta» | Guarda sin clave | No requiere acción |
| Falta el nombre | Aviso «Falta el nombre de la red Wi-Fi…» | No aplica credenciales | Elegir de la lista o escribir el nombre |
| El navegador avisa «sin Internet» | — | El portal responde a cualquier ruta con su página (`302` a `/`) | Elegir «Quedarme conectado» en el teléfono |
| La ventana de 5 min vence antes de guardar | La página deja de cargar | El AP se cierra y la pantalla vuelve al panel | Apagar y encender; la ventana se reabre sola (una vez por arranque) |
| Varios fallos seguidos | La página sigue en el formulario | Cada guardado reinicia los 25 s y vuelve a extender la ventana a 3 min | Corregir y reintentar; no hace falta reiniciar |
| Se elige la misma red a la que ya está unido | «Conectando…» y luego «Conexión lista» | Reaplica credenciales; el enlace se restablece en 1–3 s | Ninguna |
| Equipo ya unido a otra red y se elige una nueva | «Conectando…» (no «Conexión lista» inmediata) | Solo declara éxito si el SSID asociado es el nuevo | Ninguna; la corrección evita un falso positivo |

La pantalla del validador repite el resultado para el caso en que el teléfono se
quede sin batería o el chofer cierre el navegador antes de leerlo.

## 7. Correspondencia con ISO/IEC 25010

| Subcaracterística | Cómo se cumple | Evidencia |
| --- | --- | --- |
| Capacidad de aprendizaje | Tres pasos, sin jerga, lista tocable y mensajes de resultado | §5; manual BLINK-DOC-08 §2.2 |
| Operabilidad | Cuatro toques en el caso feliz; sin teclear el nombre; botones de 52–58 px | Banco: §9 |
| Protección contra errores del usuario | Lista en lugar de tecleo, «Ver» para la clave, reintento sin reinicio, validación del nombre | §6 |
| Estética de la interfaz | Una sola columna, jerarquía título→pasos→lista→acción, fondo oscuro de alto contraste | §3.1 |
| Accesibilidad | Contraste ≥ 6,2:1; tamaños de 15–22 px; objetivos ≥ 52 px; sin dependencia de color para entender el estado (hay texto) | §3.1, §4 |
| Tolerancia a fallos | El AP no se cierra hasta confirmar el enlace; los cobros siguen en local si no hay red | §5.2; DOC-18 §4.2 |

## 8. Proceso de diseño centrado en el humano

ISO 9241-210 pide cuatro actividades iterativas; el proyecto las recorrió así:

| Actividad | Qué se hizo | Resultado |
| --- | --- | --- |
| Comprender el contexto | Se partió del perfil del chofer y de las quejas de operación: «no sé qué red elegir», «se cerró y tuve que apagar» | Requisitos RU-01 a RU-07 |
| Especificar requisitos | Se fijaron métricas de eficacia, eficiencia, satisfacción y recuperación | §3 |
| Producir soluciones | QR de unión, lista automática, pasos, resultado en dos superficies, reintento | §5 |
| Evaluar | Pruebas de banco con hotspot real y lectura del puerto serie; revisión del flujo con el propietario | §9; pendiente la prueba con choferes |

La iteración no fue cosmética: la primera versión cerraba el AP a los 2,5 s y
obligaba a reiniciar; la segunda (este documento) espera la confirmación. El
cambio se justificó con la métrica RU-03 y se verificó en la unidad física.

## 9. Verificación en banco (2026-11-01)

Unidad ESP32-D0WD-V3, MAC `1C:60:8B:DF:94:8C`, `/dev/ttyUSB0`. Firmware
compilado en **1 279 639 B** (97 % de la tabla por defecto) y flasheado con
verificación por hash; el build del 2026-11-02 con `huge_app` ocupa 1 279 655 B
(40 % de 3 MB). El
banco usó un hotspot temporal del portátil (`BLINK-PRUEBA`,
`10.42.0.1/24`) y el puerto serie con DTR y RTS en bajo.

| # | Verificación | Evidencia |
| --- | --- | --- |
| 1 | Página y pasos | `GET /` responde 200 con 8 147 B; contiene los tres pasos, la lista, «Ver», «Más opciones» y los textos con tilde |
| 2 | Lista automática | `/redes` devuelve 6–7 redes deduplicadas y ordenadas por señal; la página las pinta al abrir, sin pulsar nada |
| 2b | Interacción en navegador real | Navegador de escritorio contra el equipo: al abrir aparecen 7 redes; tocar `Room_2.4_EXT` rellena el campo de red, marca el botón como activo y lleva el foco a la clave; «Ver» cambia el campo a texto y su etiqueta a «Ocultar»; «Actualizar lista» vuelve a barrer; «Más opciones» expone los dos botones de mantenimiento |
| 3 | Estado de espera | `/estado` → `{"e":"form","red":"…","ip":"-","min":4}` |
| 4 | Fallo de red inexistente | `POST /guardar` 200; `/estado` pasa a `conectando` a los 2 s y a `fallo` a los ~25 s; `min` sube de 4 a 3 (ventana extendida a 3 min); serie: `PORTAL,guardado,red=RED-QUE-NO-EXISTE,intento=1`, `PORTAL,fallo,…,intento=1`, `PANTALLA,portal=3` → `5` |
| 5 | Éxito con hotspot | `POST /guardar` 200 en 0,14 s; `/estado` `conectando` a los 2 s y `ok` a los 4 s; el AP deja de responder a los ~14 s (cierre 10 s después del éxito); serie: `PORTAL,guardado,…,intento=1`, `PORTAL,conectado,red=BLINK-PRUEBA,ip=10.42.0.89`, `PANTALLA,portal=3` → `4`, `PORTAL,cerrado` |
| 6 | Corrección del falso positivo | Antes del arreglo, un equipo ya unido declaraba `ok` en el mismo instante del POST (registro `conectado` antes de `guardado`); tras exigir SSID coincidente y credenciales aplicadas, la secuencia es `conectando → ok` |
| 7 | Olvidar red | `OLVIDAR_WIFI` deja `RED,estado=sin-wifi` y conserva el token (`token=1`) |
| 8 | Cierre forzado | `CERRAR_PORTAL` responde `OK,portal=0` y la pantalla vuelve al panel |
| 9 | Sin JavaScript | La etapa la decide el equipo: el formulario y las vistas se sirven ya renderizadas; el envío es un `POST` normal |
| 10 | Tamaño y memoria | Página de 8 147 B servida y medida con `curl` el 2026-11-02; el buffer reserva 7 800 B y la `String` crece una vez; sin fugas entre peticiones |
| 11 | Auditoría de firmware (2026-11-02) | Arranque `READY,BLINK,9,1,0`; `GET /` 200 con 8 147 B; `/estado` `{"e":"form",…,"min":3}`; `/redes` devuelve 5 redes; un `POST` con SSID inexistente pasa a `conectando` a los 8 s y a `fallo` a los 32 s sin cerrar la ventana ni el AP |

**Límite del banco:** el portátil tiene una sola radio Wi-Fi. Para comprobar el
éxito con un hotspot real se unió el equipo al hotspot por consola y se envió el
`POST` a la IP de estación (`10.42.0.89`), que sirve la misma página y el mismo
manejador; no se pudo tener a la vez teléfono en el AP y hotspot en la misma
interfaz. El reintento desde `PORTAL_FALLO` usa el mismo manejador y el AP sigue
abierto, pero la secuencia «fallo → reintento → éxito» con un teléfono real
queda para la prueba de campo (B-34). La interacción táctil se probó con un
navegador de escritorio, no con el navegador de un teléfono.

## 10. Protocolo de medición con choferes (pendiente, B-34)

Objetivo: medir las tres dimensiones de ISO 9241-11 con usuarios del perfil de
§2 y cerrar o corregir el diseño con datos, no con opiniones.

**Participantes.** 5 a 8 choferes de la línea, sin experiencia previa con el
modo configuración; al menos dos con teléfono de gama baja. Consentimiento
verbal, sin registrar datos personales; se anota un código (P1, P2…).

**Tareas.**

1. **T1 (primera vez):** encender el equipo, unirse al AP y dejarlo conectado al
   hotspot del evaluador. Sin ayuda salvo que transcurran 3 minutos bloqueado.
2. **T2 (error):** se le entrega una clave incorrecta a propósito; debe detectar
   el fallo, corregir y terminar.
3. **T3 (segunda red):** una semana después o al final de la sesión, repetir T1
   con otra red para medir aprendizaje.

**Medidas.**

| Dimensión | Instrumento | Cálculo |
| --- | --- | --- |
| Eficacia | Hoja de observación | Tareas completadas / intentos; intervenciones del evaluador |
| Eficiencia | Cronómetro desde el QR hasta `CONECTADA` | Mediana y rango; número de toques (grabación de pantalla del teléfono si se autoriza) |
| Errores | Hoja de observación | Claves erróneas, redes equivocadas, abandono de la ventana |
| Satisfacción | SUS de 10 ítems al final | Puntuación 0–100; objetivo ≥ 75 |

**Criterio de aceptación del hito:** RU-01 a RU-03 se cumplen con todos los
participantes; SUS ≥ 75; ninguna sesión termina con reinicio del equipo. Si un
participante falla, se anota el punto exacto (QR, lista, clave, resultado) y se
itera el diseño antes de la producción en serie.

## 11. Decisiones

### ADR-24 · No cerrar el punto de acceso hasta confirmar el enlace

**Contexto.** En la primera versión, guardar cerraba el AP a los 2,5 s. Si la
clave era incorrecta, el teléfono perdía la página y el manual pedía apagar y
encender. El chofer no tenía forma de corregir sin interrumpir el servicio.

**Decisión.** Guardar solo aplica las credenciales; el AP permanece abierto
hasta que el equipo se asocia **a la red elegida** (`WL_CONNECTED` y SSID
coincidente) o hasta que vencen 25 s. El éxito cierra el AP 10 s después; el
fallo mantiene la ventana y la extiende a 3 min.

**Consecuencias.** El teléfono ve el resultado real; el reintento no exige
reiniciar; el AP abierto dura algo más cuando hay error (riesgo R-16 acotado por
la ventana y por el cierre automático). El sondeo `/estado` puede fallar un
instante durante el cambio de modo; la página reintenta cada 2 s.

**Alternativas descartadas.** Cerrar inmediatamente (el defecto original);
declarar éxito al guardar sin comprobar (falso positivo); pedir al chofer que
verifique en el panel (dos superficies, una sola mano).

### ADR-25 · Lista automática y botones grandes en lugar de «Buscar redes»

**Contexto.** Un botón «Buscar redes» obliga a un paso extra y a entender que
hay que buscar; el campo de texto libre invita a errores de mayúsculas.

**Decisión.** La página barre al cargar y pinta cada red como un botón de 58 px
con señal y tipo de seguridad; tocarlo rellena el campo. «Actualizar lista»
queda como recurso; el nombre se puede escribir a mano si la red está oculta.

**Consecuencias.** Menos toques y menos errores; el barrido tarda 2–4 s y
bloquea la radio, por lo que se hace una vez al abrir y solo se repite a
petición. Con la estación insistiendo a una red inexistente el controlador
puede rechazar el barrido: se pausa el intento 350 ms y se repite.

### ADR-26 · Resultado en dos superficies y pantalla espejo del estado

**Contexto.** El resultado solo en el teléfono se pierde si el chofer cierra el
navegador o el teléfono se queda sin batería.

**Decisión.** El panel muestra `CONECTANDO`, `CONECTADA` con IP o `NO SE PUDO
CONECTAR` con la red y la indicación de revisar la clave en el teléfono; la
página muestra las mismas cuatro etapas con textos distintos para cada
superficie.

**Consecuencias.** El chofer puede terminar sin mirar el teléfono; el panel no
lleva tildes porque la fuente de 6×8 px es ASCII (limitación aceptada y
documentada en BLINK-DOC-18 §12).

## 12. Límites conocidos y trabajo pendiente

| ID | Límite | Tratamiento |
| --- | --- | --- |
| R-16 | El AP de configuración es abierto | Riesgo aceptado con ventana de 5 min; mitigación con clave WPA2 por unidad o botón físico (BLINK-DOC-09) |
| B-34 | No hay medición con choferes reales | Protocolo de §10 listo; ejecutar antes de la producción en serie |
| B-35 | La vinculación confirma **enlace**, no alcance de Internet: un hotspot sin datos se declara «conectado» y la banda amarilla no aparece | Documentado; una sonda HTTP de salud queda fuera del alcance de este cambio |
| — | Lectura física del QR con la cámara de un teléfono | La matriz se decodificó en el host a 1:1 y 0,5×; falta la prueba con teléfono (DOC-07 §4.11, prueba 16) |
| — | Navegadores de iOS y la hoja de portal cautivo | Probado con navegador de escritorio; la variante de iOS no se verificó en hardware |
| — | El texto del panel no usa tildes | Fuente ASCII de 6×8 px (BLINK-DOC-18 §12) |

## 13. Referencias

- ISO 9241-11:2018 — *Ergonomics of human-system interaction — Part 11:
  Usability: Definitions and concepts*.
- ISO 9241-110:2020 — *Part 110: Dialogue principles*.
- ISO 9241-210:2019 — *Part 210: Human-centred design for interactive systems*.
- ISO 9241-303:2011 — *Part 303: Requirements for electronic visual displays*.
- ISO/IEC 25010:2011 — *Systems and software quality models*.
- ISO/IEC/IEEE 26514:2022 — *Design and development of information for users*.
- BLINK-DOC-06 §6 — operación del firmware y comandos de consola.
- BLINK-DOC-07 §4.11 — pruebas del modo configuración.
- BLINK-DOC-08 §2.2 — manual del chofer.
- BLINK-DOC-09 — R-16, B-34 y B-35.
- BLINK-DOC-18 §4.3 — pantalla de configuración del panel de 240×240.
