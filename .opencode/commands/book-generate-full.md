---
description: Generate a complete product-perspective Chinese technical book (all 12 chapters) from an open-source repository
---

# /book-generate-full

Generate a complete Chinese product-perspective technical book. Covers all 12 chapters from product positioning to methodology synthesis. Outputs structured JSON as the primary artifact.

**Input**: `$ARGUMENTS` -- repository URL (required).

**Skill Required**: Load `open-source-product-book-generator` before proceeding.

## Pre-flight

1. Confirm the repo URL is accessible.
2. Confirm the target Git ref with the user. Default: HEAD of default branch.
3. Announce scope: 12-chapter product-capability book, structured JSON output to `book_output/`.

## Execution

### Step 1: Generate the Book

The `--book` flag is implemented. Use it directly:

```bash
python main.py $ARGUMENTS --book --no-fetch
```

For fast testing without LLM cost:

```bash
python main.py $ARGUMENTS --book --no-llm --no-fetch
```

With custom output directory:

```bash
python main.py $ARGUMENTS --book --book-output-dir my_book --no-fetch
```

### Step 2: Validate Output

```bash
python -c "
import json
with open('book_output/book.json') as f:
    book = json.load(f)
chapters = book.get('chapters', [])
print(f'Chapters: {len(chapters)}')
for ch in chapters:
    print(f'  Ch{ch[\"number\"]}: {ch[\"title\"]} ({len(ch.get(\"sections\",[]))} sections)')
"
```

### Step 3: Quality Check

Run `/book-check-style` to validate against skill rules. Fix all CRITICAL issues.

### Step 4: Export

Primary artifact is `book_output/book.json`. For human-readable formats, see `/book-export`.

## 12 Chapters Generated

| Ch | Title | Focus |
|----|-------|-------|
| 1 | 产品定位与用户问题 | Product positioning, competitive landscape |
| 2 | 产品能力地图与用户旅程 | Capability inventory, user journey |
| 3 | 输入与项目理解能力 | Input pipeline, repo ingestion |
| 4 | 分析模式决策能力 | Auto-detection, mode selection |
| 5 | 源码结构理解能力 | Diff processing, module detection |
| 6 | LLM 内容生成能力 | Prompt engineering, LLM pipeline |
| 7 | 可信报告生成能力 | HTML/Diagram rendering |
| 8 | 成本、速度与可用性设计 | Cost optimization, UX decisions |
| 9 | 面向复杂项目的扩展架构 | Scaling for large repos |
| 10 | 多 Agent 协作生成一本书 | Multi-agent orchestration |
| 11 | 插件化与生态入口设计 | Module separation, extension points |
| 12 | 从源码到产品洞察的方法论 | Principles, checklist, patterns |

## Notes

- The `--book`, `--book-section`, and `--book-output-dir` flags are implemented.
- The `--book-part`, `--book-format`, and `--book-export` flags are planned (future, not yet in CLI).
- Always use `--no-fetch` for cached repos to avoid unnecessary network calls.
- All content is Chinese (zh-CN). Source file paths and code identifiers remain in original language.
