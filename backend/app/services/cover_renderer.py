"""
Cover image renderer — composites dynamic text onto blank background PNGs
using Pillow. Coordinates are specified in 400×600 design space and multiplied
by SCALE=2 for the 800×1200 blank templates.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from PIL import Image, ImageFont
from PIL.ImageDraw import Draw as ImageDraw

logger = logging.getLogger(__name__)

_ASSETS = Path(__file__).parent.parent / "assets" / "cover_templates"
_FONTS_DIR = Path(__file__).parent.parent / "assets" / "fonts"
_MANIFEST_PATH = _ASSETS / "manifest.json"
_SCALE = 2

FONT_MAP: dict[str, dict[str, str]] = {
    "heading": {
        "700": "PlayfairDisplay-Bold.ttf",
        "400": "PlayfairDisplay-Regular.ttf",
        "italic400": "PlayfairDisplay-Italic.ttf",
    },
    "body": {
        "400": "SourceSerif4-Regular.ttf",
    },
    "caption": {
        "600": "Inter-SemiBold.ttf",
        "500": "Inter-Medium.ttf",
        "400": "Inter-Regular.ttf",
        "700": "Inter-Bold.ttf",
    },
}


def _load_manifest() -> dict:
    with open(_MANIFEST_PATH, encoding="utf-8") as f:
        return json.load(f)


def _load_font(family_key: str, weight: str, size: int) -> ImageFont.FreeTypeFont:
    """Load a TTF at the given size (already scaled)."""
    weight_map = FONT_MAP.get(family_key, {})
    filename = weight_map.get(weight) or weight_map.get("400", list(weight_map.values())[0])
    path = _FONTS_DIR / filename
    return ImageFont.truetype(str(path), size)


def _text_max_width(draw: ImageDraw, text: str, font: ImageFont.FreeTypeFont) -> int:
    """Return pixel width of text using the given font."""
    bbox = draw.textbbox((0, 0), text, font=font)
    return bbox[2] - bbox[0]


def _word_wrap(draw: ImageDraw, text: str, font: ImageFont.FreeTypeFont, max_width: int) -> list[str]:
    """Wrap text to fit max_width, returning lines."""
    words = text.split()
    if not words:
        return [""]
    lines: list[str] = []
    current = words[0]
    for word in words[1:]:
        candidate = current + " " + word
        if _text_max_width(draw, candidate, font) <= max_width:
            current = candidate
        else:
            lines.append(current)
            current = word
    lines.append(current)
    return lines


def _draw_text(
    draw: ImageDraw,
    text: str,
    x: float,
    y: float,
    font: ImageFont.FreeTypeFont,
    color: str,
    align: str = "left",
) -> None:
    """Draw a single line of text at (x, y) with alignment."""
    if align == "center":
        tw = _text_max_width(draw, text, font)
        x = x - tw // 2
    elif align == "right":
        tw = _text_max_width(draw, text, font)
        x = x - tw
    draw.text((x, y), text, font=font, fill=color)


def _shrink_to_fit(
    draw: ImageDraw,
    text: str,
    font_fn: callable,
    max_width: int,
    max_height: int,
    start_size: int,
    min_size: int = 10,
    line_height: float = 1.0,
) -> tuple[ImageFont.FreeTypeFont, list[str]]:
    """Reduce font size until text (possibly wrapped) fits in the box."""
    size = start_size
    while size >= min_size:
        font = font_fn(size)
        lines = _word_wrap(draw, text, font, max_width)
        total_h = int(len(lines) * size * line_height)
        if total_h <= max_height:
            all_fit = all(_text_max_width(draw, line, font) <= max_width for line in lines)
            if all_fit:
                return font, lines
        size -= 2
    font = font_fn(min_size)
    return font, [text]


def _render_field(
    draw: ImageDraw,
    field_name: str,
    value: str,
    field_def: dict[str, Any],
    manifest_theme: dict,
) -> None:
    """Render a single text field onto the draw context."""
    if not value:
        return

    x = field_def.get("x", 0) * _SCALE
    y = field_def.get("y", 0) * _SCALE
    max_width = field_def.get("maxWidth", 0) * _SCALE
    max_height = field_def.get("maxHeight", 0) * _SCALE
    font_size = field_def.get("fontSize", 16) * _SCALE
    line_height = field_def.get("lineHeight", 1.0)
    color = field_def.get("color", "#000000")
    align = field_def.get("align", "left")
    is_italic = field_def.get("italic", False)
    shrink = field_def.get("shrinkToFit", False)
    weight = field_def.get("weight", "400")
    font_family = field_def.get("font", "body")

    weight_key = f"italic{weight}" if is_italic else weight

    def font_fn(sz: int) -> ImageFont.FreeTypeFont:
        return _load_font(font_family, weight_key, sz)

    font = font_fn(font_size)

    # Alignment anchor: for boxed text (maxWidth>0), center/right are relative
    # to the box, so derive the anchor from the box edges. Without a box, x is
    # already the anchor point (e.g. a pre-centered x like the badge label).
    if max_width > 0 and align == "center":
        anchor_x = x + max_width / 2
    elif max_width > 0 and align == "right":
        anchor_x = x + max_width
    else:
        anchor_x = x

    if shrink and max_width > 0 and max_height > 0:
        font, lines = _shrink_to_fit(
            draw, value, font_fn, max_width, max_height, font_size, line_height=line_height,
        )
        line_h = int(font.size * line_height)
        current_y = y
        for line in lines:
            if current_y + line_h > y + max_height:
                break
            _draw_text(draw, line, anchor_x, current_y, font, color, align)
            current_y += line_h
    elif max_width > 0:
        lines = _word_wrap(draw, value, font, max_width)
        line_h = int(font.size * line_height)
        current_y = y
        for line in lines:
            if current_y + line_h > y + (max_height or 9999):
                break
            _draw_text(draw, line, anchor_x, current_y, font, color, align)
            current_y += line_h
    else:
        _draw_text(draw, value, anchor_x, y, font, color, align)


def render_cover(template_key: str, fields: dict[str, str], out_path: str) -> str:
    """Render a cover PNG for *template_key* (github|youtube|url|file) with
    the given *fields* dictionary onto the corresponding blank background.

    Coordinates are read from the manifest (400×600 design space) and multiplied
    by SCALE=2 before drawing.

    Returns *out_path* on success.
    """
    manifest = _load_manifest()
    tmpl = manifest.get("templates", {}).get(template_key)
    if not tmpl:
        raise ValueError(f"Unknown template key: {template_key}")

    theme = manifest.get("theme", {})
    bg_path = _ASSETS / tmpl["background"]

    img = Image.open(bg_path).convert("RGBA")
    draw = ImageDraw(img)

    tmpl_fields = tmpl.get("fields", {})
    for field_name, field_def in tmpl_fields.items():
        value = fields.get(field_name, "")
        _render_field(draw, field_name, value, field_def, theme)

    out = Path(out_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    img.save(out, "PNG")
    logger.info("Cover rendered: %s", out)
    return out_path
