# BLINK · motor tarifario y recarga por pasajes

| Campo | Valor |
| --- | --- |
| Código | BLINK-DOC-19 |
| Versión | 1.0.1 |
| Fecha | 2026-11-01 |
| Estado | Vigente (simulación y producción; `0019` y `0020` aplicadas el 2026-11-01) |
| Autor | Equipo BLINK (desarrollo asistido) |
| Normas de referencia | ISO/IEC/IEEE 29148 · ISO/IEC 25010 · ISO 9241-210 · ISO 20022 · ISO/IEC 27001:2022 |

## 1. Objetivo y alcance

Este documento responde a las tres especificaciones recibidas el 2026-11-01:

1. `Especificación de Requerimientos - Motor Tarifario.md` — reemplaza el
   ingreso libre de bolívares por la **compra de N pasajes**.
2. `Documentación Financiera.md` (`FIN-BEE-001`) — fórmula de gross-up,
   distribución contable y pseudocódigo de referencia.
3. `Blink_Pasajes_System_Architecture_&_Technical_Specification.md` — visión de
   arquitectura, conectividad, token ring offline y GTFS.

La implementación cambia **solo el origen del monto**: el pasajero elige
pasajes, el portal cotiza y muestra el monto exacto a transferir, y el backend
vuelve a cotizar antes de guardar. El flujo de Pago Móvil, el reporte, la
bandeja del back-office y la entrega al chip siguen siendo los mismos.

Documentos relacionados: BLINK-DOC-02 (arquitectura), BLINK-DOC-03 (modelo de
datos), BLINK-DOC-04 (RPC), BLINK-DOC-06 §5.6 (ciclo de recarga), BLINK-DOC-07
§4.9 (pruebas), BLINK-DOC-08 §1.4 (manual del pasajero) y BLINK-DOC-09
(brechas B-27…B-31).

## 2. Veredicto por requisito

### 2.1 Criterios de aceptación del motor tarifario

| Criterio (§6 del requerimiento) | Estado | Evidencia |
| --- | --- | --- |
| El pasajero no puede ingresar montos arbitrarios en bolívares | Cumplido | El campo de monto se eliminó; `BorradorRecarga` solo tiene `pasajes`, `telefono`, `banco`, `referencia`. La RPC `bt_recargar_pasajes` no acepta montos. |
| Los bloques 1, 2, 3, 5 y 10 y la cantidad libre actualizan el monto en tiempo real | Cumplido | `Recargar.tsx` recalcula con `cotizarRecarga` en cada cambio; el recibo mostró Bs 1.590 para 3 pasajes. |
| El flujo de Pago Móvil y el reporte funcionan sin regresiones | Cumplido | Prueba de navegador completa el 2026-11-01 (§8.3). |
| Al aprobar, el saldo sube solo por `N × 500` | Cumplido | `bt_aprobar_recarga` acredita `coalesce(monto_base, amount)`; el saldo pasó de Bs 1.000 a Bs 2.500 con una recarga de Bs 1.590. |
| El registro conserva el desglose financiero completo | Cumplido | Columnas `pasajes`, `tarifa_base`, `monto_base`, `comision_entrada`, `provision_salida`, `margen_blink`, `excedente_redondeo` y copia de `tarifario` (§4). |

### 2.2 Requisitos de `FIN-BEE-001`

| Requisito | Estado | Observación |
| --- | --- | --- |
| Gross-up por comisión de entrada `/(1 − CE)` | Cumplido | §3. |
| Provisión de comisión de salida sobre el valor base | Cumplido | `provision_salida = acreditado × CS`. |
| Margen de la plataforma | Cumplido con 4 % | El ejemplo de `FIN-BEE-001` usa 5 %; prevalece el 4 % del requerimiento tarifario (ADR-17). |
| Redondeo | Cumplido con decena superior | `FIN-BEE-001` redondea a 2 decimales; prevalece la decena superior (ADR-18). |
| Distribución contable por transacción | Cumplido | Cinco partidas guardadas por recarga; la utilidad es un valor derivado, no una columna. |
| Precisión aritmética sin pérdida por truncamiento | Cumplido | Enteros de céntimos en TypeScript y `numeric` en PostgreSQL; `round(…, 2)` en cada partida; el excedente del redondeo se acumula aparte. |

