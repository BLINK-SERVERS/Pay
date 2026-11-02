# Estándares Industriales y Controles de Calidad (Adoptados del Sistema Bip!)

| Campo | Valor |
| --- | --- |
| Código | BLINK-DOC-14 |
| Versión | 2.0.0 |
| Fecha | 2026-10-31 |
| Estado | Vigente |
| Normas | ISO/IEC 14443 (Tipo A) · ISO/IEC 7810 · ISO/IEC 10373 · DTP Metropolitano (Referencia) |
| Público | Exclusivo del Propietario (Diego Beleño) |

## 1. Objeto

Este documento formaliza las lecciones aprendidas y los mejores estándares industriales extraídos de las especificaciones técnicas del sistema de transporte masivo **Bip!** (Santiago de Chile), adaptados a la arquitectura ligera, propietaria y automatizada de **BLINK**. Su propósito es elevar el control físico, la durabilidad del material y la seguridad del inventario de tarjetas a un nivel de grado industrial.

---

## 2. Parámetros Técnicos y de Materiales Adoptados

Para garantizar que los plásticos PVC resistan la manipulación diaria, el calor y el uso en el transporte público de Maracaibo sin fallas prematuras, Blink adopta la estructura de capas y tolerancias del estándar de referencia:

### 2.1 Estructura de Laminación de 5 Capas (CR80)
Las tarjetas no deben ser impresas en una sola lámina delgada. Cada lote solicitado a fábrica debe cumplir con la estructura sándwich de 5 capas:
* **Capa 1:** Overlay protector superior normal.
* **Capa 2:** PVC frontal (Tiro) con el diseño estético de la tarifa (`G`, `E`, `A`).
* **Capa 3:** Inlay central con chip **NXP MIFARE Classic 1K** y antena de cobre alambrada (se prohíben antenas impresas de aluminio por su alta tasa de corte y fragilidad).
* **Capa 4:** PVC posterior (Retiro) con datos variables, código de barras Code 128 y QR.
* **Capa 5:** Overlay protector inferior normal.
* **Garantía mínima exigida al proveedor:** Soporte físico de 5 años y retención de datos en el chip de 7 a 10 años bajo rangos de temperatura de $-20\text{ °C}$ a $+50\text{ °C}$ y humedad de hasta el $93\%$.

---

## 3. Control de Unicidad Absoluta de Chips (Anti-Clonación de UID)

En los sistemas de transporte masivo, la duplicidad accidental o maliciosa de un número de serie de chip (`chip_uid`) es una falla crítica de seguridad. 

### 3.1 Mecanismo de Validación Preventiva en Blink
A diferencia del modelo tradicional de Bip (que requiere el envío manual de archivos planos con códigos CRC por correo electrónico a una entidad externa), Blink automatiza este control directamente en Supabase:
1. **Base Histórica de UID:** La tabla central `public.cards` posee una restricción de índice único absoluto (`UNIQUE`) sobre la columna `chip_uid`.
2. **Rechazo en Estación:** Si durante el proceso de enrolamiento (`bt_estacion_enrolar`), el microcontrolador ESP32 lee un `chip_uid` que ya se encuentra registrado en el sistema (incluso en un lote anterior), la función SQL rechaza la grabación de inmediato y emite una alerta visual de UID duplicado en la pantalla `ZJY-1.54IPS`.

---

## 4. Gestión Formal de Mermas y Defectos de Fábrica (`SCRAP`)

Para mantener la contabilidad exacta del inventario físico y financiero, Blink adopta el concepto de control de mermas de producción:

### 4.1 Tipos de Rechazo y Estados en Base de Datos
Toda tarjeta que falle antes de ser entregada a los puntos de venta comerciales se clasifica formalmente en la bitácora `public.card_events`:
* **`RFPGC` (Rechazo de Fábrica / Defecto Físico):** Tarjetas que llegan con daños en el PVC, rayones en la pista o antena cortada detectada durante el control de calidad visual.
* **`CHIP_ERR` (Error de Grabado en Estación):** Tarjetas cuyo bloque de identidad o sector de saldo falla al intentar escribir las llaves diversificadas en la estación del propietario.

Las tarjetas marcadas como `SCRAP` se retiran físicamente del inventario activo y se archivan en la base de datos para impedir auditorías descuadradas.

---

## 5. Control de Calidad y Cajas Selladas

* **Embalaje por Lotes:** Las tarjetas impresas deben entregarse en cajas selladas y etiquetadas, conteniendo rangos consecutivos exactos (por ejemplo, de la unidad `001` a la `100`).
* **Tolerancia de Defectos:** Si en un lote recibido se detecta un porcentaje de mermas superior al **3%**, el lote completo se considera rechazado y se devuelve al proveedor para su corrección bajo garantía.
* **Inspección Visual en Estación:** El propietario realiza la verificación aleatoria de al menos 5 tarjetas por cada caja nueva antes de activar el modo de avance secuencial automático (*Tap & Next*) en su estación de trabajo.