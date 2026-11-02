# Manual de usuario

| Campo | Valor |
| --- | --- |
| Código | BLINK-DOC-08 |
| Versión | 1.7.0 |
| Fecha | 2026-11-01 |
| Estado | Vigente |
| Normas | ISO/IEC/IEEE 26511 · 26512 |
| Público | Pasajero, chofer, operador de taquilla, administrador de línea |

## 1. BLINK TARJETA — el pasajero

Sitio: https://blink-servers.github.io/TARJETA/

### 1.1 Crear la cuenta

1. Abre el portal y toca **Crear cuenta**.
2. **Paso 1 – Tus datos:** nombres, apellidos, cédula (elige `V` o `E`), teléfono
   móvil, correo y un **PIN de 6 dígitos**. El PIN no puede ser todo igual
   (`111111`) ni una secuencia (`123456`).
3. Toca **Continuar**.
4. **Paso 2 – Pago Móvil:** si vas a recargar con tu propio teléfono y cédula,
   elige **Sí, usar mis datos**. Si un familiar paga las recargas, elige
   **No, configurar otra cuenta** y completa banco, teléfono y cédula del titular
   de esa cuenta.
5. Al terminar entras directo a tu billetera.

> Anota tu PIN: es la única forma de entrar. Atención al cliente puede recuperarlo,
> pero no se muestra por seguridad.

### 1.2 Vincular una tarjeta

1. En el inicio toca **Vincular tarjeta** (o **Vincular mi primera tarjeta**).
2. Escribe el **serial** impreso al reverso del plástico, debajo del código de
   barras (formato `23-1-0000001-9`; las tarjetas antiguas usan
   `23-1-000001-9`).
3. Toca **Vincular**. Puedes repetir el proceso con la tarjeta de un hijo o de otro
   familiar: todas quedan en la misma cuenta y se deslizan en el carrusel.

Si el serial aparece como inválido, revisa que hayas copiado los 11 dígitos (10 en
las tarjetas antiguas) y los guiones. Si dice que la tarjeta pertenece a otra
cuenta, contacta a atención al cliente.

### 1.3 Consultar saldo y movimientos

- El **inicio** muestra la tarjeta seleccionada con saldo, tarifa actual y el
  estado de sincronización.
- El ojo oculta el saldo si estás en un lugar público.
- **Movimientos** lista recargas y viajes por fecha, con banco y referencia.
- Toca la tarjeta para ver el **reverso**: código de barras, serial y QR del portal.

### 1.4 Recargar con Pago Móvil

1. Toca **Recargar** y elige **cuántos pasajes** quieres: 1, 2, 3, 5 o 10 con
   los botones, o escribe otra cantidad entera. La pantalla muestra la tarifa
   vigente y el máximo por operación (hoy 37 pasajes con tope Bs 20.000,00).
2. Lee el recibo: **transfiere exactamente** el monto en bolívares, cuántos
   pasajes recibirás y cuánto sube tu saldo. El monto incluye la comisión del
   banco y el servicio; no lo cambies a mano.
3. En **Pago**, revisa los datos de BLINK (banco, RIF, teléfono y titular) y usa
   **Copiar monto** o **Copiar datos y monto** si vas a pagar desde el banco.
4. Transfiere exactamente ese monto.
5. De vuelta en el portal, elige tu **banco emisor**, confirma el teléfono desde el
   que pagaste y escribe los **últimos 4 dígitos de la referencia**. No hay que
   escribir el monto: el portal ya lo sabe.
6. Toca **Revisar** y luego **Confirmar recarga**. Verás el comprobante en estado
   **En revisión**.
7. Cuando el administrador verifica el pago, se acredita el **valor de los
   pasajes** (no el monto transferido) y el movimiento cambia de estado. El
   saldo también se actualiza en el próximo tap del validador.

Ejemplo: 3 pasajes a Bs 500 transfieren **Bs 1.590** y acreditan **Bs 1.500**.
El recibo separa «Pasaje urbano: 3 × Bs 500 · Bs 1.500» y «Tasa administrativa
digital: Bs 90». Esa tasa cubre la pasarela, la plataforma y el margen del
servicio; el pasaje completo se liquida al transportista.

**Errores frecuentes**

| Mensaje | Qué hacer |
| --- | --- |
| "Ya reportaste esa referencia" | Revisa Movimientos; no envíes dos veces la misma recarga. |
| "Demasiados reportes seguidos" | Espera unos minutos antes de reportar otra. |
| "El tope por recarga es Bs 20.000" | Compra menos pasajes o divide el pago; la pantalla dice cuántos caben. |
| "Escribe una cantidad entera de pasajes" | Usa un número entero de 1 o más; no se aceptan decimales. |
| "La sesión expiró" | Vuelve a entrar con tu cédula y PIN. |