### 2.3 Arquitectura técnica

| Afirmación de la especificación | Estado real | Dónde |
| --- | --- | --- |
| Validación local en la tarjeta en menos de 0,2 s, 100 % offline | Cumplido | Firmware 8; DOC-16. |
| Sincronización por lotes en base/garaje | Cumplido por sincronización HTTPS con token por validador | DOC-16 §5. |
| Portal cautivo sin botones | Cumplido desde el firmware 9: AP temporal `BLINK-XXXX` y página en 192.168.4.1 desde el teléfono | DOC-06 §6.1, DOC-07 §4.11 |
| Token ring de recargas firmado y cacheado en el ESP32 | **No implementado**: la recarga aprobada espera la sincronización del validador | B-28 |
| App nativa con mapa y GTFS | **No implementado**: el portal es web y no hay capa geográfica | B-30 |
| Batería Li-Po 2000 mAh con TP4056, buzzer e IPS 240×240 | Placa y pantalla implementadas; batería y buzzer no validados en la unidad | B-31 |
| Cobro plano por línea, sin cobro por distancia | Cumplido | `transit_routes` con tarifa única; DOC-03. |
| Prohibición de saldos negativos | Cumplido | El validador rechaza sin saldo suficiente; no hay crédito de emergencia. |

## 3. Motor de cálculo

### 3.1 Parámetros

| Parámetro | Símbolo | Valor por defecto | Unidad |
| --- | --- | --- | --- |
| Tarifa base del pasaje | TB | 500,00 | Bs por pasaje |
| Comisión bancaria de entrada | CE | 1,5 % (0,015) | sobre el monto bruto |
| Comisión bancaria de salida | CS | 0,3 % (0,003) | sobre el valor base |
| Margen de la plataforma | MG | 4,0 % (0,04) | sobre el valor base |
| Redondeo comercial | — | 10 | Bs |

Los parámetros viven en `settings.publico.tarifario` y se publican por
`bt_tarifario()`. La **tarifa base de cada plástico** (`cards.tarifa`, 500 por
defecto, 250 para estudiante) manda al cotizar; así un estudiante compra
pasajes a su propia tarifa con las mismas comisiones.

### 3.2 Fórmula

```
acreditado = N × TB
bruto      = acreditado × (1 + CS + MG) / (1 − CE)
total      = ceil(bruto / 10 − 1e−9) × 10
```

Partidas contables:

```
comision_entrada  = round(total × CE, 2)
provision_salida  = round(acreditado × CS, 2)
margen_blink      = round(acreditado × MG, 2)
excedente_redondeo = round(total − bruto, 2)
utilidad          = total − acreditado − comision_entrada − provision_salida
```

`utilidad` incluye el margen más el excedente de la decena. No se guarda como
columna porque se deriva de las anteriores y debe cuadrar siempre.

### 3.3 Tabla de validación

Calculada por la implementación y fijada en `src/lib/tarifa.test.ts`:

| Pasajes | Acreditado | Bruto | Total | Comisión entrada | Provisión salida | Margen | Excedente | Utilidad |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 500,00 | 529,44 | 530,00 | 7,95 | 1,50 | 20,00 | 0,56 | 20,55 |
| 2 | 1.000,00 | 1.058,88 | 1.060,00 | 15,90 | 3,00 | 40,00 | 1,12 | 41,10 |
| 3 | 1.500,00 | 1.588,32 | 1.590,00 | 23,85 | 4,50 | 60,00 | 1,68 | 61,65 |
| 5 | 2.500,00 | 2.647,21 | 2.650,00 | 39,75 | 7,50 | 100,00 | 2,79 | 102,75 |
| 10 | 5.000,00 | 5.294,42 | 5.300,00 | 79,50 | 15,00 | 200,00 | 5,58 | 205,50 |
| 20 | 10.000,00 | 10.588,83 | 10.590,00 | 158,85 | 30,00 | 400,00 | 1,17 | 401,15 |

