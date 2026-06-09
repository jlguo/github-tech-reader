# GitHub Tech Reader

Local-only GitHub repository iteration & tech evolution analyzer. Clones bare repos, extracts version diffs, runs LLM analysis, and outputs standalone static HTML reports.

## Quick Start

```bash
# Install
pip install -r requirements.txt

# Generate a report (mock mode, no LLM needed)
python main.py https://github.com/user/repo --no-llm

# With LLM analysis
export OPENAI_API_KEY=sk-...
python main.py https://github.com/user/repo

# With local Ollama
python main.py https://github.com/user/repo --provider ollama --model qwen2.5:7b
```

## How It Works

```
GitHub URL → bare clone → extract tags/commits/diffs → LLM analysis → HTML report
```

| Step | Module | What It Does |
|------|--------|--------------|
| 1 | `git_utils.py` | Clone bare repo, extract tags, commits, diffs between versions |
| 2 | `diff_preprocessor.py` | Filter noise (comments, lock files), extract dep changes, chunk for LLM |
| 3 | `llm_parser.py` | Send diffs to LLM (OpenAI/Ollama), get structured JSON with architecture diagrams, performance metrics, change lists |
| 4 | `html_generator.py` | Render Jinja2 template → standalone HTML with Mermaid diagrams + ECharts charts |

## Report Features

- **Timeline** — horizontal version timeline, click to jump to iteration
- **Architecture comparison** — left/right UML diagrams (Mermaid)
- **Sequence diagrams** — workflow timing (Mermaid)
- **Performance charts** — bar/line charts (ECharts)
- **Change lists** — categorized breaking changes, features, dependency updates
- **Collapsible cards** — expand/collapse per iteration

## Directory Structure

```
.
├── main.py                 # CLI entry point
├── git_utils.py            # Bare repo Git operations
├── diff_preprocessor.py    # Diff cleaning & chunking
├── llm_parser.py           # LLM integration (OpenAI + Ollama)
├── html_generator.py       # Jinja2 → HTML rendering
├── requirements.txt
├── html_template/
│   └── base.html           # Jinja2 template (Mermaid + ECharts CDN)
├── repo_cache/             # Cloned bare repos (auto-created)
├── report_output/          # Generated HTML reports (auto-created)
└── cache_json/             # LLM response cache (future)
```

## CLI Options

```
python main.py <repo_url> [options]

--no-llm          Skip LLM, use mock data (fast, for testing)
--provider        openai | ollama (default: openai)
--model           Model name (default: gpt-4o / qwen2.5:7b)
--api-key         API key (default: $OPENAI_API_KEY)
--base-url        Custom API base URL
--output          Custom output file path
--cache-dir       Bare repo cache directory
```
