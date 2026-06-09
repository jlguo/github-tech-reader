# Tech Selection Summary
## 1. Overall Solution
A **local-only GitHub repo iteration & tech evolution analyzer** built as a **Coding Agent plugin**, outputs standalone static HTML reports (no independent web server, no public deployment, single-user local usage).

## 2. Core Workflow
1. Accept GitHub repository URL input in Coding Agent.
2. Use local Git to clone/update bare repositories for full commit/tag/diff data.
3. Split commits into iterations (by Git tags / auto-grouped commits for untagged repos).
4. Preprocess & filter diff content, feed to LLM for structured analysis.
5. Generate diagrams (architecture, sequence) & performance metrics data via LLM.
6. Inject all analysis results into a pre-built HTML template.
7. Auto-generate static HTML report and open it with local browser.

## 3. Tech Stack Breakdown
### 3.1 Runtime & Plugin Layer (Coding Agent)
- **Language**: Python
- **Git Operation**: Native local Git (via `subprocess`), use `git clone --bare` for bare repos
- **Task Handling**: Native Python threads (lightweight async, no extra message queue)
- **Cache Management**: File-based storage for bare Git repos & raw LLM JSON results (no database)

### 3.2 Data Source
- **Primary**: Local bare Git repository (full commit, tag, diff, history; bypass GitHub API rate limits)
- **Auxiliary**: GitHub REST/GraphQL API (only for supplementary PR/Release docs, minimal requests)

### 3.3 LLM Integration
- **Dual modes**:
  1. Online: Third-party LLM API (GPT-4o / Claude / domestic LLMs)
  2. Fully offline: Local LLM via Ollama (Qwen2 / Llama3)
- **Output format**: Fixed structured JSON + Mermaid code + ECharts metric data (strict prompt constraints to avoid hallucination)

### 3.4 Report & Frontend
- **Deliverable**: Single offline static HTML file
- **Template Design**: UI layout designed via Figma (professional tech-report style, reusable card components)
- **Visualization Libraries (embedded in HTML)**:
  - **Mermaid**: Render architecture diagrams & sequence diagrams
  - **ECharts**: Render performance optimization charts (bar/line charts)
- **Interaction**: Native vanilla JS (card expand/collapse, timeline navigation; no Vue/React framework)
- **Assets**: Use CDN for JS libraries (optional: embed local JS for fully offline HTML)

### 3.5 File & Directory Structure (Local Storage)
```
Plugin Root
├─ repo_cache/       # Local bare Git repositories
├─ report_output/    # Generated HTML reports
├─ cache_json/       # Cached LLM analysis results
└─ html_template/    # Base HTML template & CSS
```

## 4. Key Advantages of This Tech Stack
1. **Zero deployment overhead**: No web service, port occupation or DB maintenance.
2. **GitHub rate-limit free**: Core data from local Git, API only for supplementary info.
3. **Offline friendly**: Bare repos + local LLM + fully offline HTML work without network.
4. **Lightweight & portable**: HTML reports can be shared and opened on any device.
5. **Low development cost**: Simple Python logic + static HTML, no complex full-stack engineering.

## 5. Major Components & Responsibilities
| Component | Responsibility |
| ---- | ---- |
| Git Utility | Clone/update bare repos, extract tags, commits & version diffs |
| Diff Preprocessor | Filter comments/format changes, extract key code & dependency updates |
| LLM Parser | Analyze iteration changes: architecture updates, performance optimization, major changes; generate Mermaid & chart data |
| HTML Generator | Fill template with dynamic content, output final static HTML |
| Static HTML Report | Visual display, diagram rendering & basic client-side interaction |