"""
Extract cover images from EPUB/PDF files. Returns PNG bytes or None.
"""

from __future__ import annotations

import logging
from io import BytesIO

logger = logging.getLogger(__name__)


def extract_cover(file_path: str, file_type: str) -> bytes | None:
    """Extract cover image bytes from *file_path* based on *file_type*.

    Supported types:
      - epub  → EbookLib, look up OPF meta cover / properties="cover-image"
      - pdf   → PyMuPDF (fitz), render page 0 at ~150 DPI

    Returns PNG bytes on success, None on failure. Never raises.
    """
    if file_type == "epub":
        return _extract_epub_cover(file_path)
    elif file_type == "pdf":
        return _extract_pdf_cover(file_path)
    return None


def _extract_epub_cover(file_path: str) -> bytes | None:
    try:
        import ebooklib
        from ebooklib import epub
    except ImportError:
        logger.warning("ebooklib not available, skipping EPUB cover extraction")
        return None

    try:
        book = epub.read_epub(file_path)
    except Exception as exc:
        logger.warning("Failed to read EPUB %s: %s", file_path, exc)
        return None

    cover_id = None
    for item in book.get_metadata("OPF", "meta"):
        if isinstance(item, tuple) and len(item) >= 2:
            attrs = item[1] if isinstance(item[1], dict) else {}
            if attrs.get("name") == "cover":
                cover_id = attrs.get("content")
                break
        elif isinstance(item, dict):
            if item.get("name") == "cover":
                cover_id = item.get("content")
                break

    if cover_id:
        try:
            cover_item = book.get_item_with_id(cover_id)
            if cover_item and cover_item.get_content():
                return _normalize_to_png(cover_item.get_content())
        except Exception as exc:
            logger.debug("EPUB cover by id failed: %s", exc)

    try:
        for item in book.get_items():
            if hasattr(item, "get_name") and "cover" in (item.get_name() or "").lower():
                if item.get_content():
                    return _normalize_to_png(item.get_content())
    except Exception as exc:
        logger.debug("EPUB cover by name failed: %s", exc)

    try:
        for item in book.get_items():
            if item.get_type() == ebooklib.ITEM_COVER:
                if item.get_content():
                    return _normalize_to_png(item.get_content())
    except Exception as exc:
        logger.debug("EPUB cover by ITEM_COVER type failed: %s", exc)

    return None


def _extract_pdf_cover(file_path: str) -> bytes | None:
    try:
        import fitz
    except ImportError:
        logger.warning("PyMuPDF not available, skipping PDF cover extraction")
        return None

    try:
        doc = fitz.open(file_path)
    except Exception as exc:
        logger.warning("Failed to open PDF %s: %s", file_path, exc)
        return None

    if doc.page_count < 1:
        doc.close()
        return None

    try:
        page = doc[0]
        zoom = 2.083
        mat = fitz.Matrix(zoom, zoom)
        pix = page.get_pixmap(matrix=mat)
        return pix.tobytes("png")
    except Exception as exc:
        logger.warning("Failed to render PDF page 0: %s", exc)
        return None
    finally:
        doc.close()


def _normalize_to_png(data: bytes) -> bytes:
    """Convert raw image bytes to PNG bytes via Pillow. Skips re-encode if already PNG."""
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return data
    from PIL import Image
    img = Image.open(BytesIO(data))
    buf = BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()
