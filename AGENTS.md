# AGENTS.md — GitHub Tech Reader

Local-only GitHub repo iteration & tech evolution analyzer. Clones bare repos, extracts version diffs, runs LLM analysis, outputs paginated offline HTML reports.

## Quick commands

```bash
# Install
pip install -r requirements.txt

# Generate (DeepSeek is default, needs DEEPSEEK_API_KEY in .env)
python main.py https://github.com/user/repo

# Skip LLM (mock data, fast testing)
python main.py https://github.com/user/repo --no-llm

# Skip git fetch on cached repos (offline / flaky GitHub)
python main.py https://github.com/user/repo --no-fetch

# Limit iterations (useful for quick tests)
python main.py https://github.com/user/repo --limit 10

# Run tests
python -m pytest tests/ -v
```

## Architecture

```
main.py          → CLI orchestrator (argparse, parallel LLM workers, caching)
git_utils.py     → Bare repo clone/fetch, tag extraction, commit diffing
diff_preprocessor.py → Diff noise filtering, dep change extraction, chunking
llm_parser.py    → Section-based parallel LLM analysis (summary, architecture, sequence, performance)
svg_renderer.py  → Playwright-based Mermaid→SVG batch rendering with disk cache
html_generator.py → Jinja2 → paginated HTML with inlined ECharts + pre-rendered SVGs
manifest.py      → Change manifest schema, file classification, scoring
```

## Key design decisions

- **Default LLM provider is DeepSeek**, not OpenAI. Set via `GTR_LLM_PROVIDER` env or `--provider`. See `.env.example`.
- **LLM results cached** at `cache_json/` keyed by MD5 of `repo_url|version|diff_hash[:16]`. Use `--no-cache` to force re-analysis.
- **Bare repos cached** at `repo_cache/{owner}_{name}.git`. Clone uses `--filter=blob:none` for shallow clones.
- **Patch version merging**: adjacent patch versions with <10 commits are merged by default. Use `--no-merge-patch` to disable.
- **Pagination**: 20 iterations per page (`ITEMS_PER_PAGE` in `html_generator.py`). Single-page reports skip pagination.
- **SVG pre-rendering**: Mermaid diagrams rendered at build time via Playwright (Chromium). Disk cache at `svg_cache/` keyed by SHA256 of mermaid code. Cache is gitignored.
- **Offline reports**: No CDN dependencies. ECharts JS inlined. System font stack. Mermaid rendered to inline SVGs.
- **Report output**: `report_output/{owner}_{repo}_{timestamp}/` with `meta.json`, `index.html`, `page_001.html`…`page_00N.html`.
- **Library index**: `report_output/library.html` auto-regenerated after each report generation. Lists all reports with metadata.

## Gotchas

- **`const { svg } = await mermaid.render(...)` fails in Playwright evaluate** — `{ svg }` is parsed as a block, not destructuring. Always use `result.svg` instead.
- **LLM-generated mermaid can have invalid syntax** (unbalanced brackets, trailing operators). `_sanitize_mermaid()` in `llm_parser.py` filters these out — parse errors in reports are LLM output issues, not rendering bugs.
- **Firefox crashes in headless server environments** — only Chromium works for SVG rendering.
- **`--no-fetch`** skips `git fetch` on existing cached repos. Use when GitHub is flaky or offline.
- **Tests use pytest** with standard assertions. No special test runner or fixtures required.

## What NOT to do

- Don't add CDN dependencies to HTML templates — reports must work offline.
- Don't change `ITEMS_PER_PAGE` without testing with 100+ iteration repos.
- Don't commit `svg_cache/`, `repo_cache/`, `report_output/`, or `cache_json/` — all gitignored.
- Don't use Firefox/WebKit for Playwright rendering — only Chromium works reliably.
