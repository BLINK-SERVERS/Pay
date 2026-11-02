# BLINK · términos legales y cumplimiento tarifario

| Campo | Valor |
| --- | --- |
| Código | BLINK-DOC-20 |
| Versión | 1.0.0 |
| Fecha | 2026-11-01 |
| Estado | Vigente (términos publicados en el portal; falta el decreto municipal que homologa la tarifa de Bs 500) |
| Autor | Equipo BLINK (desarrollo asistido) |
| Normas de referencia | ISO/IEC/IEEE 29148 · ISO/IEC 25010 · ISO 9241-210 · ISO 20022 |

## 1. Objetivo y alcance

Este documento responde a los dos insumos recibidos el 2026-11-01:

1. **`LEG-TER-001`** *Términos y Condiciones de Uso: plataforma tecnológica
   BLINK y gestión de billetera digital*, con tres cláusulas.
2. **Gaceta Oficial de la República Bolivariana de Venezuela N.º 43.335** del
   13 de marzo de 2026 (Año CLIII, Mes VI), que publica el exhorto nacional de
   tarifas urbanas, la Resolución 013 de tarifas suburbanas y resoluciones
   laborales ajenas al transporte.

El alcance es el portal del pasajero (BLINK TARJETA): presentación de los
términos, separación visible entre la tarifa del pasaje y la tasa
administrativa, y veredicto de cumplimiento frente a la Gaceta. No cubre
contratos con transportistas ni la relación laboral de las resoluciones 677 y
678.

## 2. Veredicto de `LEG-TER-001`

| Cláusula | Requisito | Estado | Dónde se cumple |
| --- | --- | --- | --- |
| Primera.1 | BLINK es plataforma de pagos, no transportista | Cumplido | Hoja de términos §1 y aviso superior |
| Primera.1 | Tarifa del pasaje percibida íntegramente por el transportista | Cumplido | El motor acredita `N × tarifa`; la tasa se cobra aparte |
| Primera.2 | Tasa administrativa por servicio digital | Cumplido | Hoja §2; recibo «Tasa administrativa digital» |
| Primera.3 | Tasa independiente del tabulador oficial | Cumplido | `monto_base` no incluye comisión ni margen |
| Segunda | Comprobante con pasaje, tasa y total discriminados | Cumplido | Recibo, paso de revisión y comprobante copiable |
| Tercera.1 | Tarjeta MIFARE Classic 1K como soporte local | Cumplido | Hoja §4; firmware y DOC-16 |
| Tercera.2 | Saldo como fondos del usuario | Cumplido | Saldo virtual y del chip; DOC-03 |
| Tercera.3 | Sin comisión al validar; débito exacto | Cumplido | El validador debita `cards.tarifa` sin recargo |

La hoja se abre desde el pie del acceso y desde **Perfil → Términos y
condiciones**. La tarifa mostrada sale de `tarjeta.tarifa` (o del tarifario si
aún no hay tarjeta), no de un texto fijo.

## 3. Veredicto de la Gaceta 43.335

| Disposición | Contenido | Relación con BLINK |
| --- | --- | --- |
| Exhorto, art. 1 | Pasaje urbano en Bs 100,00; metro, ferrocarril y operadores del Estado en Bs 80,00 | Referencia nacional; la competencia urbana es municipal (art. 178.2 CRBV) |
| Exhorto, art. 2 | Pasaje gratuito urbano para mujeres de 50 años o más y hombres de 60 o más | No implementado como validación de edad; ver B-33 |
| Exhorto, art. 3 | Pasaje gratuito para personas con discapacidad | No implementado; ver B-33 |
| Exhorto, art. 4 | 50 % de descuento a estudiantes | La tarjeta puede tener tarifa 250, pero no hay registro estudiantil; B-33 |
| Resolución 013, art. 1 | Tarifa suburbana máxima de Bs 100 a Bs 145 según distancia, con 20 % para el Fondo de Seguridad, Responsabilidad Civil y de Ocupantes | BLINK opera tarifa urbana; el suburbano queda fuera del MVP |
| Resolución 013, art. 4 | Recargo del 20 % en fechas y horarios indicados | El motor no aplica recargos por fecha; decisión comercial pendiente |
| Resolución 013, arts. 6–9 | Formato único, atención preferencial y descuentos | Aplica al transportista, no a la plataforma |
| Resolución 013, arts. 10–13 | Seguro de responsabilidad civil, equipaje y pérdidas | Responsabilidad del transportista; BLINK no la sustituye |

## 4. Hallazgo crítico: Bs 500 frente a Bs 100

`LEG-TER-001` afirma que «la tarifa oficial del pasaje urbano vigente fijada
por la autoridad competente es de **500,00 Bs**». La Gaceta 43.335 fija la
referencia nacional en **100,00 Bs** para el pasaje urbano y no menciona 500.