Los totales, la comisión de entrada, la provisión de salida y la utilidad
coinciden exactamente con la tabla del requerimiento. La utilidad se calcula
sobre el total (como en la especificación): `total − acreditado − ce − ps`. Por
eso puede diferir en céntimos de `margen + excedente`: la comisión de entrada
se redondea sobre el total ya redondeado (para 20 pasajes, 158,85 sobre
10.590, frente a 158,83 sobre el bruto), y esa diferencia no se contabiliza
dos veces.

### 3.4 Precisión

- **TypeScript:** la cotización usa enteros de céntimos (`baseCent`, `puntosBase`)
  para que la división no arrastre error binario; el redondeo de la decena usa
  `Math.ceil(x − 1e−9)` para no subir de década por un residuo de coma flotante.
- **PostgreSQL:** `numeric` sin coma flotante; `ceil(v_bruto / v_redondeo − 1e−9)`
  replica la misma tolerancia.
- El cliente y el servidor comparten fórmula pero **no confían** el uno del
  otro: el servidor recotiza con la tarifa del plástico y guarda su resultado.

## 4. Separación contable

### 4.1 Semántica de `recharges`

| Columna | Contenido | Uso |
| --- | --- | --- |
| `amount` | Monto bruto transferido (Bs) | Conciliación bancaria y métrica «monto por conciliar». |
| `pasajes` | Entero comprado | Trazabilidad y bandeja. |
| `tarifa_base` | Tarifa del plástico al reportar | Reproducir la cotización. |
| `monto_base` | Lo que se acredita a la tarjeta | Crédito al aprobar y métrica «a acreditar». |
| `comision_entrada` | 1,5 % del bruto | Retenido por el banco. |
| `provision_salida` | 0,3 % del acreditado | Reserva para la liquidación al chofer. |
| `margen_blink` | 4 % del acreditado | Ingreso de la plataforma. |
| `excedente_redondeo` | Total − bruto | Ajuste por la decena. |
| `tarifario` | Copia JSON de los parámetros | Auditoría si cambian las comisiones. |

`card_movements.monto` del reporte pendiente es el **acreditado**, no el bruto:
así el extracto del pasajero anticipa lo que recibirá. La aprobación reescribe
`monto`, `saldo_despues` y el detalle con la cantidad de pasajes.

### 4.2 Recargas anteriores a `0019`

No tienen `monto_base`. La aprobación usa `coalesce(monto_base, amount)`, de
modo que una recarga vieja sigue acreditando su bruto y su movimiento conserva
el detalle «Pago Móvil aprobado». No se reescriben datos históricos.

### 4.3 Conciliación

El back-office muestra cuatro métricas: pendientes, **monto por conciliar**
(bruto, contra el banco), **a acreditar** (`monto_base`) y **pasajes**. La fila
de cada recarga muestra «N · Bs TB», el transferido y la línea «acredita
Bs …». Las recargas legadas aparecen con «—» en pasajes.

## 5. Flujo del portal

El asistente conserva cuatro pasos y el mismo lenguaje visual:

1. **Pasajes** — encabezado «¿Cuántos pasajes deseas recargar?», tarifa
   vigente, bloques 1/2/3/5/10 (deshabilitados si superan el tope), campo
   entero libre con ayuda «Hasta 37 pasajes por operación (tope Bs 20.000)» y
   recibo en vivo: **transfiere exactamente**, pasajes y base, comisiones y
   servicio, saldo actual y saldo al aprobarse.
2. **Pago** — datos de Pago Móvil con botones de copiado por campo, botón
   **Copiar monto** y **Copiar datos y monto** (banco, RIF, teléfono, titular y
   monto en un solo texto). El formulario de reporte pide banco emisor,
   teléfono de origen y últimos 4 dígitos de la referencia; el monto ya no se
   escribe.
3. **Confirmar** — tarjeta, pasajes × tarifa, monto a transferir, lo que se
   acredita, banco, teléfono y referencia.
