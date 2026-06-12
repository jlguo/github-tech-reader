---
name: open-source-product-book-generator
description: Generate Chinese-language product-perspective technical books from open-source repositories. Reads the target repo as a product, analyzing capabilities, architecture decisions, and design rationale. Produces structured 12-chapter JSON-first artifacts with per-section source citations. Use when asked to create a product-driven book, analyze a repo as a product, or generate structured Chinese technical documentation from source code.
---

# Open Source Product Book Generator

Translate an open-source repository into a product-perspective Chinese technical book. The book treats the repo as a product, decomposing it by capability rather than by directory. Focus on product positioning, user-facing capabilities, and the engineering choices that make those capabilities work.

**Primary audience**: technical leads and architects evaluating or adopting the project.
**Secondary audience**: developers integrating with the project; builders creating competing products.

## Core Principles

1. **Product perspective**: Analyze WHY each capability exists and HOW it solves a user problem. Do not describe code line by line.
2. **Source-backed**: Every analytical claim must cite a specific source: source file path, configuration key, commit hash, issue/PR, or official documentation.
3. **Capability decomposition**: Map source modules to product capabilities, not directory trees. Each chapter covers a product capability area.
4. **Version-bounded**: Lock analysis to a specific Git ref. State the version boundary at the start.
5. **Scope filter**: Analyze main project source only. Exclude vendored dependencies, tests, demos, and third-party plugins from statistics.
6. **JSON-first**: Primary artifact is structured JSON. Markdown and HTML are secondary formats derived from JSON.

## Book Structure (12 Chapters, Product-Capability-Driven)

Each chapter maps to a product capability dimension:

### Chapter 1: 产品定位与用户问题 (Product Positioning and User Problems)
- Project origin: what user problem does it solve, who are the target users
- Core product proposition: the one-sentence value statement distilled from README and docs
- Competitive landscape: similar projects, differentiation, positioning matrix
- Product evolution timeline: major versions, capability milestones, breaking changes
- Chapter takeaways: the project's product DNA distilled into reusable positioning patterns

### Chapter 2: 产品能力地图与用户旅程 (Product Capability Map and User Journey)
- Complete capability inventory: every user-facing capability the product provides
- Capability categorization: input, analysis, generation, output, customization, integration
- User journey map: a typical session from entry to result, showing capability exercise order
- Command/API surface: public interface inventory with usage patterns
- Chapter takeaways: how the capability map translates to architecture decisions

### Chapter 3: 输入与项目理解能力 (Input and Project Understanding)
- Supported input formats: repo URLs, local paths, branch/tag/commit specifications
- Repository ingestion pipeline: clone, fetch, cache, bare repo management (`git_utils.py`)
- Project structure discovery: module detection (`discover_modules()`), dominance drill, file classification
- Git history interpretation: tag extraction, commit chunking, iteration grouping
- Input validation and error recovery: malformed URLs, unreachable repos, empty projects
- Chapter takeaways: patterns for building robust multi-source ingestion pipelines

### Chapter 4: 分析模式决策能力 (Analysis Mode Decision)
- Auto-detection logic: how the tool decides between evolution, commit-chunk, and structural modes
- Tag-based evolution mode: trigger conditions, patch version merging, iteration strategies
- Commit-chunk mode: trigger conditions, chunk size algorithm, pseudo-version generation
- Structural mode: trigger conditions, module discovery, deep vs shallow analysis
- Mode selection rationale: why this decision tree, edge cases, user overrides (`--strategy`, `--limit`)
- Chapter takeaways: designing adaptive analysis pipelines that handle diverse inputs

### Chapter 5: 源码结构理解能力 (Source Code Structure Understanding)
- Diff preprocessing: noise filtering, comment stripping, dependency change extraction (`diff_preprocessor.py`)
- Manifest system: file classification, scoring, change manifest construction (`manifest.py`)
- Module boundary detection: directory grouping, dominance-based drill-down, path preservation
- Language-agnostic parsing: how the tool handles multiple languages without language-specific parsers
- Code-to-analysis transformation: how raw diffs become structured analysis input
- Chapter takeaways: building code understanding layers that work across language boundaries

