# Documento maestro de estética Blink

**ID:** `BLINK-EST-001` · **Versión:** 1.0 · **Fecha:** 2026-11-07
**Ámbito:** Blink Pay (`Pay`) y Blink POS (`POS`)
**Norma de referencia:** Apple Human Interface Guidelines + UI Kit de iOS 27

Este documento fija la identidad visual de Blink y cómo se aplica en las dos
aplicaciones. Todo lo que se dibuje, se pinte o se mueva en la interfaz debe
poder justificarse con una sección de aquí. Las medidas de la marca salen de
los SVG de `marca/`, no de aproximaciones: si el SVG cambia, esta ficha debe
cambiar con él.

---

## 1. Objeto y fuentes

### 1.1 Qué manda este documento

1. La **marca**: isotipo, logotipo, icono de app, tarjeta y sus variantes.
2. El **sistema**: color, tipografía, iconografía, materiales, formas y
   movimiento.
3. Las **reglas de aplicación** en iOS (móvil) y macOS (escritorio).
4. El **inventario de activos** con su procedencia y sus medidas reales.

### 1.2 Fuentes normativas

| Fuente | Qué se tomó |
| --- | --- |
| [Apple Pay HIG](https://developer.apple.com/design/human-interface-guidelines/apple-pay) | Estructura de la hoja de pago, jerarquía de la tarjeta, confirmación |
| [Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines) | Fundamentos: color, tipografía, materiales, layout, accesibilidad |
| [iOS UI Components · Apple Pay (Figma)](https://www.figma.com/community/file/1137278811067213183/ios-ui-components-apple-pay) | Componentes y hojas del ecosistema de pago |
| [Apple Pay · Smart Animate (Figma)](https://www.figma.com/es-la/comunidad/file/893637378074104056/apple-pay-smart-animate-interaction) | Transiciones y continuidad entre pantallas |
| [sfsymbols (bradleyhodges)](https://github.com/bradleyhodges/sfsymbols) | Catálogo tipado de SF Symbols |
| [sf-symbols-lib (phranck)](https://github.com/phranck/sf-symbols-lib) | Paquete SVG usado por `BlinkSymbol` |
| [Sketch · recursos exportables](https://www.sketch.com/s/04c24d8b-38fb-4afb-8836-36617e022f02) | Tokens de color y estilos exportables |
| `POS/docs/HIG/*.md` | Corpus local de la HIG (58 artículos y sus prácticas) |
| `POS/docs/DESIGN_IOS27_KIT.md`, `POS/docs/ios27-geometry.json` | Paleta, materiales y escala tipográfica del kit de iOS 27 |

Los artículos locales que sostienen cada decisión se citan al pie de su
sección. Cuando una regla de este documento y la HIG discrepan, gana la HIG.

---

## 2. La marca

### 2.1 Isotipo

Tres figuras geométricas sueltas, **sin fondo ni contenedor**: el ojo que
guiña, el ojo abierto y la boca. Es la unidad mínima de identidad y la única
pieza que puede usarse sola.

Caja de dibujo propia: **360 × 284** unidades (proporción 1,2676). La unidad de
construcción es **u = 68**, el radio del ojo abierto.

| Figura | Caja | Medida | Construcción |
| --- | --- | --- | --- |
| Ojo que guiña | x 76–224 · y 164–232 | 148 × 68 | Cápsula de radio 34; altura = 1u |
| Ojo abierto | centro (368, 182) | ⌀ 136 | Círculo de radio 68 = 1u |
| Boca | x 173,98–338,02 · y 286–398 | 164 × 112 | Borde superior recto en y = 286; cubeta de semidisco r = 81 |

Relaciones que no se tocan:

- **Hueco entre ojos:** 76 u (1,117u) entre el borde derecho de la cápsula y el
  izquierdo del círculo.
- **Hueco ojo–boca:** 36 u (0,529u).
- **Desfase vertical de los ojos:** el centro del ojo que guiña está 16 u por
  debajo del centro del ojo abierto; es lo que da la expresión de guiño.
- **Curvatura:** todas las uniones son **G2** (curvatura continua). Los hombros
  de la boca llegan a **κ = 0** antes de encontrarse con el borde recto, para
  que no aparezca un vértice. La lámina `blink-reticula.svg` documenta los
  radios osculadores y es la prueba de construcción.

El isotipo se dibuja con `fill` propio (o `currentColor`), nunca con trazo,
degradado ni sombra.

### 2.2 Logotipo Blink (Blink POS)

Palabra **Blink** + isotipo. Es la marca general y la cabecera de Blink POS.

| Dato | Valor |
| --- | --- |
| Lienzo | 875,78 × 190,00 |
| Mayúscula (cap) | 179 |
| Tipografía | SF Pro Display **Bold Italic**, trazada desde el glifo real |
| Isotipo | 190 de alto (240,84 de ancho), apoyado en la línea base |
| Hueco palabra–isotipo | 41 |
| Color | tinta `#1D1D1F` en claro · blanco en oscuro y sobre azul |

La palabra conserva el espaciado nativo de SF Pro: no se aplica *tracking*
manual ni se altera el grosor.

### 2.3 Logotipo Blink Pay

Palabra **Blink Pay** + tres ondas de pago sin contacto. Es la marca de la
cartera y de la tarjeta.

| Dato | Valor |
| --- | --- |
| Lienzo | 1133,15 × 320,59 |
| «Blink» | SF Pro Display **Bold Italic**, cap 176 |
| «Pay» | SF Pro Display **Regular**, mismo cap y misma línea base |
| Línea base | y = 277,9 |
| Ondas | 3 arcos de 90°, radio 61 / 108,1 / 154,7; trazo 24,4 con remates redondos |
| Centro de las ondas | (966,25, 166,9) |
| Caja de ondas | x 954,05–1133,15 · y 0–179,1 |

El borde superior del lienzo es **tangente al trazo de la onda exterior**, y su
borde derecho coincide con el ancho de esa onda: la marca no lleva relleno
alrededor por arriba ni por la derecha. El descendente de la «y» toca el borde
inferior.

Variantes de color:

| Archivo | Relleno | Uso |
| --- | --- | --- |
| `blink-pay.svg` | `currentColor` | Interfaz: hereda el color del texto |
| `blink-pay-azul.svg` | `#007AFF` | Sobre fondos claros y en papelería |
| `blink-pay-blanco.svg` | `#FFFFFF` | Sobre azul, foto oscura o vídeo |

### 2.4 Icono de app Blink Pay (isotipo + Pay + ondas)

Composición horizontal para cabeceras estrechas y para el icono de marca.

| Dato | Valor |
| --- | --- |
| Lienzo | 981,11 × 405,50 |
| Isotipo | 223 de alto (282,67 de ancho) |
| «Pay» | SF Pro Display Regular, cap 221 |
| Ondas | tres arcos, mismo criterio que el logotipo |

No sustituye al logotipo en la cabecera de la app (ahí va `blink-pay.svg`): se
usa cuando hace falta la carita junto a la palabra en un espacio casi
cuadrado.

### 2.5 Color de marca

| Rol | Valor | Uso |
| --- | --- | --- |
| Azul Blink | `#007AFF` | Todas las piezas de marca, en las dos apariencias |
| Azul claro de las figuras | `#80BCFB` | Arte fijo de la tarjeta |
| Blanco | `#FFFFFF` | Marca sobre azul, foto oscura o vídeo |
| Tinta | `#1D1D1F` | Logotipo POS sobre papel claro |

El azul `#007AFF` es el color oficial de la marca y no se mezcla: las
transparencias se derivan de él con `color-mix` o `rgb(from …)`.

Dos precisiones para no confundir marca con interfaz:

- El **azul de identidad** (logotipo, isotipo, tarjeta, iconos de app) es
  `#007AFF` en todas las piezas y no se invierte en oscuro.
- El **acento de interfaz** es un token aparte (§3.1): Blink Pay usa
  `#007AFF` en claro y `#0091FF` en oscuro; Blink POS usa `#0088FF`
  (`--blink-primary`). El papel también difiere: Pay usa el fondo agrupado de
  iOS `#F2F2F7`; POS usa el papel de marca `#FFFEFB`. Ninguno de los dos toca
  el arte de la marca.

### 2.6 Área de respeto y tamaños mínimos

Estas son normas de este documento, no medidas del SVG.

- **Área de respeto:** `0,5 ×` la altura de mayúscula alrededor del logotipo.
  En el isotipo suelto, **1u** (68 unidades de su retícula, ≈ 23,9 % de su
  altura). Dentro de ese margen no entra texto, icono, borde ni otra marca.
- **Tamaño mínimo digital:**

| Pieza | Ancho mínimo | Equivalente |
| --- | --- | --- |
| Logotipo Blink | 96 px | cap ≈ 19,6 px |
| Logotipo Blink Pay | 120 px | cap ≈ 18,6 px |
| Isotipo suelto | — | 24 px de alto |
| Icono de app | — | 48 × 48 px (el maestro es 1024) |

- **Impresión:** logotipo ≥ 24 mm de ancho; isotipo ≥ 6 mm de alto.

### 2.7 Usos incorrectos

No se permite:

1. Estirar, comprimir ni rotar la marca (la itálica ya es parte del dibujo:
   inclinarla otra vez la deforma).
2. Cambiar la tipografía, el grosor, el *tracking* o separar letras.
3. Recolorear fuera de las variantes de §2.5, aplicar degradados, sombras,
   contornos o biseles.
4. Poner el isotipo dentro de un cuadrado, círculo o pastilla (el contenedor
   solo existe en el **icono de app**, §9).
5. Reordenar, recortar o sustituir las tres figuras, o cambiar la inclinación
   de la boca.
6. Usar la versión de un solo color sobre un fondo con contraste < 4,5:1.
7. Animar el logotipo completo: en los cargadores se mueven solo las piezas
   indicadas en §8.

### 2.8 La tarjeta

Arte estático y aprobado, sin vehículos ni iconos de transporte.

| Dato | Valor |
| --- | --- |
| Lienzo | 1011 × 638 (proporción 1,5846 ≈ 85,6 × 54 mm) |
| Fondo | `#007AFF` a sangre |
| Figuras | isotipo a escala 3, en `#80BCFB`, recortadas por los bordes |
| Marca | Blink Pay blanco, escala 0,292 (cap 51,4), abajo a la derecha |
| Margen de la marca | 43,1 por la derecha · 43,4 por abajo |
| Esquinas | las pone la interfaz (radio proporcional al tamaño); el SVG va a sangre |

La cara trasera no es arte: es contenido vivo (QR de recarga, serial y código
de barras Code 128) y se compone con los mismos tokens que el resto de la app.

---

## 3. Color

### 3.1 Dos apariencias, una paleta

La apariencia la decide `color-scheme` en `<html>`: `light dark` sigue al
sistema; `light` o `dark` fuerzan el ajuste elegido en la app. Cada token se
declara con `light-dark(claro, oscuro)` para no duplicar la paleta.

| Token | Claro | Oscuro | Uso |
| --- | --- | --- | --- |
| `--color-bg-primary` (Pay) | `#F2F2F7` | `#000000` | Fondo de la app |
| `--blink-bg-main` (POS) | `#FFFEFB` | `#000000` | Fondo de la app |
| `--color-bg-elevated` | `#FFFFFF` | `#1C1C1E` | Tarjetas y hojas |
| `--color-bg-subtle` | `#F2F2F7` | `#2C2C2E` | Grupos dentro de una superficie |
| `--color-text-primary` | `#1D1D1F` | `#FFFFFF` | Títulos y cifras |
| `--color-text-secondary` | `#424242` | `#EBEBF5` | Etiquetas y apoyo |
| `--color-text-tertiary` | `#6E6E6E` | `#A1A1AA` | Metadatos |
| `--color-accent` | `#007AFF` | `#0091FF` | Acción y enlaces |
| `--color-action-fill` | `#0066CC` | `#0066CC` | Texto pequeño sobre relleno azul |
| `--color-success` | `#34C759` | `#30D158` | Saldo OK |
| `--color-warning` | `#FFCC00` | `#FFD600` | Aviso |
| `--color-danger` | `#FF383C` | `#FF4245` | Error y bloqueo |
| `--color-border` | `rgba(66,66,66,.16)` | `rgba(235,235,245,.18)` | Bordes y separadores |
| `--ios-separator` | `rgba(66,66,66,.10)` | `rgba(235,235,245,.18)` | *Hairline* de listas |

Reglas:

- El texto sobre un relleno de acento es **siempre claro** (`#FFFFFF`), en las
  dos apariencias: el azul de marca no se invierte.
- Los estados llevan su propio token de texto (`--color-success-text`,
  `--color-danger-text`, `--color-warning-text`) para conservar 4,5:1 sobre su
  velo de color.
- Las variaciones (hover, velos, anillos) se derivan del color base con
  transparencia; no se añaden colores nuevos.
- El azul de la marca no cambia entre apariencias en el **arte de la tarjeta**:
  es un activo fijo.

Referencias: `color.md`, `dark-mode.md`, `color.best-practices.md`.

---

## 4. Tipografía

Una sola pila para todo el producto:

```css
"SF Pro", "SF Pro Text", "SF Pro Display", "Inter", -apple-system,
BlinkMacSystemFont, "Segoe UI", Roboto, system-ui, "Helvetica Neue", Arial, sans-serif
```

- **SF Pro** se pide al sistema con `local()`: sale de serie en Apple y se usa
  en el resto si está instalada.
- **Inter** (SIL OFL 1.1) va detrás y se sirve desde la app: es el respaldo
  para equipos sin SF Pro. Ningún fichero de Apple se distribuye.
- La diferencia entre Display y Text la resuelve el eje óptico (`opsz`), no el
  nombre: por eso `--font-display`, `--font-text` y `--font-primary` apuntan a
  la misma pila.
- **SF Mono** solo para datos técnicos: serial, SKU, códigos. Siempre con
  `font-variant-numeric: tabular-nums` para que las cifras no bailen.

Escala (puntos / interlineado, iOS 27):

| Estilo | Tamaño | Interlineado | Uso |
| --- | --- | --- | --- |
| Large Title | 34 | 41 | Título grande de sección (móvil) |
| Title 1 | 28 | 34 | Título de pantalla |
| Title 2 | 22 | 28 | Encabezado de grupo |
| Title 3 | 20 | 25 | Subtítulo |
| Headline | 17 | 22 | Énfasis en una lista |
| Body | 17 | 22 | Texto general |
| Callout | 16 | 21 | Texto secundario |
| Subheadline | 15 | 20 | Etiquetas |
| Footnote | 13 | 18 | Ayuda y metadatos |
| Caption 1 | 12 | 16 | Pie de tarjeta |
| Caption 2 | 11 | 13 | Micro-etiqueta |

Pesos: Regular (400), Semibold (600) para etiquetas y énfasis, y Bold (700)
para títulos y cifras de saldo. El 650 aparece solo en el texto de un botón
destacado y el 800 solo en el lema del reverso de la tarjeta; ningún otro
elemento los usa. El ancho no se comprime ni se expande.

Referencias: `typography.md`, `typography.best-practices.md`.

---

## 5. Iconografía

Todo icono de la interfaz es un **SF Symbol** servido por `BlinkSymbol`
(`src/components/ui/BlinkSymbol.tsx`). No hay iconos dibujados a mano en la
app.

- **Tamaños:** `xs` 12 · `sm` 16 · `md` 20 · `lg` 24 · `xl` 32 (o píxeles).
- **Variantes:** `monocromo`, `jerarquico` (por defecto), `paleta`,
  `multicolor`.
- **Animaciones:** `ninguna`, `rebote`, `pulso`, `color-variable`, `reemplazo`
  (clases `simbolo--*`).
- **Color:** siempre `currentColor`; el contexto lo tiñe con sus tokens.
- **Accesibilidad:** si el símbolo comunica algo, se pasa `titulo` (role
  `img`); si es decorativo, queda `aria-hidden`.

Mapa de alias → símbolo oficial:

| Alias | SF Symbol | Alias | SF Symbol |
| --- | --- | --- | --- |
| `tarjeta` | creditcard | `atras` | chevron.left |
| `inicio` | house | `adelante` | chevron.right |
| `movimientos` | list.bullet | `autobus` | bus.fill |
| `recargar` | plus.circle | `banco` | building.columns.fill |
| `transferir` | arrow.left.arrow.right | `telefono` | phone.fill |
| `perfil` | person.crop.circle | `documento` | text.document.fill |
| `check` | checkmark | `reloj` | clock.fill |
| `check-circulo` | checkmark.circle.fill | `salir` | rectangle.portrait.and.arrow.right |
| `alerta` | exclamationmark.triangle.fill | `sol` | sun.max.fill |
| `ojo` | eye | `luna` | moon.fill |
| `ojo-tachado` | eye.slash | `auto` | circle.lefthalf.filled |
| `copiar` | doc.on.doc | `compartir` | square.and.arrow.up |
| `candado` | lock.fill | `rayo` | bolt.fill |
| `cerrar` | xmark | `escudo` | checkmark.shield.fill |
| `ayuda` | questionmark.circle | `huella` | touchid |
| `actualizar` | arrow.trianglehead.2.clockwise | `qr` | qrcode |
| `punto` | circle.fill | `barras` | barcode |
| `mas` | plus | `persona` | person.fill |
| `correo` | envelope.fill | `personas` | person.2.fill |
| `destello` | sparkles | | |

**Licencia:** Apple restringe SF Symbols a sus plataformas. Blink es una PWA
que también corre en Android y Windows; el uso está autorizado por la
dirección del proyecto y el riesgo queda documentado (R-26). La alternativa
si esa autorización cambia es sustituir el paquete `sf-symbols-lib` por un set
propio con la misma métrica (24 × 24, trazo 2).

Referencias: `sf-symbols.md`, `icons.md`, `icons.best-practices.md`.

---

## 6. Layout y componentes

### 6.1 iOS (móvil)

- Contenedor de la app: ancho máximo **480 px**, centrado, `100dvh`.
- Estructura: barra superior translúcida, contenido con desplazamiento,
  **barra de pestañas** inferior con 5 destinos (Inicio, Movimientos, Recargar,
  Transferir, Perfil) y etiqueta visible.
- Título grande que colapsa al desplazar; la barra gana el título compacto.
- Hojas inferiores (`Hoja`) para vincular tarjeta, confirmar y avisos legales:
  esquinas superiores redondeadas, tirador, fondo atenuado.
- **Objetivos táctiles ≥ 44 × 44 pt**, incluidos los botones de icono.
- Listas agrupadas: la separación la da el fondo (`--color-bg-subtle`), no la
  sombra; separadores de 1 px (`--ios-separator`), sangrados a la izquierda.
- Cifras de dinero y saldo con `tabular-nums` y `font-variant-numeric`.

### 6.2 macOS (escritorio)

| Ancho | Estructura |
| --- | --- |
| < 768 px | igual que iOS, a una columna |
| ≥ 768 px | rejilla `240px + 1fr`: barra lateral translúcida + contenido |
| ≥ 1080 px | `240px + 1fr + 300px`: aparece el **inspector** de movimiento |

- La barra lateral tiene los mismos destinos que la barra de pestañas, con
  icono y etiqueta (el último se llama «Mi cuenta» en escritorio), y marca el
  destino activo con el velo del acento. Un pie con el perfil y el estado de
  conexión cierra la columna.
- La barra superior es unificada (título + acciones) y translúcida.
- El inspector muestra el detalle del movimiento seleccionado; sin selección,
  un estado vacío con el símbolo correspondiente.
- Los *hover* se derivan del acento y del texto; no hay un cuarto color.

### 6.3 Formas

| Token | Valor | Uso |
| --- | --- | --- |
| `--radius-sm` | 8 px | Controles pequeños, chips |
| `--radius-md` | 12 px | Botones, campos |
| `--radius-lg` | 18 px | Tarjetas y hojas |
| `--radius-pill` | 50 px | Cápsulas de estado |
| Tarjeta virtual | 22 px (proporcional con `cqw`) | Panel de la tarjeta |
| Hojas inferiores | 28 px arriba | `Hoja` |

### 6.4 Elevación

- Las listas **no llevan sombra**: se agrupan por superficie.
- La elevación (`--shadow-ios-card`, `--shadow-ios-panel`,
  `--shadow-ios-raised`) se reserva a paneles flotantes y hojas.
- En oscuro la sombra se sustituye por un halo y un borde de 1 px
  (`light-dark()` dentro de cada capa, porque la función solo resuelve color).

Referencias: `layout.md`, `lists-and-tables.md`, `tab-bars.md`, `sidebars.md`,
`sheets.md`, `buttons.md`, `modality.md`.

---

## 7. Materiales (Liquid Glass)

El cristal se usa en barras y paneles flotantes; nunca en el contenido que se
lee.

| Token | Valor | Uso |
| --- | --- | --- |
| `--ios-material-blur-small` | 6 px | Material claro pequeño |
| `--ios-material-blur-medium` | 15 px | Material oscuro / medio |
| `--ios-material-blur-large` | 30 px | Paneles grandes |
| `--ios-glass-bg` | `#F8F8F8` / `#1A1A1A` | Fondo del material |
| `--ios-rim` | línea interior 1 px translúcida | Canto del vidrio |
| `--ios-specular` | brillo superior 1 px | Luz sobre el borde |
| `--ios-veil` | degradado vertical | Volumen del material |

Reglas:

- El desenfoque crece en oscuro (`--ios-blur` cambia solo, siguiendo
  `color-scheme`).
- El velo en oscuro necesita más presencia: un 8 % de blanco sobre negro es
  invisible.
- Sobre el cristal, el texto usa `--color-text-primary`/`-secondary`; nunca el
  acento puro para texto pequeño.

Referencias: `materials.md`, `materials.best-practices.md`, `toolbars.md`.

---

## 8. Movimiento

### 8.1 Principios

1. El movimiento explica un cambio de estado; no decora.
2. Duración corta (≤ 0,5 s) para respuesta; los cargadores son la excepción
   porque comunican progreso continuo.
3. Curvas de iOS: `cubic-bezier(0.32, 0.72, 0, 1)` para desplazamientos y
   `ease-in-out` para opacidad.
4. Todo movimiento tiene versión estática en `prefers-reduced-motion`.

### 8.2 Cargador de Blink Pay (ondas NFC)

Pantalla de restauración de sesión. La marca se incrusta como SVG y se animan
**solo** las tres ondas, de dentro hacia fuera.

| Parámetro | Valor |
| --- | --- |
| Animación | `onda-nfc` 1,8 s `ease-in-out` `infinite both` |
| Opacidad | 0,2 → 1 (30 %) → 0,2 (65–100 %) |
| Retardos | `nfc-1` 0 s · `nfc-2` 0,18 s · `nfc-3` 0,36 s |
| Color | `--color-card-brand` (#007AFF) |
| Ancho | `min(260px, 72vw)` |

`both` es obligatorio: sin él, durante el retardo las ondas se ven a opacidad
1 y la cascada se pierde. Con `prefers-reduced-motion`, las tres ondas quedan
fijas a opacidad 1.

### 8.3 Cargador de Blink POS (reensamblado del isotipo)

La palabra **Blink** queda quieta; las tres figuras se separan, giran y vuelven
a su sitio.

| Parámetro | Valor |
| --- | --- |
| Animación | `brand-reassemble` 2,8 s `cubic-bezier(.45, 0, .2, 1)` `infinite` |
| 0–12 % | Isotipo armado |
| 32 % | Piezas separadas, sin rotar |
| 64 % | Piezas separadas y rotadas |
| 84–100 % | Armado, rotación completada |

| Pieza | Desplazamiento | Giro |
| --- | --- | --- |
| Ojo que guiña | (−56, −48) px | −360° |
| Ojo abierto | (+40, −56) px | +360° |
| Boca | (−12, +58) px | +360° |

Cada pieza usa `transform-box: fill-box` y `transform-origin: center` para
girar sobre su propio centro. El conjunto mide `clamp(200px, 60vw, 320px)`.

### 8.4 Otras transiciones

| Efecto | Especificación |
| --- | --- |
| Giro de la tarjeta | `rotateY(180°)`, 0,5 s `cubic-bezier(0.32,0.72,0,1)`, perspectiva 1200 px |
| Aparición de contenido | `aparecer` (opacidad) y `subir` (14 px hacia arriba) |
| Hoja inferior | 0,28 s `cubic-bezier(0.22,1,0.36,1)`; entra y sale 40 px; el velo funde en 0,24 s |
| Aviso flotante | `subir-aviso` traducido en X para centrar |
| Sello de confirmación | `sello` escala 0,4 → 1 con opacidad |
| Barrido de carga | `barrido` −55 % → +55 % |
| Latido de estado | `latido` halo verde 3 → 6 px |

### 8.5 Movimiento reducido

Con `prefers-reduced-motion: reduce` se anulan animaciones y transiciones
(0,001 ms, una iteración), se desactiva el desplazamiento suave y los dos
cargadores quedan estáticos y legibles.

`npm run verificar:movimiento` comprueba estas claves, duraciones y retardos
en Chromium, y que la versión reducida deja las piezas quietas y visibles.

Referencias: `loading.md`, `progress-indicators.md`, `gestures.md`.

---

## 9. Iconos de app, favicons y PWA

Se generan desde el isotipo oficial, sobre un cuadrado azul `#007AFF`, con el
glifo en blanco. **No llevan esquinas redondeadas en el maestro**: iOS y
Android aplican su propia máscara.

| Archivo | Lienzo | Glifo | Nota |
| --- | --- | --- | --- |
| `blink-pay-icono-app.svg` | 1024² | 700 de ancho | márgenes 162 / 235,9; glifo al 68,4 % |
| `blink-pay-icono-maskable.svg` | 1024² | 600 de ancho | zona segura de la máscara |
| `blink-pay-favicon.svg` | 1024² | 640 de ancho | `rx = 230` (el navegador no enmascara) |

- Blink POS tiene los equivalentes `POS/marca/blink-icono-app.svg`,
  `blink-icono-maskable.svg` y `blink-favicon.svg`.
- **Blink Pay** rasteriza `icon-192.png`, `icon.png` (512), `maskable-512.png`,
  `apple-touch-icon.png` (180) y `favicon.png` (32); el favicon vectorial es
  `favicon.svg`.
- **Blink POS** rasteriza `icons/icon-{192,512}.png`,
  `icons/icon-maskable-{192,512}.png`, `icons/apple-touch-icon.png` (180),
  `favicon.png` (32) y `favicon.ico` (16/32/48).
- Todos los PNG se aplanan a RGB sobre `#007AFF` (sin alfa) para evitar halos.
- El nombre corto del sistema es **Blink Pay**; en Pay el tema de la barra del
  navegador es `#F2F2F7` en claro y `#000000` en oscuro.

Reglas de la HIG que se respetan: arte a sangre, sin texto pequeño, sin
transparencia en el maestro, una sola idea visual y la misma silueta en todos
los tamaños.

Referencias: `app-icons.md`, `app-icons.best-practices.md`.

---

## 10. Accesibilidad

- **Contraste:** texto normal ≥ 4,5:1 y texto grande ≥ 3:1 en las dos
  apariencias. Los pares que se quedaban cortos (acento sobre velo, verde y
  rojo como texto) tienen token propio.
- **Objetivos táctiles:** ≥ 44 × 44 pt; en puntero fino se conserva el área.
- **Foco:** visible, con anillo derivado del acento; nunca se elimina sin
  sustituto.
- **Estado:** los cambios asíncronos se anuncian con `role="status"`,
  `aria-live` y `aria-busy` (por ejemplo, el cargador y el número copiado).
- **Formularios:** etiqueta asociada, mensaje de error junto al campo y
  `aria-invalid`.
- **Números:** cifras tabulares; el saldo oculto se anuncia como «Saldo
  oculto».
- **Idioma:** `lang="es"` en el documento; los importes usan coma decimal.
- **Movimiento:** respeto total a `prefers-reduced-motion` (§8.5).
- **Sin conexión:** el estado offline se comunica con texto e icono, no solo
  con color.

Referencias: `accessibility.md`, `accessibility.best-practices.md`.

---

## 11. Inventario de activos

### 11.1 Blink Pay · `Pay/marca/`

| Archivo | Lienzo | Uso |
| --- | --- | --- |
| `blink-pay.svg` | 1133,15 × 320,59 | Logotipo, `currentColor` |
| `blink-pay-azul.svg` | 1133,15 × 320,59 | Logotipo azul |
| `blink-pay-blanco.svg` | 1133,15 × 320,59 | Logotipo blanco |
| `blink-pay-icono.svg` | 981,11 × 405,50 | Isotipo + Pay + ondas |
| `blink-isotipo.svg` | 360 × 284 | Isotipo suelto, `currentColor` |
| `blink-pay-tarjeta.svg` | 1011 × 638 | Arte de la tarjeta |
| `blink-pay-icono-app.svg` | 1024² | Icono de app |
| `blink-pay-icono-maskable.svg` | 1024² | Icono maskable |
| `blink-pay-favicon.svg` | 1024² | Favicon vectorial |

`Pay/public/brand/` sirve una copia de los seis primeros (los que usa la
interfaz). Los iconos de app y favicon se rasterizan a PNG en `Pay/public/`.

`Pay/src/assets/marca-blink-pay.svg` es una copia sin prólogo XML de
`blink-pay.svg`, para incrustar con `?raw` (hereda el color y cambia con la
apariencia; un `<img>` resolvería `currentColor` a negro).

### 11.2 Blink POS · `POS/marca/` y `POS/app/public/brand/`

| Archivo | Carpeta | Lienzo | Uso |
| --- | --- | --- | --- |
| `blink.svg` | `app/public/brand/` | 875,78 × 190,00 | Logotipo, tinta oscura |
| `blink-blanco.svg` | `app/public/brand/` | 875,78 × 190,00 | Logotipo, blanco |
| `blink-isotipo.svg` | `app/public/brand/` | 360 × 284 | Isotipo suelto |
| `blink-icono-app.svg` | `marca/` | 1024² | Icono de app |
| `blink-icono-maskable.svg` | `marca/` | 1024² | Icono maskable |
| `blink-favicon.svg` | `marca/` | 1024² | Favicon vectorial |

Las copias `POS/app/src/assets/marca-blink*.svg` son las versiones sin prólogo
para incrustar en el cargador.

### 11.3 Procedencia

Todos los SVG se generan con `/home/prodz/.cache/blink-marca/generar.py`:

- Los glifos de **Blink** y **Pay** se trazan desde los contrafuertes reales de
  SF Pro Display (Bold Italic y Regular) con fontTools + uharfbuzz; no se usan
  aproximaciones ni fuentes sustitutas.
- El isotipo y las ondas son las formas aprobadas, trazadas con sus medidas
  (retícula, radios y grosores de §2).
- Los iconos derivan del mismo isotipo; ya no se usa el arte heredado del
  competidor.

Regenerar: `venv/bin/python generar.py` en `/home/prodz/.cache/blink-marca`.
Los PNG/ICO de POS: `npm run icons` en `POS/app` (Chromium de Playwright).

---

## 12. Verificación

| Comprobación | Herramienta | Criterio |
| --- | --- | --- |
| HIG visual y estructural | `npm run verificar:hig` (Pay) | 393 × 852 y 1440 × 900, claro y oscuro, sin desbordes |
| Iconos | mismo script | todo icono es SF Symbol; ninguno dibujado a mano |
| Tipografía | mismo script | pila SF Pro/Inter, cifras tabulares |
| Objetivos táctiles | mismo script | ≥ 44 px en controles |
| Material | mismo script | barra translúcida con desenfoque |
| Movimiento | `npm run verificar:movimiento` (Chromium, `getAnimations`) | claves, tiempos y retardos de la cascada NFC; separación y giro de las tres piezas; las dos versiones con movimiento reducido |
| Geometría de marca | Inkscape `--query-all` | cotas de §2 y §11 |

Los valores de esta ficha se comprobaron con `--query-all` sobre los SVG
publicados; cualquier cambio de arte debe repetir esa medición antes de
actualizar el documento.

---

## 13. Estado y pendientes

- **Dominio:** `pay.blink.com.ve` ya apunta al repositorio `Pay` por `CNAME`
  (sin proxy de Cloudflare) y sirve la última publicación; GitHub está emitiendo
  el certificado para forzar HTTPS. La ruta histórica
  `blink-servers.github.io/TARJETA/` queda solo como redirección.
- **Licencias:** SF Pro y SF Symbols se usan con autorización expresa de la
  dirección para Android, Windows, Linux y web; el riesgo queda registrado
  (R-26). No se distribuye ningún fichero de Apple.
- **Competidor:** el arte de iconos heredado de Wink está retirado; si
  apareciera en alguna caché o copia, se sustituye por los SVG de §9.
- **Mantenimiento:** este documento y `generar.py` son la fuente de verdad. Un
  cambio de arte sin actualizar las dos cosas se considera incompleto.
