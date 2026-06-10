import hashlib
import json
import os
import time
from typing import Optional

CACHE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "svg_cache")


def _mermaid_code_hash(code: str) -> str:
    return hashlib.sha256(code.encode()).hexdigest()[:16]


def _load_svg_cache(code_hash: str) -> Optional[str]:
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


def render_mermaid_batch(mermaid_codes: list[str]) -> dict[str, str]:
    from playwright.sync_api import sync_playwright

    result: dict[str, str] = {}
    uncached: list[tuple[str, str]] = []

    for code in mermaid_codes:
        if not code or not code.strip():
            continue
        h = _mermaid_code_hash(code)
        cached = _load_svg_cache(h)
        if cached:
            result[h] = cached
        else:
            uncached.append((h, code))

    if not uncached:
        return result

    mermaid_js_path = os.path.join(
        os.path.dirname(os.path.abspath(__file__)),
        "html_template", "assets", "mermaid.min.js",
    )
    with open(mermaid_js_path, encoding="utf-8") as f:
        mermaid_js = f.read()

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()

        page.set_content(f"""<!DOCTYPE html><html><body>
<script>{mermaid_js}</script>
<script>
mermaid.initialize({{ startOnLoad: false, theme: 'neutral', securityLevel: 'loose' }});
</script>
<div id="target"></div>
</body></html>""")

        for h, code in uncached:
            try:
                escaped = json.dumps(code)
                svg = page.evaluate(f"""
                    (async () => {{
                        const el = document.getElementById('target');
                        el.innerHTML = '';
                        const result = await mermaid.render('mermaid-svg', {escaped});
                        return result.svg;
                    }})()
                """)
                result[h] = svg
                _save_svg_cache(h, svg)
            except Exception as e:
                result[h] = f'<span style="color:#ef4444;font-size:12px;">Mermaid error: {e}</span>'

        browser.close()

    return result


def pre_render_iterations(iterations: list[dict]) -> dict[str, str]:
    codes: list[str] = []
    for it in iterations:
        for key in ("old_arch_diagram", "new_arch_diagram", "sequence_diagram"):
            code = it.get(key)
            if code and code.strip():
                codes.append(code)

    if not codes:
        return {}

    print(f"  Pre-rendering {len(codes)} Mermaid diagrams...")
    t0 = time.time()
    result = render_mermaid_batch(codes)
    elapsed = time.time() - t0
    print(f"  ✓ Rendered {len(result)} diagrams in {elapsed:.1f}s "
          f"(cache hits: {len(codes) - len([c for c in codes if _mermaid_code_hash(c) not in result])})")
    return result
