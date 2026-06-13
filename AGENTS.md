# AGENTS.md — GitHub Tech Reader

Local-only GitHub repo iteration & tech evolution analyzer with FastAPI web server. Three auto-detected modes: evolution diff analysis, commit-chunk analysis, and deep structural analysis (4-chapter codebase books). Outputs offline HTML reports.

## Quick commands

```bash
# Install
pip install -r requirements.txt

# Start web server
uvicorn app.main:app --reload

# Generate report via CLI (DeepSeek is default, needs DEEPSEEK_API_KEY in .env)
python main.py https://github.com/user/repo

# Skip LLM (mock data, fast testing)
python main.py https://github.com/user/repo --no-llm

# Skip git fetch on cached repos (offline / flaky GitHub)
python main.py https://github.com/user/repo --no-fetch

# Limit iterations (useful for quick tests)
python main.py https://github.com/user/repo --limit 10

# Run tests
python -m pytest tests/ -v

# Generate Chinese product book from repo
python main.py https://github.com/user/repo --book --no-llm
```

## Architecture

```
main.py          → CLI orchestrator, 3-mode auto-detection (tags→evolution, commits→chunking, ≤1→structural)
app/             → FastAPI web server (models, job_store, routes, services, templates)
git_utils.py     → Bare repo clone/fetch, tag extraction, commit chunking, module discovery with dominance drill
diff_preprocessor.py → Diff noise filtering, dep change extraction, chunking
llm_parser.py    → 7 LLM prompts: summary/arch/sequence/charts (evolution) + module/module-deep/overview/synthesis (structural)
svg_renderer.py  → Mermaid→SVG batch rendering via official @mermaid-js/mermaid-cli (subprocess, disk cache)
html_generator.py → Jinja2 → paginated HTML with inlined ECharts + pre-rendered SVGs (base.html + structural.html)
book_analyzer.py → Product-driven book artifact generator (12-chapter Chinese technical books)
manifest.py      → Change manifest schema, file classification, scoring
```

## Three Analysis Modes (Auto-Detected)

### 1. Evolution Mode (tags exist)
- Classic tag-to-tag diff analysis
- 4 parallel LLM sections per iteration: summary, architecture, sequence, charts
- `extract_iterations()` discovers tags, groups commits between tags
- Patch version merging: adjacent patches with <10 commits merged

### 2. Commit-Chunk Mode (no tags, ≥2 commits)
- `extract_commit_chunks()` groups commits into ~30 chunks via `git log --reverse`
- Chunk size = `max(5, total_commits // 30)` — ≤5 commits → 1 commit per chunk
- Each chunk treated as a pseudo-version with the same LLM analysis as evolution
- Auto-detected when `extract_iterations()` returns empty

### 3. Structural Mode (≤1 commit)
- `discover_modules()` groups files by directory with dominance-based recursive drill
- Dominance threshold 90%: while a single child dir holds >90% of files, descend
- Preserves original git paths through the drill via `(display, git_path)` tuples
- 3-phase LLM pipeline:
  1. **Overview** (`CODEBASE_OVERVIEW_PROMPT`): project positioning, tech stack rationale, core flow, module map
  2. **Deep Module** (`MODULE_DEEP_PROMPT`): 4-step analysis (positioning → implementation → design decisions → constraints) per module, parallel with 3 workers
  3. **Synthesis** (`CODEBASE_SYNTHESIS_PROMPT`): design principles, decision checklists, best practices, replication guide
- Output: 4-chapter HTML book (`structural.html` template)
- Structural reports always single-page (no pagination)

## Key design decisions

- **Default LLM provider is DeepSeek**, not OpenAI. Set via `GTR_LLM_PROVIDER` env or `--provider`. See `.env.example`.
- **LLM results cached** at `cache_json/` keyed by MD5 of `repo_url|mode|identifiers`. Deep analysis uses `deep|module_name|file_count|total_lines` keys; shallow uses `shallow|...`. Old structural keys won't interfere.
- **Bare repos cached** at `repo_cache/{owner}_{name}.git`. Clone uses `--filter=blob:none` for shallow clones.
- **Patch version merging**: adjacent patch versions with <10 commits are merged by default. Use `--no-merge-patch` to disable.
- **Pagination**: 20 iterations per page (`ITEMS_PER_PAGE` in `html_generator.py`). Single-page reports skip pagination. Structural mode always single-page.
- **SVG pre-rendering**: Mermaid diagrams rendered at build time via official `@mermaid-js/mermaid-cli` (MIT, runs `mmdc` via `npx` subprocess). Disk cache at `svg_cache/` keyed by SHA256 of mermaid code. Structural mode recursively walks overview/synthesis dicts for diagrams. Requires Node.js ≥18.19 on the system.
- **Offline reports**: No CDN dependencies. ECharts JS inlined. System font stack. Mermaid rendered to inline SVGs.
- **Report output**: `report_output/{owner}_{repo}_{timestamp}/` with `meta.json`, `index.html`, `page_001.html`…`page_00N.html`.
- **Library index**: `report_output/library.html` auto-regenerated after each report generation. Lists all reports with metadata.
- **Module source feeding**: `discover_modules()` extracts first 300 lines of 8 key files per module (content, not just imports). This gives LLM real code to analyze for deep mode.