### Chapter 6: LLM 内容生成能力 (LLM Content Generation)
- Prompt engineering architecture: 8+ prompt templates, their roles, and token budgets (`llm_parser.py`)
- Parallel generation pipeline: `ThreadPoolExecutor` design, concurrency limits (`--workers`), worker allocation
- Result caching: MD5-based cache keys, stale entry handling, shallow vs deep key formats (`cache_json/`)
- Provider abstraction: DeepSeek/OpenAI/Ollama adapter pattern (`--provider`), fallback logic
- Mock fallback: `--no-llm` path, structurally complete sparse data generation
- Chapter takeaways: production LLM pipeline design patterns for structured content generation

### Chapter 7: 可信报告生成能力 (Trusted Report Generation)
- HTML generation pipeline: Jinja2 templates, pagination logic, single-page vs multi-page (`html_generator.py`)
- Diagram rendering: Mermaid-to-SVG via Playwright, SHA256 disk cache (`svg_cache/`), sanitization pipeline
- Data visualization: ECharts integration, inline JS, performance chart data generation
- Offline-first design: no CDN dependencies, system font stack, self-contained reports
- Library index: auto-regeneration of `library.html`, metadata tracking across reports
- Chapter takeaways: generating self-contained, offline-capable technical reports

### Chapter 8: 成本、速度与可用性设计 (Cost, Speed, and Usability Design)
- LLM cost optimization: caching strategy, diff truncation (`--max-diff-chars`), selective manifest extraction
- Performance architecture: parallel LLM calls, bare repo shallow clones, disk-cached SVGs
- Usability decisions: auto-detection of analysis mode, sensible defaults, `--limit` for quick tests
- Error resilience: graceful degradation when LLM unavailable, partial output on failure
- Resource management: worker count control, max diff chars, manifest max files
- Chapter takeaways: cost-aware design patterns for LLM-powered tools

### Chapter 9: 面向复杂项目的扩展架构 (Extension Architecture for Complex Projects)
- Multi-iteration analysis: large-repo strategies, iteration merging, `--strategy` flags
- Manifest-based selective extraction: avoiding full-diff LLM overload on large changes (`--use-manifest`)
- Pagination design: 20 items per page, single-page for structural mode
- Scalability decisions: what was capped, why, and where the limits are
- Large repo testing patterns: how the tool validates with 100+ iteration repos
- Chapter takeaways: scaling code analysis tools to enterprise-sized repositories

### Chapter 10: 多 Agent 协作生成一本书 (Multi-Agent Collaboration for Book Generation)
- Agent role definitions: Coordinator, Source-Agent, Arch-Agent, Review-Agent
- Task decomposition: how a 12-chapter book is split across parallel agents
- Context management: shared global state, per-agent context windows, shard-based context passing
- Conflict avoidance: structured JSON as interchange format, no raw source sharing, file lock rules
- Quality gate: Review-Agent as independent validator, skill rule enforcement
- Chapter takeaways: multi-agent orchestration patterns for long-form content generation

### Chapter 11: 插件化与生态入口设计 (Plugin Architecture and Ecosystem Entry Design)
- Module design philosophy: separation of concerns across `git_utils`, `diff_preprocessor`, `llm_parser`, `html_generator`
- Extension points: provider adapter, custom prompt templates, output format plugins
- Cache layer architecture: `repo_cache`, `cache_json`, `svg_cache` -- separation and invalidation
- Output ecosystem: `report_output` structure, `library.html` index, `meta.json` metadata
- Future plugin vision: how the architecture anticipates third-party extensions
- Chapter takeaways: designing tool architectures that enable ecosystem growth

### Chapter 12: 从源码到产品洞察的方法论 (Methodology: From Source Code to Product Insights)
- 12.1 Ten universal product analysis principles distilled from the book
- 12.2 Product capability analysis checklist (reusable framework for any OSS project)
- 12.3 Pattern catalog: recurring design patterns found across analyzed projects
- 12.4 Book conclusion: the methodology of reading source code as a product, not as code

## Section Writing Standard

Every section in every chapter follows a 4-part structure:

1. **能力定位 (Capability Positioning)**: What product capability this section covers and why it matters to users.
2. **源码实现 (Source Implementation)**: How the capability is realized in code -- key files, modules, data flows.
3. **设计决策 (Design Decisions)**: Why this implementation approach was chosen, alternatives considered, trade-offs made, lessons from commit history.
4. **可迁移价值 (Transferable Value)**: What other projects can learn from this design -- patterns, pitfalls, reusable principles.