La Constitución asigna a los municipios la competencia sobre las tarifas del
transporte urbano (artículo 178, numeral 2). Por eso puede existir una
providencia municipal que homologue 500 Bs aunque la referencia nacional sea
100 Bs; **pero esa providencia no está entre los insumos recibidos**.

Consecuencias y decisión tomada:

- El portal **no afirma** que 500 Bs sea la tarifa oficial nacional. Dice
  «tarifa aplicada en esta operación», explica que la homologa la autoridad
  municipal y cita la referencia de la Gaceta.
- El motor sigue acreditando 500 Bs por pasaje porque es la tarifa grabada en
  las tarjetas y ya aplicada en producción. Cambiarla es una decisión
  comercial y legal del propietario, no un ajuste técnico.
- Si no existe decreto municipal, la diferencia de 400 Bs por viaje no puede
  presentarse como «pasaje»: habría que bajar `cards.tarifa` a 100 Bs o
  reestructurar el producto. Queda como **B-32** con prioridad alta.

## 5. Implementación en el portal

### 5.1 Hoja de términos

`src/components/HojaLegal.tsx` reutiliza la hoja modal del portal y contiene:

1. Naturaleza del servicio y competencia municipal sobre la tarifa.
2. Tasa administrativa por servicio digital, variable y separada.
3. Desglose de cada recarga: pasaje, tasa y total.
4. Condiciones de la tarjeta MIFARE Classic 1K.
5. Datos personales: uso, PIN con hash y derechos del titular.
6. Base normativa y vigencia, con la referencia de la Gaceta 43.335.

La hoja se abre desde el acceso (**términos y condiciones**, en el pie) y
desde **Perfil → BLINK → Términos y condiciones**. Funciona sin conexión
porque viaja en el paquete de la aplicación.

### 5.2 Recibo alineado con la cláusula segunda

| Antes | Ahora |
| --- | --- |
| «Pasajes: 2 · Bs 1.000» | «Pasaje urbano: 2 × Bs 500 · Bs 1.000» |
| «Comisiones y servicio: Bs 60» | «Tasa administrativa digital: Bs 60» |
| Solo el total | Total, pasaje y tasa en el paso de revisión y en el comprobante copiable |

El detalle interno (`comisionEntrada`, `provisionSalida`, `margen`,
`excedente`) sigue guardado en la base para contabilidad, pero no se expone
al pasajero: la cláusula segunda pide dos conceptos, no cuatro.

## 6. Decisiones

| ID | Decisión | Motivo | Consecuencia |
| --- | --- | --- | --- |
| ADR-21 | La tarifa del pasaje se toma de la tarjeta y los términos no llevan montos fijos | Evitar textos legales desactualizados al cambiar la tarifa | La hoja se recalcula con `tarjeta.tarifa` |
| ADR-22 | Una sola línea de «Tasa administrativa digital» en el recibo | La cláusula segunda exige separar pasaje y tasa, no revelar el desglose bancario interno | El back-office conserva el desglose completo |
| ADR-23 | No declarar 500 Bs como tarifa oficial nacional | La Gaceta 43.335 fija 100 Bs y la homologación es municipal | Se cita la competencia municipal y queda B-32 |

## 7. Verificación (2026-11-01)

- Hoja abierta desde el acceso: muestra LEG-TER-001, versión 1.0 y Bs 500;
  las seis secciones y la nota de la Gaceta se leen completas.
- Hoja abierta desde Perfil con la tarjeta G-00001-001-N: misma tarifa y
  cierre con «Entendido».
- Recarga de 2 pasajes: recibo «Transfiere exactamente Bs 1.060», «Pasaje
  urbano 2 × Bs 500 · Bs 1.000» y «Tasa administrativa digital Bs 60».
- Comprobante copiable con tarifa, pasaje, tasa, transferido y a acreditar.
- `npm run typecheck` sin errores, 87 pruebas en 7 archivos y `npm run build`
  correcto.

## 8. Brechas y riesgos

| ID | Descripción | Prioridad |
| --- | --- | --- |
| B-32 | Falta el decreto municipal que homologue los 500 Bs; sin él, la tarifa no puede llamarse oficial | Alta |
| B-33 | Descuentos y gratuidades de la Gaceta (estudiantes, 50/60 años, discapacidad) no se validan al registrar la tarjeta | Media |
| R-14 | Publicar términos con una tarifa no homologada expone a observaciones por precios justos | Alta |
| R-15 | La hoja es un resumen operativo; no sustituye la revisión de un abogado antes de un reclamo formal | Media |

## 9. Referencias

- `LEG-TER-001`, *Términos y Condiciones de Uso*, 2026-11-01.
- Gaceta Oficial N.º 43.335, 13 de marzo de 2026: exhorto de tarifa urbana,
  Resolución 013 de tarifas suburbanas.
- BLINK-DOC-02 (arquitectura), DOC-03 (modelo de datos), DOC-08 (manual),
  DOC-19 (motor tarifario).