## LLM Prompts (llm_parser.py)

| Prompt | Used By | Tokens | Purpose |
|--------|---------|--------|---------|
| `SUMMARY_PROMPT` | Evolution | 4096 | Title, change type, summary, tags, changes list |
| `ARCH_PROMPT` | Evolution | 24576 | Old/new architecture diagram comparison |
| `SEQ_PROMPT` | Evolution | 24576 | Sequence diagram for key workflows |
| `CHARTS_PROMPT` | Evolution | 8192 | Performance ECharts data |
| `MODULE_PROMPT` | Structural (shallow) | 4096 | Simple purpose + architecture + dependencies |
| `MODULE_DEEP_PROMPT` | Structural (deep) | 8192 | 4-step analysis: positioning, implementation, design decisions, rules/constraints |
| `CODEBASE_OVERVIEW_PROMPT` | Structural Phase 1 | 16384 | Project overview, tech stack rationale, core flow, module architecture |
| `CODEBASE_SYNTHESIS_PROMPT` | Structural Phase 3 | 12288 | Design principles, decision checklists, best practices, replication guide |

## Gotchas

- **LLM-generated mermaid can have invalid syntax** (unbalanced brackets, trailing operators, `subgraph` on same line as `graph TD`). `_sanitize_mermaid()` in `llm_parser.py` fixes these — it inserts newlines before `subgraph`/`direction` keywords after `graph`/`flowchart` declarations and between consecutive `end subgraph` pairs. Parse errors in reports are LLM output issues, not rendering bugs.
- **`--no-fetch`** skips `git fetch` on existing cached repos. Use when GitHub is flaky or offline.
- **Tests use pytest** with standard assertions. No special test runner or fixtures required.
- **Module discovery dominance drill**: original `f.split("/", 1)` caused infinite loop on re-split of the same group name. Fixed by stripping prefix first: `f[len(largest_name) + 1:].split("/", 1)`. Groups now store `(display_path, git_path)` tuples to preserve original paths for `git show`.
- **`get_default_branch` missing blocks**: `elif`, `except`, and `common` fallback blocks were lost during chained edits. Must check these are present when modifying git_utils.py.
- **Structural cache keys**: deep mode uses `deep|module_name|...`; shallow uses `shallow|...`. Old `structural|...` cache entries are stale and should be cleared when switching between deep/shallow.
- **Mock fallback for deep mode**: mock data includes all deep fields (`implementation`, `design_decisions`, `rules_and_constraints`, `highlights`, `weaknesses`) — `--no-llm` produces structurally complete but content-sparse reports.
- **`report_path` vs `report_url`**: the job store holds absolute filesystem paths. API endpoints must compute web URLs via `os.path.relpath(path, OUTPUT_DIR)`. Templates should use `report_url` from the API, never split `report_path` — the filename is not the directory.
- **`app/jobs.db`**: SQLite file auto-created on first access via lazy `_ensure_init()`. Do not commit it. If deleted while server is running, the next request will recreate it.
- **Mermaid CLI**: requires Node.js ≥18.19. First run downloads Chromium via `npx` — expect a few seconds of cold-start latency per batch.

## What NOT to do

- Don't add CDN dependencies to HTML templates — reports must work offline.
- Don't change `ITEMS_PER_PAGE` without testing with 100+ iteration repos.
- Don't commit `svg_cache/`, `repo_cache/`, `report_output/`, `cache_json/`, or `app/jobs.db` — all gitignored.
- Don't remove the `(display, git_path)` tuple pattern in `discover_modules()` — original paths are needed for `git show`.
- Don't change cache key format without considering stale cache cleanup — deep/shallow keys coexist.
