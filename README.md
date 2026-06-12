# GitHub Tech Reader

Local-only GitHub repository analysis toolkit with FastAPI web server. Three analysis modes auto-detected by repo characteristics: evolution diff analysis (tagged repos), commit-chunk analysis (no tags, multiple commits), and deep structural analysis (single commit / large codebase dumps). Outputs offline static HTML reports with Mermaid diagrams.

## Quick Start

```bash
# Install
pip install -r requirements.txt

# Start web server (browser-based UI)
uvicorn app.main:app --reload
# Open http://localhost:8000

# Generate a report via CLI (DeepSeek is default, set DEEPSEEK_API_KEY in .env)
python main.py https://github.com/user/repo

# Skip LLM (mock data, fast testing)
python main.py https://github.com/user/repo --no-llm

# Skip git fetch on cached repos
python main.py https://github.com/user/repo --no-fetch

# Change provider
python main.py https://github.com/user/repo --provider openai --model gpt-4o

# Run tests
python -m pytest tests/ -v
```

### Web Server API

```
POST /api/analyze      → Submit repo URL, returns job_id
GET  /api/analyze/{id}  → Poll job status (pending/running/done/error)
GET  /api/jobs          → List recent jobs
GET  /reports/          → Browse generated reports
```

## Three Analysis Modes (Auto-Detected)

| Mode | Trigger | What It Does | Output |
|------|---------|--------------|--------|
| **Evolution** | Repo has tags | Tag-to-tag diff analysis, 4-section LLM per iteration | Timeline report with architecture diffs |
| **Commit-Chunk** | No tags, ≥2 commits | Groups commits into ~30 chunks, one iteration per chunk | Same as evolution (chunk = pseudo-version) |
| **Structural** | ≤1 commit | Module discovery + 3-phase deep LLM analysis | 4-chapter codebase book |

### Structural Mode (3-Phase Deep Analysis)

For repos with no version history (large codebase dumps, leaked source, single-commit archives):

```
Phase 1: Codebase Overview — project positioning, tech stack rationale, core execution flow,
         module architecture map
Phase 2: Deep Module Analysis — 4-step per module (positioning → implementation details →
         design decisions → rules/constraints), 36+ modules in parallel
Phase 3: Methodology Synthesis — design principles, decision checklists, best practices,
         replication guide
```

Output: 4-chapter HTML book with tech stack tables, architecture diagrams, design decision cards,
engineering highlights, and reusable methodology patterns.

## How It Works

```
GitHub URL → bare clone → auto-detect mode → extract data → LLM analysis → HTML report
```

| Step | Module | What It Does |
|------|--------|--------------|
| 1 | `git_utils.py` | Clone bare repo, extract tags/commits/diffs, discover modules, extract source content |
| 2 | `diff_preprocessor.py` | Filter noise (comments, lock files), extract dep changes, chunk for LLM |
| 3 | `llm_parser.py` | Send data to LLM (DeepSeek/OpenAI/Ollama), get structured JSON with architecture diagrams, design decisions, performance metrics |
| 4 | `svg_renderer.py` | Playwright-based Mermaid→SVG batch rendering with disk cache |
| 5 | `html_generator.py` | Render Jinja2 template → offline HTML with inlined ECharts + pre-rendered SVGs |

## Report Features

**Evolution / Commit-Chunk reports:**
- Timeline — horizontal version timeline, click to jump to iteration
- Architecture comparison — left/right UML diagrams (Mermaid)
- Sequence diagrams — workflow timing (Mermaid)
- Performance charts — bar/line charts (ECharts)
- Change lists — categorized breaking changes, features, dependency updates

**Structural reports (4-chapter books):**
- Chapter 1 — Project overview, tech stack rationale, core execution flow
- Chapter 2 — Module architecture map, subsystem grid, dependency diagram
- Chapter 3 — Per-module deep analysis: architecture, implementation, design decisions, rules, highlights, weaknesses
- Chapter 4 — Methodology synthesis: design principles, decision checklists, best practices, replication guide

## Directory Structure

```
.
├── main.py                  # CLI entry point, 3-mode auto-detection
├── git_utils.py             # Bare repo Git ops, module discovery, commit chunking
├── diff_preprocessor.py     # Diff cleaning & chunking
├── llm_parser.py            # LLM integration: 7 prompts (summary/arch/seq/charts/module/module-deep/overview/synthesis)
├── svg_renderer.py          # Playwright Chromium Mermaid→SVG renderer
├── html_generator.py        # Jinja2 → HTML rendering (evolution + structural templates)
├── manifest.py              # Change manifest schema, file classification
├── html_template/
│   ├── base.html            # Evolution/commit-chunk template
│   └── structural.html      # 4-chapter structural analysis template
├── repo_cache/              # Cloned bare repos (gitignored)
├── report_output/           # Generated HTML reports (gitignored)
├── svg_cache/               # Pre-rendered SVG cache (gitignored)
└── cache_json/              # LLM response cache (gitignored)
```

## CLI Options

```
python main.py <repo_url> [options]

--no-llm          Skip LLM, use mock data (fast, for testing)
--no-fetch        Skip git fetch on cached repos (offline)
--no-cache        Skip LLM response cache, force re-analysis
--no-merge-patch  Don't merge adjacent patch versions
--provider        deepseek | openai | ollama (default: deepseek)
--model           Model name override
--api-key         API key override
--base-url        Custom API base URL override
--output          Custom output file path
--cache-dir       Bare repo cache directory (default: repo_cache/)
--limit           Max iterations to process
--workers         Number of parallel LLM workers (default: 3)
--max-diff-chars  Max diff characters sent to LLM (default: 16000)
```

## Key Design Decisions

- **Default LLM is DeepSeek** — cost-effective for large-scale analysis. Set `DEEPSEEK_API_KEY` in `.env`.
- **Auto-detection of 3 modes** — no manual flags: tags → evolution, no tags + commits → chunking, ≤1 commit → structural
- **LLM results cached** at `cache_json/` keyed by MD5 of `repo_url|mode|identifiers`. Deep/shallow analysis use separate cache keys.
- **Bare repos cached** at `repo_cache/{owner}_{name}.git`. Clone uses `--filter=blob:none`.
- **Offline reports** — no CDN dependencies. ECharts JS inlined. System font stack. Mermaid → inline SVGs.
- **Report output** — `report_output/{owner}_{repo}_{timestamp}/` with index.html and meta.json.
