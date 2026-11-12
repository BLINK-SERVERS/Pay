#!/usr/bin/env python3
# Genera `fuente.h` del validador ESP32 a partir de Inter (SIL OFL 1.1, en
# marca/fuentes/OFL-Inter.txt). Inter es el sustituto libre de SF Pro: la
# tipografía de Apple no se puede instalar ni redistribuir (riesgo R-26/L-16
# de la documentación), así que el datáfono usa la métrica y el trazo de Inter
# con la misma apariencia de texto del teléfono.
#
# Cada glifo se guarda como cobertura de 4 bits (2 px por byte, filas padreadas
# a byte), igual que los bitmaps de marca: el validador mezcla la cobertura con
# una tabla de 16 colores sobre el fondo de la escena. Un font bitmap de 1 bit
# recortaba los trazos finos de Inter a 14 px; con cobertura el texto sale
# alisado y en el mismo blanco que el arte.
#
# Uso: python3 scripts/build-firmware-fonts.py [salida.h]
import math
import os
import sys

from PIL import Image, ImageDraw, ImageFont

PAGOS = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "marca", "fuentes")
SALIDA = sys.argv[1] if len(sys.argv) > 1 else "/home/prodz/BLINK/firmware/validador/fuente.h"

# (nombre, archivo, tamaño en px, glifos que hacen falta)
FUENTES = [
    ("F14", "Inter-Medium.ttf", 14, "status bar y notas"),
    ("F20", "Inter-Regular.ttf", 20, "títulos y seriales"),
    ("F30", "Inter-SemiBold.ttf", 30, "importe del saldo"),
]

RANGO = range(0x20, 0x7F)  # 0x20 ' ' .. 0x7E '~'
MARGEN = 12                # holgura para que el recorte no corte sombras


def glifos(ttf, tam):
    fuente = ImageFont.truetype(os.path.join(PAGOS, ttf), tam)
    ascento, descento = fuente.getmetrics()
    lista = []
    for cp in RANGO:
        ch = chr(cp)
        avance = int(round(fuente.getlength(ch)))
        if cp == 0x20:
            lista.append((0, 0, 0, 0, avance, []))
            continue
        caja = fuente.getbbox(ch)  # relativa a la esquina sup-izq de la línea
        w, h = caja[2] - caja[0], caja[3] - caja[1]
        lienzo = Image.new("L", (max(1, caja[2]) + MARGEN, max(1, caja[3]) + MARGEN), 0)
        ImageDraw.Draw(lienzo).text((MARGEN, MARGEN), ch, font=fuente, fill=255)
        recorte = lienzo.crop((caja[0] + MARGEN, caja[1] + MARGEN, caja[2] + MARGEN, caja[3] + MARGEN))
        pixeles = list(recorte.getdata())
        paso = (w + 1) >> 1
        bytes_glifo = [0] * (paso * h)
        for i, v in enumerate(pixeles):
            a = min(15, (v * 15 + 127) // 255)
            fila, col = divmod(i, w)
            k = fila * paso + (col >> 1)
            if col & 1:
                bytes_glifo[k] |= a
            else:
                bytes_glifo[k] = a << 4
        lista.append((w, h, caja[0], caja[1], avance, bytes_glifo))
    return ascento, descento, lista


def escribir(nombre, ttf, tam):
    ascento, descento, gs = glifos(ttf, tam)
    offsets, pool = [], []
    for g in gs:
        offsets.append(len(pool))
        pool.extend(g[5])
    alto = max((g[3] + g[1] for g in gs if g[1]), default=tam)
    lines = [
        f"constexpr uint8_t {nombre}_PRIMERO = 0x20;",
        f"constexpr uint8_t {nombre}_ULTIMO = 0x7E;",
        f"constexpr int16_t {nombre}_ALTO = {alto};   // línea: {ascento} + {descento}",
        f"constexpr uint16_t {nombre}_B = {len(pool)};",
        f"const uint8_t {nombre}[] PROGMEM = {{",
    ]
    for i in range(0, len(pool), 16):
        lines.append("  " + ", ".join(f"0x{v:02x}" for v in pool[i : i + 16]) + ",")
    lines.append("};")
    lines.append(f"const Glifo {nombre}G[] PROGMEM = {{")
    for i, (off, g) in enumerate(zip(offsets, gs)):
        w, h, xo, yo, adv, _ = g
        lines.append(f"  {{{w}, {h}, {xo}, {yo}, {adv}, {off}}},  // 0x{0x20 + i:02x} {chr(0x20 + i)!r}")
    lines.append("};")
    return "\n".join(lines) + "\n", len(pool)


cabecera = """#pragma once
#include <Arduino.h>

// Generado por Pay/scripts/build-firmware-fonts.py desde Inter (SIL OFL 1.1).
// No editar a mano: regenerar tras cualquier cambio de tipografía o tamaño.
//
// Glifo = cobertura de 4 bits por pixel (2 px por byte, filas padreadas a
// byte) dentro del pool de la fuente. ancho/alto es la caja de tinta;
// x_off/y_off se miden desde la esquina superior izquierda del cursor, de
// modo que setCursor(x, y) deja el texto colgado de esa línea.
//
// Inter sustituye a SF Pro (licencia Apple restringida: R-26 / L-16).

struct Glifo {
  uint8_t ancho;
  uint8_t alto;
  int8_t x_off;
  int8_t y_off;
  uint8_t x_avance;
  uint16_t offset;
};

struct Fuente {
  const Glifo* glifos;
  const uint8_t* pool;
  uint8_t primero;
  uint8_t ultimo;
  int16_t alto;
};

"""

cuerpo, total = [], 0
for nombre, ttf, tam, _ in FUENTES:
    bloque, n = escribir(nombre, ttf, tam)
    cuerpo.append(bloque)
    total += n

cuerpo.append(
    "constexpr Fuente BLINK_F14 = {F14G, F14, F14_PRIMERO, F14_ULTIMO, F14_ALTO};\n"
    "constexpr Fuente BLINK_F20 = {F20G, F20, F20_PRIMERO, F20_ULTIMO, F20_ALTO};\n"
    "constexpr Fuente BLINK_F30 = {F30G, F30, F30_PRIMERO, F30_ULTIMO, F30_ALTO};\n"
)

with open(SALIDA, "w") as f:
    f.write(cabecera + "\n".join(cuerpo))

print(f"fuente.h: {SALIDA} — pool {total} B, archivo {os.path.getsize(SALIDA)} B")
for nombre, ttf, tam, nota in FUENTES:
    print(f"  {nombre} ({ttf} {tam}px): {nota}")