4. **Listo** — comprobante con bruto, pasajes, acreditado, banco, referencia,
   fecha y estado «En revisión».

Validaciones del paso 1 (`erroresRecarga`): cantidad vacía, no entera o menor
que 1; total por encima del tope con el máximo de pasajes que sí cabe. El
botón Continuar no avanza con errores. El servidor repite esas validaciones y
añade teléfono de 11 dígitos, banco, referencia, duplicado y límite de 6
reportes cada 10 minutos.

## 6. API y permisos

| Función | Permiso | Contrato |
| --- | --- | --- |
| `bt_tarifario()` | Solo servidor (`security definer`, sin `grant`) | `{base, comisionEntrada, comisionSalida, margen, redondeo}` |
| `bt_cotizar_recarga(p_pasajes, p_base=null)` | Solo servidor | Cotización completa; valida parámetros |
| `bt_recargar_pasajes(token, serial, pasajes, telefono, banco, referencia)` | `anon` | `{movimiento, cotizacion}`; inserta movimiento pendiente y recarga con desglose |
| `bt_aprobar_recarga(recarga, admin)` | `service_role` y back-office | Acredita `monto_base`, devuelve `{ok, saldo, acreditado, pasajes}` |
| `bt_rechazar_recarga(recarga, admin, motivo)` | Igual | Sin cambios de contrato |
| `bt_admin_recargas(token, limite)` | `anon` con sesión + MFA | Añade `montoBase`, `pasajes`, `tarifaBase` por fila y totales `base` y `pasajes` |
| `bt_admin_resolver_recarga(token, recarga, aprobar, motivo)` | `anon` con sesión + MFA | Devuelve además `acreditado` y `pasajes` |
| `bt_recargar(token, serial, monto, …)` | `anon` (legado) | Se mantiene temporalmente para clientes con la versión anterior en caché (B-27) |

El adaptador del portal (`src/lib/nube.ts`) invoca `bt_recargar_pasajes`. El
modo local de la simulación replica la cotización con la misma función
`soloDigitos`/`cotizarRecarga` para que las pruebas sin red sigan cuadrando.

## 7. Migración y despliegue

`0019_motor_tarifario.sql` se aplica **después** de `0018` y es aditiva.
`0020_chip_monto_base.sql` la acompaña: corrige la sincronización del validador
para que el chip reciba `monto_base` y no el bruto (ver §8.2).

1. Añade columnas y checks a `recharges` (idempotente con `if not exists`).
2. Publica `settings.publico.tarifario` con los valores por defecto y sube
   `topeRecarga` a 20.000 Bs sin bajar uno mayor ya configurado.
3. Crea `bt_tarifario` y `bt_cotizar_recarga` (sin permisos de cliente).
4. Crea `bt_recargar_pasajes` y redefine `bt_aprobar_recarga` y
   `bt_admin_recargas`.

Antes de aplicar en producción se respaldaron `recharges`, `cards` y
`settings` en `backups/2026-11-01_*_antes_0019.jsonl`, se revisó que el tope
publicado no contradijera una decisión comercial vigente y se confirmó con el
propietario el precio de venta de cada bloque (la tabla de §3.3). **Ambas
migraciones se aplicaron el 2026-11-01** en una transacción cada una; la
verificación posterior confirmó `settings.publico.tarifario` con base 500,
entrada 0,015, salida 0,003, margen 0,04 y redondeo 10, `topeRecarga` en
20.000, la cotización de 2 pasajes en 1.060/1.000 y la de 10 en 5.300/5.000,
y que `bt_validador_sincronizar` entrega `coalesce(monto_base, amount)`. Las
5 recargas anteriores conservan `monto_base` nulo y su importe original.

La migración no toca recargas existentes; el rollback consiste en volver a la
definición anterior de las tres funciones y dejar las columnas (nulas) en su
sitio.

## 8. Verificación

### 8.1 Pruebas automatizadas (2026-11-01)

