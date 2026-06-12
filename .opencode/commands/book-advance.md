---
description: Generate Chapters 9-11 of the product-perspective book (advanced architecture)
---

# /book-advance

Generate Chapters 9-11 of the Chinese product-perspective book: advanced architecture and extension design. These chapters analyze system-level design decisions.

**Input**: `$ARGUMENTS` -- repository URL (required).

**Skill Required**: Load `open-source-product-book-generator` before proceeding.

**Prerequisites**: Chapters 1-8 should exist. These chapters synthesize across prior analysis.

## Scope

| Ch | Title | Focus | Key Topics |
|----|-------|-------|-----------|
| 9 | 面向复杂项目的扩展架构 | Scaling for large repos | Multi-iteration, manifest extraction, pagination, testing |
| 10 | 多 Agent 协作生成一本书 | Multi-agent collaboration | Coordinator/Source/Arch/Review roles, task decomposition |
| 11 | 插件化与生态入口设计 | Plugin and ecosystem | Module separation, extension points, cache layers |

## Execution

```bash
# Chapter 9: Extension architecture for complex projects
python main.py $ARGUMENTS --book --book-section extension-arch --no-fetch

# Chapter 10: Multi-agent collaboration
python main.py $ARGUMENTS --book --book-section multi-agent --no-fetch

# Chapter 11: Plugin architecture and ecosystem design
python main.py $ARGUMENTS --book --book-section plugin-ecosystem --no-fetch
```

Fast testing:

```bash
python main.py $ARGUMENTS --book --no-llm --no-fetch
```

## Chapter Writing Guidelines

These chapters require architectural synthesis:

### Chapter 9: 面向复杂项目的扩展架构
- Start from the scaling problem: what breaks with 1000+ commits?
- Trace each scaling decision: `--strategy`, `--use-manifest`, pagination
- Include real limits: max diff chars, worker counts, iteration caps
- Discuss what was deliberately NOT scaled

### Chapter 10: 多 Agent 协作生成一本书
- Base on the actual Agent collaboration model from the skill
- Describe the 4-agent architecture, not generic AI agent theory
- Cover JSON fragment interchange, context sharding, conflict avoidance
- Include the Review-Agent quality gate design

### Chapter 11: 插件化与生态入口设计
- Start from module separation in the actual codebase
- Trace each extension point: provider adapter, prompt templates
- Describe cache layer architecture: why three separate caches
- Discuss the output ecosystem: `report_output/`, `library.html`

## Validation

- Each chapter synthesizes across prior analysis; no new module-level work
- All architectural claims backed by source references
- Agent collaboration model matches skill's documented design
- Extension points correspond to real code interfaces

## Notes

- Use `--book-section` for chapter-level generation (implemented).
- `--book-part` is a planned future flag, not yet in CLI.