### 1.5 Cambiar el PIN o los datos de pago

- **Perfil › Seguridad › Cambiar PIN:** pide el PIN actual y el nuevo.
- **Perfil › Fuente de pago › Editar:** permite usar los datos del registro o
  configurar banco, teléfono y cédula de un familiar.

### 1.6 Cerrar sesión

En **Perfil**, al final, toca **Cerrar sesión**. La sesión también expira sola a
las 12 horas.

### 1.7 Términos y condiciones

- En la pantalla de acceso, toca **términos y condiciones** en el pie.
- Dentro de la cuenta, ve a **Perfil › BLINK › Términos y condiciones**.

La hoja explica que BLINK no presta el transporte ni fija la tarifa, muestra la
tarifa vigente por pasaje, separa la tasa administrativa y resume la base
normativa (Gaceta Oficial N.º 43.335). También funciona sin conexión.

## 2. El validador y el lector — el chofer

El chofer no usa una web propia: el **validador ESP32** cobra el pasaje y se
sincroniza solo. El **lector ESP32** es la herramienta de apoyo que se conecta
por USB a la estación del back-office cuando hay que enrolar tarjetas nuevas.

### 2.1 Cobrar a bordo

1. Enciende el validador; la pantalla muestra la tarifa y el estado de la red.
2. Acerca la tarjeta al lector del equipo. La pantalla confirma el cobro y el
   saldo restante; los viajes se guardan aunque no haya internet.
3. Al recuperar conexión, el validador sube los toques pendientes y descarga las
   recargas aprobadas. Al apoyar una tarjeta con recarga pendiente muestra
   `RECARGA_APLICADA` y suma el monto al plástico.
4. Nunca apagues el equipo con la cola de viajes pendientes si puedes evitarlo;
   si se apaga, los conserva en memoria al arrancar.

### 2.2 Conectar el validador a un Wi-Fi (hotspot del teléfono)

1. Enciende el validador. Si nunca se configuró (o la red guardada no aparece),
   a los pocos segundos la pantalla muestra **CONFIGURAR WIFI** con un nombre
   tipo `BLINK-948C` y la dirección `192.168.4.1`.
2. En el teléfono, abre los ajustes de Wi-Fi y únete a esa red `BLINK-XXXX`.
   No tiene contraseña; si el teléfono dice «sin Internet», elige quedarte
   conectado igual.
3. La página de configuración se abre sola. Si no, escribe `192.168.4.1` en el
   navegador.
4. Pulsa **Buscar redes** y elige tu hotspot (o escribe su nombre), pon la
   contraseña y pulsa **Guardar y conectar**.
5. Vuelve a la pantalla del validador: cuando dice **CONECTADA** ya está en
   línea y empieza a subir los cobros.

La ventana dura 5 minutos. Si se cierra antes de guardar, apaga y enciende el
equipo para repetir. Más detalle en BLINK-DOC-06 §6.1.

### 2.3 Usar el lector en la estación

1. Conecta el lector al puerto USB de la computadora del back-office.
2. En la pantalla **Estación**, toca **Conectar lector** y elige el puerto serie
   (solo navegadores Chromium/Edge en escritorio).
3. El estado debe mostrar `READY,BLINK,1`.
4. Acerca la tarjeta: el lector envía su UID y el panel lo rellena en la fila.
5. Si no hay respuesta, pulsa **Probar** (envía `PING` y espera `PONG`).

El procedimiento completo de enrolado está en §3 y en BLINK-DOC-12.

## 3. BLINK BACK-OFFICE — la operación

Sitio: https://blink-servers.github.io/BACKOFFICE/ (escritorio; el lector usa
Web Serial, disponible en Chromium/Edge).

1. **Entrar:** cédula (V/E) y PIN de 6 dígitos de una cuenta con rol
   Administrador o Taquilla. Un pasajero no puede entrar.
2. **Inscribir el teléfono (solo la primera vez):** escanear el QR con Google
   Authenticator, Authy o 1Password y escribir el código de 6 dígitos. Sin este
   paso el panel no deja crear lotes ni enrolar tarjetas.
3. **Resumen:** totales de tarjetas fabricadas, activas y asignadas.
4. **Recargas:** bandeja de Pago Móvil pendientes con total y monto. Compara con
   el banco y usa **Aprobar** (pide confirmación) o **Rechazar** (exige motivo);
   el saldo de la tarjeta cambia al aprobar y el chip lo recibe en la siguiente
   sincronización. Detalle en §5.1.
