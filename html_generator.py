"""
HTML report generator using Jinja2 templating.

Loads the base template, injects analysis data, and writes
a standalone static HTML report with embedded Mermaid and ECharts.
"""

import os
from datetime import datetime
from typing import Optional

from jinja2 import Environment, FileSystemLoader, select_autoescape

TEMPLATE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "html_template")
OUTPUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "report_output")


class HTMLGenerator:
    """Render analysis data into a static HTML report."""

    def __init__(self, template_dir: Optional[str] = None, output_dir: Optional[str] = None):
        self.template_dir = template_dir or TEMPLATE_DIR
        self.output_dir = output_dir or OUTPUT_DIR
        self._env = Environment(
            loader=FileSystemLoader(self.template_dir),
            autoescape=select_autoescape(["html"]),
        )

    def generate(self, data: dict, output_path: Optional[str] = None) -> str:
        """Generate the HTML report and return the file path.

        Args:
            data: Analysis data with repo, analysis_time, and iterations.
            output_path: Optional custom output path.

        Returns:
            Absolute path to the generated HTML file.
        """
        template = self._env.get_template("base.html")

        for i, it in enumerate(data.get("iterations", [])):
            if "id" not in it:
                it["id"] = it.get("version", f"iter-{i}").replace(".", "-")

        html = template.render(**data)

        os.makedirs(self.output_dir, exist_ok=True)

        if output_path:
            filepath = output_path
        else:
            repo_name = data.get("repo", {}).get("name", "report")
            safe_name = repo_name.replace("/", "_").replace(" ", "_")
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"{safe_name}_{timestamp}.html"
            filepath = os.path.join(self.output_dir, filename)

        with open(filepath, "w", encoding="utf-8") as f:
            f.write(html)

        return os.path.abspath(filepath)

    def get_template_variables(self) -> list[str]:
        """Return all template variables for debugging."""
        from jinja2 import meta
        if self._env.loader is None:
            return []
        source_tuple = self._env.loader.get_source(self._env, "base.html")
        if source_tuple is None:
            return []
        template_source = source_tuple[0]
        ast = self._env.parse(template_source)
        return sorted(meta.find_undeclared_variables(ast))
