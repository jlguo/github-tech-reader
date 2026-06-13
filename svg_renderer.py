import hashlib
import logging
import os
import subprocess
import tempfile
import time

logger = logging.getLogger(__name__)

CACHE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "svg_cache")


def _mermaid_code_hash(code: str) -> str:
    return hashlib.sha256(code.encode()).hexdigest()[:16]


def _load_svg_cache(code_hash: str) -> str | None:
    path = os.path.join(CACHE_DIR, f"{code_hash}.svg")
    if os.path.isfile(path):
        with open(path, encoding="utf-8") as f:
            return f.read()
    return None


def _save_svg_cache(code_hash: str, svg: str) -> None:
    os.makedirs(CACHE_DIR, exist_ok=True)
    path = os.path.join(CACHE_DIR, f"{code_hash}.svg")
    with open(path, "w", encoding="utf-8") as f:
        f.write(svg)


def _render_one(code: str, code_hash: str) -> str | None:
    """Render a single Mermaid diagram via the official mermaid-cli.

    Writes the diagram to a temp ``.mmd`` file, runs ``mmdc`` via
    ``npx``, reads the resulting SVG, and returns it.  Returns
    ``None`` if rendering fails.
    """
    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".mmd", encoding="utf-8", delete=False,
    ) as tmp_in:
        tmp_in.write(code)
        input_path = tmp_in.name

    output_path = input_path + ".svg"

    try:
        subprocess.run(
            [
                "npx", "-p", "@mermaid-js/mermaid-cli", "mmdc",
                "-i", input_path,
                "-o", output_path,
                "--quiet",
                "--theme", "neutral",
                "--backgroundColor", "transparent",
            ],
            check=True, capture_output=True, text=True,
            timeout=60,
        )
        with open(output_path, encoding="utf-8") as f:
            svg = f.read()
        return svg
    except subprocess.CalledProcessError as exc:
        stderr = (exc.stderr or "").strip()
        logger.warning("mmdc failed for %s: %s", code_hash, stderr[:200])
        return None
    except subprocess.TimeoutExpired:
        logger.warning("mmdc timed out for %s", code_hash)
        return None
    finally:
        for p in (input_path, output_path):
            try:
                os.unlink(p)
            except OSError:
                pass


def render_mermaid_batch(mermaid_codes: list[str]) -> dict[str, str]:
    """Render a batch of Mermaid diagrams to SVG via the official mermaid-cli.

    Cached SVGs are returned immediately.  Uncached diagrams are
    rendered sequentially (mmdc bundles its own Puppeteer browser).

    Args:
        mermaid_codes: List of raw Mermaid diagram strings.

    Returns:
        Dict mapping SHA256 code-hashes to SVG strings (or inline
        error spans for failed renders).
    """
    from llm_parser import _sanitize_mermaid

    result: dict[str, str] = {}
    uncached: list[tuple[str, str]] = []

    for code in mermaid_codes:
        if not code or not code.strip():
            continue
        sanitized = _sanitize_mermaid(code)
        if not sanitized:
            continue
        h = _mermaid_code_hash(sanitized)
        cached = _load_svg_cache(h)
        if cached:
            result[h] = cached
        else:
            uncached.append((h, sanitized))

    if not uncached:
        return result

    for h, code in uncached:
        svg = _render_one(code, h)
        if svg:
            result[h] = svg
            _save_svg_cache(h, svg)
        else:
            result[h] = (
                '<span style="color:#ef4444;font-size:12px;">'
                "Mermaid render failed</span>"
            )

    return result


def pre_render_iterations(iterations: list[dict]) -> dict[str, str]:
    from llm_parser import _sanitize_mermaid
    codes: list[str] = []
    for it in iterations:
        for key in ("old_arch_diagram", "new_arch_diagram", "sequence_diagram"):
            code = it.get(key)
            if code and code.strip():
                sanitized = _sanitize_mermaid(code)
                if sanitized:
                    it[key] = sanitized
                    codes.append(sanitized)

    if not codes:
        return {}

    logger.info("  Pre-rendering %d Mermaid diagrams...", len(codes))
    t0 = time.time()
    result = render_mermaid_batch(codes)
    elapsed = time.time() - t0
    cache_hits = len(codes) - len([c for c in codes if _mermaid_code_hash(c) not in result])
    logger.info("  ✓ Rendered %d diagrams in %.1fs (cache hits: %d)",
                len(result), elapsed, cache_hits)
    return result