## Artifact Format (JSON-First)

The primary output is structured JSON. All secondary formats (Markdown, HTML) derive from it.

```json
{
  "meta": {
    "project": "<owner/name>",
    "version": "<tag or commit>",
    "branch": "<branch>",
    "generated_at": "<ISO 8601>",
    "book_version": "1.0",
    "language": "zh-CN"
  },
  "product_profile": {
    "product_type": "cli-tool|framework|library|service|platform",
    "target_users": ["..."],
    "core_proposition": "...",
    "competitive_advantages": ["..."]
  },
  "capability_map": [
    {"id": "input", "name": "输入与项目理解", "modules": ["git_utils.py"], "chapter": 3},
    {"id": "analysis", "name": "分析模式决策", "modules": ["main.py"], "chapter": 4}
  ],
  "chapters": [
    {
      "number": 1,
      "title": "产品定位与用户问题",
      "sections": [
        {
          "title": "...",
          "positioning": "...",
          "implementation": "...",
          "design_decisions": "...",
          "transferable_value": "...",
          "citations": [
            {"type": "file", "ref": "path/to/file", "line": "123-145"},
            {"type": "commit", "ref": "abc1234", "note": "Initial implementation"},
            {"type": "issue", "ref": "#42", "note": "Design discussion"},
            {"type": "doc", "ref": "https://...", "note": "Official docs"}
          ]
        }
      ],
      "takeaways": "..."
    }
  ]
}
```

## Citation Policy

Every claim in every chapter section MUST include at least one citation. Minimum rules:

| Claim type | Required citation type | Example |
|-----------|----------------------|---------|
| Source code structure | `file` with path | `git_utils.py` `discover_modules()` |
| Design rationale | `issue` or `commit` | Issue #42, commit abc1234 |
| Numerical statistic | `file` + tool output | `wc -l` output path |
| External context | `doc` with URL | Official docs page |
| Architecture decision | `commit` or `issue` | The commit that introduced the pattern |
| Chapter takeaways | None required | But must not introduce new unsupported claims |

## Implemented CLI Flags

These flags are implemented and safe to use in commands:

```bash
python main.py <repo_url> [options]

Book-specific (implemented):
  --book                  Enable book generation mode (Chinese product-perspective JSON)
  --book-section <name>   Filter to a specific analysis section
  --book-output-dir <dir> Custom output directory (default: book_output/)

General (also available in book mode):
  --no-llm               Skip LLM, use mock data (fast testing)
  --no-fetch             Skip git fetch on cached repos (offline mode)
  --no-cache             Force re-analysis, skip LLM cache
  --limit N              Limit to N iterations
  --provider <name>      LLM provider: openai|ollama|deepseek
  --model <name>         LLM model name
  --workers N            Parallel workers (default: 3)
  --output <path>        Custom output path
```

## Planned Future Flags (NOT yet implemented)

Listed for forward compatibility reference only:

```
  --book-part I|II|III|IV   Generate specific part only (FUTURE)
  --book-format json|md|html Output format selection (FUTURE)
  --book-export <path>      Export to specific format (FUTURE)
  --book-clear-cache        Clear book caches (FUTURE)
```

Commands referencing these MUST mark them as planned/future and provide a current workaround using implemented flags.

## Multi-Agent Collaboration Model

When used in a multi-agent environment:

1. **Coordinator (Lead)**: Receives user command, loads this skill, decomposes into chapters, dispatches to specialist agents, merges JSON artifacts, exports final book.
2. **Source Agent**: Writes Chapters 1-2 (positioning + capability map) and Chapters 3-7 (core capabilities). Focuses on module-to-capability mapping and source analysis.
3. **Architecture Agent**: Writes Chapters 8-11 (cost/scaling/agents/plugins). Focuses on system-level design decisions and extension architecture.
4. **Review Agent**: Independently validates all chapters against this skill's rules. Checks citation compliance, section structure, terminology consistency.

All agents exchange structured JSON fragments. No agent operates on raw source directly. Coordinator distributes shared terminology and capability definitions.
