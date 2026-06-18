#!/usr/bin/env python3
"""Generate bookshelf app icons at multiple sizes using Pillow.

Outputs:
  - PWA icons (icon-192.png, icon-512.png): cream bg, rounded corners
  - Android adaptive icon foreground (ic_foreground.png): transparent bg, safe-zone art
"""

from PIL import Image, ImageDraw
import math
import os
import shutil
import sys

# Theme colors
BG         = "#f5f0e8"
PRIMARY    = "#5c3d1e"
ACCENT     = "#c17f3a"
SECONDARY  = "#8B6914"
DARK       = "#3a2510"

OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "frontend", "public")
ANDROID_RES = os.path.join("/tmp", "bookshelf-apk", "app", "src", "main", "res")

def _color(c: str, a: int = 255):
    r, g, b = int(c[1:3], 16), int(c[3:5], 16), int(c[5:7], 16)
    return (r, g, b, a)

def _round_corners(im: Image.Image, radius: float):
    w, h = im.size
    mask = Image.new("L", (w, h), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle([0, 0, w - 1, h - 1], int(radius), fill=255)
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    out.paste(im, mask=mask)
    return out

def draw_books_on_shelf(draw, size: int, m: float, shelf_y: float, shelf_h: float, unit: float):
    """Draw books and shelf — shared between PWA icon and adaptive foreground."""
    books = [
        (m + unit * 0.3,  unit * 2.0, unit * 5.0, PRIMARY),
        (m + unit * 2.8,  unit * 1.8, unit * 4.2, ACCENT),
        (m + unit * 5.1,  unit * 2.0, unit * 5.5, SECONDARY),
        (m + unit * 7.6,  unit * 1.9, unit * 3.6, PRIMARY),
    ]

    for bx, bw, bh, bc in books:
        top = shelf_y - bh
        left = bx
        right = bx + bw
        bottom = shelf_y
        r = max(2, size * 0.015)
        draw.rounded_rectangle(
            [left, top, right, bottom], r, fill=_color(bc),
            corners=[True, True, False, False],
        )
        spine_w = max(2, bw * 0.15)
        spine_left = left + max(2, bw * 0.08)
        draw.rectangle(
            [spine_left, top + r, spine_left + spine_w, bottom],
            fill=_color(DARK),
        )

    # Shelf bar
    shelf_left = m * 0.8
    shelf_right = size - m * 0.8
    draw.rectangle(
        [shelf_left, shelf_y, shelf_right, shelf_y + shelf_h],
        fill=_color(DARK),
    )
    shadow_h = max(2, size * 0.012)
    draw.rectangle(
        [shelf_left, shelf_y + shelf_h, shelf_right, shelf_y + shelf_h + shadow_h],
        fill=_color(PRIMARY),
    )
    # Shelf brackets
    bracket_w = max(4, size * 0.06)
    bracket_h = max(3, size * 0.03)
    for bx in [shelf_left + unit * 0.2, shelf_right - bracket_w - unit * 0.2]:
        draw.rectangle(
            [bx, shelf_y + shelf_h + shadow_h,
             bx + bracket_w, shelf_y + shelf_h + shadow_h + bracket_h],
            fill=_color(PRIMARY),
        )

    # Leaning background book
    lean_x1 = shelf_right - unit * 3.5
    lean_x2 = shelf_right - unit * 1.8
    lean_y1 = shelf_y - unit * 4.5
    lean_y2 = shelf_y - unit * 4.0
    draw.polygon(
        [(lean_x1, shelf_y), (lean_x2, shelf_y),
         (lean_x2 + unit * 0.6, lean_y1),
         (lean_x1 + unit * 0.6, lean_y2)],
        fill=(140, 100, 60, 90),
    )


def make_pwa_icon(size: int) -> Image.Image:
    """Full icon: cream background + books + rounded corners."""
    img = Image.new("RGBA", (size, size), _color(BG))
    draw = ImageDraw.Draw(img)
    m = size * 0.12
    shelf_y = size * 0.80
    shelf_h = max(3, size * 0.04)
    unit = (size - 2 * m) / 10
    draw_books_on_shelf(draw, size, m, shelf_y, shelf_h, unit)
    return _round_corners(img, size * 0.18)


def make_adaptive_foreground(size: int) -> Image.Image:
    """Transparent background + books centered in Android 66dp safe zone."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    # Safe zone: 66dp of 108dp = 66/108 ≈ 61% of canvas
    safe = 0.61
    inset = size * (1 - safe) / 2
    m = inset + size * 0.04
    shelf_y = size * 0.82
    shelf_h = max(5, size * 0.06)
    unit = (size - 2 * m) / 10
    draw_books_on_shelf(draw, size, m, shelf_y, shelf_h, unit)
    return img


def main():
    # PWA icons (for manifest + web)
    pwa_sizes = {"icon-192.png": 192, "icon-512.png": 512}
    for fname, size in pwa_sizes.items():
        path = os.path.join(OUT_DIR, fname)
        make_pwa_icon(size).save(path, "PNG")
        print(f"✓ PWA: {path} ({size}x{size})")

    # Android mipmap icons: FULL icon with cream background (legacy fallback for API 21-25)
    # These are the actual launcher icons shown on pre-adaptive-icon devices
    mipmap_sizes = {
        "mdpi": 48, "hdpi": 72, "xhdpi": 96,
        "xxhdpi": 144, "xxxhdpi": 192,
    }
    for density, size in mipmap_sizes.items():
        d = os.path.join(ANDROID_RES, f"mipmap-{density}")
        os.makedirs(d, exist_ok=True)
        path = os.path.join(d, "ic_launcher.png")
        # Full icon with cream background + rounded corners (like PWA icons)
        make_pwa_icon(size).save(path, "PNG")
        print(f"✓ Mipmap: {path} ({size}x{size})")

    # Android adaptive icon: transparent-only foreground for API 26+
    drawable_d = os.path.join(ANDROID_RES, "drawable")
    os.makedirs(drawable_d, exist_ok=True)
    fg_path = os.path.join(drawable_d, "ic_launcher_foreground.png")
    make_adaptive_foreground(512).save(fg_path, "PNG")
    print(f"✓ Adaptive foreground: {fg_path} (512x512)")

if __name__ == "__main__":
    main()
