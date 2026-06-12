---
description: Generate Chapters 3-8 of the product-perspective book (core product capabilities)
---

# /book-core

Generate Chapters 3-8 of the Chinese product-perspective book: the six core product capability chapters. These form the main body, decomposing the product by what it does for users.

**Input**: `$ARGUMENTS` -- repository URL (required).

**Skill Required**: Load `open-source-product-book-generator` before proceeding.

**Prerequisites**: Chapters 1-2 should exist so capability map references are consistent.

## Scope

| Ch | Title | Product Capability | Key Source Modules |
|----|-------|-------------------|-------------------|
| 3 | 输入与项目理解能力 | Input pipeline | `git_utils.py`, clone/fetch/cache |
| 4 | 分析模式决策能力 | Analysis mode selection | `main.py`, auto-detection logic |
| 5 | 源码结构理解能力 | Code understanding | `diff_preprocessor.py`, `manifest.py` |
| 6 | LLM 内容生成能力 | Content generation | `llm_parser.py`, 8+ prompt templates |
| 7 | 可信报告生成能力 | Report rendering | `html_generator.py`, `svg_renderer.py` |
| 8 | 成本、速度与可用性设计 | Cost and UX design | `--workers`, `--max-diff-chars`, caching |

## Execution

```bash
# Chapter 3: Input and project understanding
python main.py $ARGUMENTS --book --book-section input --no-fetch

# Chapter 4: Analysis mode decision
python main.py $ARGUMENTS --book --book-section analysis-mode --no-fetch

# Chapter 5: Source structure understanding
python main.py $ARGUMENTS --book --book-section source-structure --no-fetch

# Chapter 6: LLM content generation
python main.py $ARGUMENTS --book --book-section llm-generation --no-fetch

# Chapter 7: Trusted report generation
python main.py $ARGUMENTS --book --book-section report-generation --no-fetch

# Chapter 8: Cost, speed, and usability
python main.py $ARGUMENTS --book --book-section cost-usability --no-fetch
```

Fast testing without LLM:

```bash
python main.py $ARGUMENTS --book --no-llm --no-fetch
```

## Chapter Writing Guidelines

Each chapter maps a product capability to source implementation:

1. **能力定位**: Start with the user-facing problem. Why does the product need this capability?
2. **源码实现**: Show the code path from entry point to result. Reference specific files, functions.
3. **设计决策**: Why this approach? What alternatives exist? What constraints drove the decision?
4. **可迁移价值**: Actionable patterns and pitfalls other projects can learn from.

## Validation

- Every section has `citations` with at least one entry
- Cross-references to Chapter 2 capability map are accurate
- Module names match actual source files

## Notes

- Use `--book-section` for chapter-level generation (implemented).
- `--book-part` is a planned future flag, not yet in CLI.