5. **Lotes:** elegir cantidad, patrocinante y origen; el sistema genera los
   seriales en estado «Fabricada / Inactiva / No asignada» y permite exportar la
   hoja en CSV para imprimir.
6. **Estación:** conectar el lector USB, pasar cada tarjeta y capturar su UID;
   revisar la lista y cargar en bloque. Los pares rechazados se muestran con el
   motivo sin detener la carga.
7. **Entrega:** el pasajero vincula el serial desde el portal (§1.2); la tarjeta
   pasa a `ACTIVE` a su nombre. No hay asignación manual en taquilla.
8. **Inventario:** filtrar por lote, serial o estado y exportar.
9. **Salir** al terminar: el token vive solo en la pestaña.

Si se pierde el teléfono, el segundo factor se reinicia desde la consola SQL
(BLINK-DOC-06 §5.5) y se vuelve a inscribir.

## 4. BLINK POS — el comercio

Sitio: https://www.blink.com.ve/

1. Crea la cuenta con correo y contraseña y confirma el código que llega al correo.
2. Inicia sesión: cada comercio ve solo sus datos.
3. Usa el menú para ventas, catálogo, caja, inventario y reportes.
4. **Instalar como app:** desde el navegador, "Añadir a la pantalla de inicio".
5. Cada 12 h se pide la sesión de nuevo por seguridad.

## 5. Administración de la línea

Tareas que hoy se hacen por RPC de servicio o consola:

| Tarea | Dónde / función |
| --- | --- |
| Ver y resolver recargas | Back-office → **Recargas** |
| Ver recargas por revisar | `bt_recargas_pendientes(100)` (SQL Editor) |
| Aprobar una recarga | `bt_aprobar_recarga(<id>, 'admin')` (SQL Editor) |
| Rechazar una recarga | `bt_rechazar_recarga(<id>, 'admin', 'motivo')` (SQL Editor) |
| Emitir tarjeta | `bt_emitir_tarjeta(serial, nombre, cédula, teléfono, tarifa)` |
| Enrolar chip | `bt_enrolar_tarjeta(serial, uid)` |
| Bloquear / desbloquear | `bt_bloquear_tarjeta(serial, motivo)` / `bt_desbloquear_tarjeta(serial)` |
| Reportar pérdida | `bt_reportar_perdida(serial, motivo)` |
| Liquidar unidad | `bt_liquidar(<vehicle>, desde, hasta)` |
| Provisionar validador | `bt_validador_emitir_token(<mac>)` |

### 5.1 Verificar y aprobar una recarga

El procedimiento completo, con el detalle de cada efecto en la base, está en
BLINK-DOC-06 §5.6. En corto:

1. **Bandeja:** abre **Recargas** en el back-office (sesión con segundo factor).
   Lista los reportes pendientes del más antiguo al más reciente con el total,
   el monto por conciliar, lo que se acreditará, los pasajes, el serial, el
   titular, el banco, los últimos 4 dígitos de la referencia y el saldo actual
   de la tarjeta.
2. **Revisión:** compara con el estado de cuenta del banco el **monto
   transferido** (el bruto), el banco, el teléfono emisor y los **últimos 4
   dígitos** de la referencia (es lo único que guarda el portal). No compares
   contra el saldo a acreditar: son importes distintos a propósito.
3. **Resolución:** pulsa **Aprobar** y confirma, o **Rechazar** y escribe el
   motivo. Nunca se actualiza la tabla a mano: el servidor acredita el saldo y
   deja el movimiento consistente. **Aprobar es irreversible** y una recarga ya
   resuelta no se puede volver a tocar. La vía SQL de emergencia sigue siendo
   `select public.bt_aprobar_recarga('<uuid>', 'Operador');` o
   `select public.bt_rechazar_recarga('<uuid>', 'Operador', 'Motivo');`.
4. **Entrega al chip:** en la siguiente sincronización el validador descarga el
   **monto a acreditar** y, al apoyar la tarjeta, incrementa el saldo del
   plástico (`RECARGA_APLICADA` por serie). El ciclo cierra cuando la base marca
   `synced_to_chip = true`.
5. **Comprobación:** el pasajero ve el movimiento «Pago Móvil aprobado» y el
   saldo nuevo en el portal; el operador lo confirma con
   `select public.bt_resumen_operativo();` y las consultas de BLINK-DOC-06 §5.6.

## 6. Soporte

- **Atención al cliente:** 0800-BLINK-00 (valor en `settings.publico.atencion`).
- **Recuperación de PIN:** solo presencial o por el canal de atención; el PIN no se
  envía por correo.
- **Tarjeta perdida:** el administrador la marca `LOST`; desaparece de la
  billetera y no puede cobrarse.