- `src/lib/tarifa.test.ts`: 13 pruebas — tabla exacta de §3.3, múltiplos de 10,
  conservación `total = acreditado + ce + ps + margen + excedente`, monotonía,
  entradas inválidas, tarifa de estudiante (250) y `maximoPasajes` (9 con
  tope 5.000; 37 con tope 20.000).
- `src/lib/dominio.test.ts`: validación por pasajes, tope con mensaje de máximo,
  decimales y cero.
- Suite completa del portal: **87 pruebas en 7 archivos**, `tsc --noEmit` sin
  errores y `npm run build` correcto.
- Back-office: `tsc --noEmit` y `npm run build` correctos.

### 8.2 Prueba SQL en la simulación

Con un token de cuenta real y la tarjeta `G-00001-099-F` (tarifa 500):

- Reporte de 3 pasajes → movimiento pendiente de Bs 1.500 con detalle «Recarga
  de 3 pasajes en revisión»; recarga con bruto 1.590, base 1.500, pasajes 3,
  comisión 23,85, provisión 4,50, margen 60,00, excedente 1,68.
- Aprobación → saldo 1.000 → 2.500; movimiento aprobado «Pago Móvil aprobado ·
  3 pasajes».
- **Hallazgo corregido:** `bt_validador_sincronizar` enviaba `amount` al chip, así
  que una recarga de 2 pasajes (bruto 1.060, base 1.000) habría escrito 1.060 en
  el plástico. `0020` reescribe la función con `coalesce(monto_base, amount)`;
  el flujo de simulación confirma `RECARGA_APLICADA … monto=1000` y saldo 500
  tras el cobro.
- Tope: 40 pasajes rechazados con el máximo permitido; 0 pasajes rechazado.

### 8.3 Prueba de navegador (2026-11-01, simulación)

1. Portal `http://127.0.0.1:5175`, cuenta `V-11111111`, tarjeta
   `G-00001-099-F`, saldo Bs 1.000.
2. Bloque «3 pasajes» → recibo: transfiere Bs 1.590, 3 · Bs 1.500, comisiones
   Bs 90, saldo al aprobarse Bs 2.500.
3. Pago: banco Banesco, teléfono 0414-1234567, referencia 7731 → revisión →
   comprobante «Recarga reportada».
4. Back-office `http://127.0.0.1:5173`, operador `V-34201580` con TOTP:
   bandeja con 1 pendiente, Bs 1.590 por conciliar, Bs 1.500 a acreditar, 3
   pasajes; aprobación → «Recarga aprobada: 3 pasajes por Bs. 1.590,
   acreditando Bs. 1.500. Saldo nuevo de la tarjeta: Bs. 2.500».
5. Base local: `status = aprobado`, `resolved_by = Operador Simulación`,
   `virtual_balance = 2500`.

## 9. Brechas, desviaciones y decisiones

- **Margen 4 % frente a 5 %.** `FIN-BEE-001` usa 5 % en su ejemplo; el
  requerimiento tarifario y la arquitectura fijan 4 %. Se implementó 4 %
  (ADR-17).
- **Redondeo a la decena frente a 2 decimales.** El pseudocódigo de
  `FIN-BEE-001` redondea a céntimos; la regla comercial pide la decena
  superior. Se implementó la decena y se conserva el bruto sin redondear para
  calcular el excedente (ADR-18).
- **Provisión de salida.** Se registra como provisión, no como cobro real: el
  banco cobra al liquidar. La utilidad disponible es `total − acreditado −
  comision_entrada − provision_salida`; el margen retenido es 4 % más el
  excedente.
- **Token ring offline.** La recarga aprobada no viaja firmada a la tarjeta:
  el portal la deja pendiente de la próxima sincronización del validador. Un
  pasajero que recarga y aborda antes de que su unidad sincronice puede no
  tener saldo (B-28).
- **Portal de configuración.** Implementado en el firmware 9 (AP abierto de 5
  minutos); su principal salvedad es que el AP no lleva clave (R-16).
- **GTFS y batería.** No están implementados o no están validados (B-30,
  B-31).
- **`bt_recargar` legado.** Sigue abierto para clientes con caché anterior;
  permite montos libres y no guarda desglose. Retirarlo cuando el parque esté
  actualizado (B-27).
