import json
import os
from datetime import datetime
from typing import Optional

from jinja2 import Environment, FileSystemLoader, select_autoescape

from svg_renderer import pre_render_iterations

TEMPLATE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "html_template")
ASSETS_DIR = os.path.join(TEMPLATE_DIR, "assets")
OUTPUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "report_output")

ITEMS_PER_PAGE = 20


class HTMLGenerator:

    def __init__(self, template_dir: Optional[str] = None, output_dir: Optional[str] = None):
        self.template_dir = template_dir or TEMPLATE_DIR
        self.output_dir = output_dir or OUTPUT_DIR
        self._env = Environment(
            loader=FileSystemLoader(self.template_dir),
            autoescape=select_autoescape(["html"]),
        )

    def generate(self, data: dict, output_path: Optional[str] = None,
                 existing_dir: Optional[str] = None) -> str:
        iterations = data.get("iterations", [])
        total = len(iterations)

        if total <= ITEMS_PER_PAGE:
            return self._generate_single(data, output_path, existing_dir)

        return self._generate_paginated(data, iterations, total, output_path, existing_dir)

    def _generate_single(self, data: dict, output_path: Optional[str] = None,
                         existing_dir: Optional[str] = None) -> str:
        iterations = data.get("iterations", [])
        svg_map = pre_render_iterations(iterations)
        self._inject_svgs(iterations, svg_map)

        for i, it in enumerate(iterations):
            if "id" not in it:
                it["id"] = it.get("version", f"iter-{i}").replace(".", "-")

        template = self._env.get_template("base.html")
        html = template.render(**data)
        html = self._inline_echarts(html)

        repo_name = data.get("repo", {}).get("name", "report")
        safe_name = repo_name.replace("/", "_").replace(" ", "_")

        if existing_dir:
            output_dir = existing_dir
            self._clear_html_files(output_dir)
        else:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            output_dir = os.path.join(self.output_dir, f"{safe_name}_{timestamp}")
        os.makedirs(output_dir, exist_ok=True)

        filepath = output_path or os.path.join(output_dir, "index.html")
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(html)

        self._save_metadata(output_dir, data, 1)
        self._update_library_index()
        return os.path.abspath(filepath)

    def _generate_paginated(self, data: dict, iterations: list, total: int,
                            output_path: Optional[str] = None,
                            existing_dir: Optional[str] = None) -> str:
        pages = []
        for i in range(0, total, ITEMS_PER_PAGE):
            pages.append(iterations[i:i + ITEMS_PER_PAGE])

        svg_map = pre_render_iterations(iterations)

        repo_name = data.get("repo", {}).get("name", "report")
        safe_name = repo_name.replace("/", "_").replace(" ", "_")

        if existing_dir:
            output_dir = existing_dir
            self._clear_html_files(output_dir)
        elif output_path:
            output_dir = os.path.dirname(output_path)
        else:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            output_dir = os.path.join(self.output_dir, f"{safe_name}_{timestamp}")
        os.makedirs(output_dir, exist_ok=True)

        page_files = []
        for idx, page_iters in enumerate(pages):
            self._inject_svgs(page_iters, svg_map)
            for j, it in enumerate(page_iters):
                if "id" not in it:
                    it["id"] = it.get("version", f"iter-{j}").replace(".", "-")

            first_ver = page_iters[0]["version"]
            last_ver = page_iters[-1]["version"]
            page_label = f"{first_ver} → {last_ver}" if first_ver != last_ver else first_ver

            page_data = dict(data)
            page_data["iterations"] = page_iters
            page_data["page_info"] = f"第 {idx + 1}/{len(pages)} 页"
            page_data["nav_pages"] = True
            page_data["nav_current"] = idx + 1
            page_data["nav_total"] = len(pages)
            page_data["nav_label"] = page_label
            page_data["nav_prev"] = f"page_{idx:03d}.html" if idx > 0 else None
            page_data["nav_next"] = f"page_{idx + 2:03d}.html" if idx + 1 < len(pages) else None

            template = self._env.get_template("base.html")
            html = template.render(**page_data)
            html = self._inline_echarts(html)

            filename = f"page_{idx + 1:03d}.html"
            filepath = os.path.join(output_dir, filename)
            with open(filepath, "w", encoding="utf-8") as f:
                f.write(html)
            page_files.append((filename, page_label, first_ver, last_ver))

        self._generate_index(data, page_files, output_dir)
        self._save_metadata(output_dir, data, len(pages))
        self._update_library_index()
        return os.path.abspath(os.path.join(output_dir, "page_001.html"))

    def _generate_index(self, data: dict, page_files: list,
                        output_dir: str) -> None:
        index_template = self._env.get_template("index.html")
        html = index_template.render(
            repo=data.get("repo", {}),
            analysis_time=data.get("analysis_time", ""),
            pages=[{
                "filename": fn,
                "label": label,
                "first": first,
                "last": last,
            } for fn, label, first, last in page_files],
        )
        filepath = os.path.join(output_dir, "index.html")
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(html)

    def _save_metadata(self, output_dir: str, data: dict, pages: int) -> None:
        meta = {
            "repo": data.get("repo", {}).get("name", ""),
            "iterations": len(data.get("iterations", [])),
            "pages": pages,
            "generated": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        }
        with open(os.path.join(output_dir, "meta.json"), "w") as f:
            json.dump(meta, f, ensure_ascii=False)

    def _update_library_index(self) -> None:
        reports = []
        seen_repos = set()
        if os.path.isdir(self.output_dir):
            for entry in sorted(os.listdir(self.output_dir), reverse=True):
                entry_path = os.path.join(self.output_dir, entry)
                if not os.path.isdir(entry_path):
                    continue
                index_path = os.path.join(entry_path, "index.html")
                if not os.path.isfile(index_path):
                    continue
                meta_path = os.path.join(entry_path, "meta.json")
                meta = {}
                if os.path.isfile(meta_path):
                    with open(meta_path) as f:
                        meta = json.load(f)
                repo_name = meta.get("repo", entry)
                if repo_name in seen_repos:
                    continue
                seen_repos.add(repo_name)
                iterations = meta.get("iterations", 0) or 0
                pages = meta.get("pages", 1) or 1
                # Book dimensions proportional to project size
                book_height = min(130 + iterations * 4, 220)
                book_width = min(50 + pages * 6, 100)
                # Strip owner prefix for spine display
                spine_label = repo_name.split("/", 1)[-1]
                # Font size: book height is visual text width after rotation
                label_fs = min(14, max(8, int(book_height / max(len(spine_label), 1))))
                # Deterministic color from repo name
                palette = ["#4a6fa5","#5f9e6e","#c17f59","#b05f5f","#8a6fa5",
                           "#6f9e8f","#b87f5f","#9f6f6f","#6f6fa5","#c17f8f"]
                color_idx = sum(ord(c) for c in repo_name) % len(palette)
                tilt_raw = sum(ord(c) for c in repo_name) % 7
                tilt_deg = 0 if tilt_raw < 3 else [-5, 3, -7, 4][tilt_raw - 3]
                reports.append({
                    "repo": repo_name,
                    "path": entry,
                    "pages": pages,
                    "iterations": iterations,
                    "generated": meta.get("generated", ""),
                    "book_height": book_height,
                    "book_width": book_width,
                    "color": palette[color_idx],
                    "spine_label": spine_label,
                    "label_font_size": label_fs,
                    "tilt_deg": tilt_deg,
                })

        template = self._env.get_template("library.html")
        html = template.render(reports=reports)
        filepath = os.path.join(self.output_dir, "library.html")
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(html)

    @staticmethod
    def _clear_html_files(output_dir: str) -> None:
        """Remove index.html and page_*.html from existing report dir before regenerating."""
        import glob
        for pattern in ["index.html", "page_*.html"]:
            for f in glob.glob(os.path.join(output_dir, pattern)):
                os.remove(f)

    def _inject_svgs(self, iterations: list, svg_map: dict) -> None:
        from svg_renderer import _mermaid_code_hash
        for it in iterations:
            for key in ("old_arch_diagram", "new_arch_diagram", "sequence_diagram"):
                code = it.get(key)
                if code and code.strip():
                    h = _mermaid_code_hash(code)
                    svg = svg_map.get(h)
                    if svg:
                        it[key] = svg

    def _inline_echarts(self, html: str) -> str:
        filepath = os.path.join(ASSETS_DIR, "echarts.min.js")
        if os.path.isfile(filepath):
            with open(filepath, encoding="utf-8") as f:
                js_content = f.read()
            html = html.replace("<!-- ECharts JS (inlined at build time) -->",
                                f"<script>{js_content}</script>")
        return html
