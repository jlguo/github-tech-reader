---
description: Generate Chapter 12 of the product-perspective book (methodology synthesis)
---

# /book-summary

Generate Chapter 12: 从源码到产品洞察的方法论 (Methodology: From Source Code to Product Insights). Synthesizes the entire book into reusable frameworks and principles.

**Input**: `$ARGUMENTS` -- repository URL (required).

**Skill Required**: Load `open-source-product-book-generator` before proceeding.

**Prerequisites**: Chapters 1-11 must exist. This chapter synthesizes across ALL prior chapters.

## Scope

| Section | Title | Content |
|---------|-------|---------|
| 12.1 | 十大通用产品分析原则 | Ten cross-project reusable product analysis principles |
| 12.2 | 产品能力分析检查清单 | Reusable checklist for analyzing any OSS project as a product |
| 12.3 | 模式目录 | Catalog of recurring design patterns across analyzed projects |
| 12.4 | 全书结语 | Book conclusion: reading source code as product methodology |

## Execution

```bash
python main.py $ARGUMENTS --book --book-section methodology --no-fetch
```

Fast testing:

```bash
python main.py $ARGUMENTS --book --no-llm --no-fetch
```

## Section Writing Guidelines

### 12.1 Ten Universal Product Analysis Principles

Each principle:
- States the principle clearly in one sentence
- Shows how THIS project exemplifies (or violates) it, citing specific chapters
- Provides actionable guidance for applying it to other projects

Span: product positioning, capability decomposition, mode selection, pipeline design, caching, cost optimization, scaling, collaboration, plugin ecosystems, methodology.

### 12.2 Product Capability Analysis Checklist

A table with columns: Analysis Dimension, This Project's Approach, Questions for Your Project. Cover: input ingestion, analysis mode, content generation, report delivery, cost management, scaling strategy, extension model. Every question must be actionable and technology-agnostic.

### 12.3 Pattern Catalog

Extract 5-8 recurring patterns:
- Name and description
- Where it appears (chapter references)
- When to use / when NOT to use

### 12.4 Book Conclusion

Synthesize core thesis: reading source code as a product reveals engineering decisions invisible in traditional code review. The 12-chapter product-capability framework applies to any open-source project.

## Validation

- Every principle backed by at least 2 chapter references
- Checklist questions are actionable, not theoretical
- Pattern catalog entries have clear applicability boundaries
- Conclusion does not introduce new claims -- only synthesizes

## Notes

- Use `--book-section methodology` for this chapter (implemented).
- `--book-part IV` is a planned future flag, not yet in CLI.
- This is a synthesis chapter. Do NOT introduce new source analysis here.