- **MFA en bypass.** En producción el segundo factor está en modo bypass; el
  back-office lo exige en el contrato. Restaurarlo antes de operar con dinero
  real (R-07).

## 10. Decisiones de arquitectura

### ADR-16 · El precio lo calcula el servidor con la tarifa del plástico

El cliente cotiza solo para la vista previa. `bt_recargar_pasajes` vuelve a
cotizar con `cards.tarifa` y guarda ese resultado; un cliente manipulado no
puede transferir Bs 500 por 10 pasajes. La tarifa por tarjeta permite
estudiantes a 250 sin duplicar el motor.

### ADR-17 · Margen del 4 %

Se adopta el 4 % del requerimiento tarifario y de la arquitectura. El 5 % de
`FIN-BEE-001` queda como ejemplo del documento, no como parámetro. El margen
es configurable en `settings.publico.tarifario` y se copia en cada recarga para
que un cambio futuro no altere el histórico.

### ADR-18 · Redondeo a la decena con excedente explícito

Se redondea al múltiplo de 10 inmediato superior y se guarda el excedente. El
bruto se conserva con dos decimales para poder auditar la diferencia. La
cotización usa enteros de céntimos y un epsilon de 1e−9 para que un bruto
exacto no suba de década por error de representación.

### ADR-19 · Tope de 20.000 Bs y máximo de pasajes derivado

Los bloques de 10 y 20 pasajes de la especificación no cabían en el tope
anterior de 5.000 Bs. El tope sube a 20.000 y el campo libre calcula el máximo
por operación (37 pasajes a 500 Bs). La migración no baja un tope mayor ya
configurado.

### ADR-20 · Compatibilidad temporal de `bt_recargar`

Mantener la RPC antigua evita que un navegador con el service worker en caché
falle al reportar. La nueva UI usa `bt_recargar_pasajes`; la vieja se retira
cuando el parque haya actualizado (B-27) y mientras tanto sus recargas se
aprueban acreditando el bruto.

## 11. Riesgos y pendientes

| ID | Riesgo | Tratamiento |
| --- | --- | --- |
| R-12 | Cambiar `settings.publico.tarifario` altera el precio de las recargas nuevas sin aviso a los pasajeros. | El tarifario se copia en cada recarga; publicar cambios con nota operativa y revisar la bandeja. |
| R-13 | El excedente de redondeo no se concilia contra una cuenta contable. | Se guarda por recarga; sumarlo en el cierre diario antes de usarlo como ingreso. |
| B-27 | `bt_recargar` legado acepta montos libres y no guarda desglose. | Retirar cuando el parque actualice; mientras, la UI nueva no lo usa. |
| B-28 | Sin token ring offline: la recarga espera la sincronización del validador. | Documentar la espera al pasajero; evaluar token firmado en una fase posterior. |
| B-29 | Portal de configuración Wi-Fi: cerrado en el firmware 9, pero el AP es abierto. | R-16: protegerlo con clave por unidad o botón físico antes de la operación masiva. |
| B-30 | Sin app nativa, mapa ni GTFS. | Fuera del alcance del hito; la telemetría y las rutas ya tienen tablas compatibles. |
| B-31 | Batería, buzzer y autonomía no validados en la unidad física. | Probar en la unidad de campo antes de la operación continua. |

## 12. Referencias

- BLINK-DOC-02 — arquitectura del ecosistema.
- BLINK-DOC-03 — modelo de datos (`recharges`, `settings`, `cards.tarifa`).
- BLINK-DOC-04 — contrato RPC.
- BLINK-DOC-06 §5.6 — ciclo completo de una recarga.
- BLINK-DOC-07 §4.9 — evidencia de pruebas.
- BLINK-DOC-08 §1.4 — manual del pasajero.
- BLINK-DOC-09 — riesgos, brechas y deuda.
- `supabase/migrations/0019_motor_tarifario.sql` y `0020_chip_monto_base.sql`.
- `src/lib/tarifa.ts` y `src/lib/tarifa.test.ts`.
