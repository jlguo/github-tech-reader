---
description: Generate Chapters 1-2 of the product-perspective book (product positioning and capability map)
---

# /book-init

Generate Chapters 1-2 of the Chinese product-perspective book: product positioning and the capability/user-journey map. These chapters establish the product foundation that all later chapters reference.

**Input**: `$ARGUMENTS` -- repository URL (required).

**Skill Required**: Load `open-source-product-book-generator` before proceeding.

## Scope

- **Chapter 1: 产品定位与用户问题** -- project origin, core proposition, competitive landscape, evolution timeline
- **Chapter 2: 产品能力地图与用户旅程** -- complete capability inventory, categorization, user journey, command/API surface

## Execution

Generate with the implemented `--book` and `--book-section` flags:

```bash
# Chapter 1: Product positioning
python main.py $ARGUMENTS --book --book-section positioning --no-fetch

# Chapter 2: Capability map and user journey
python main.py $ARGUMENTS --book --book-section capability-map --no-fetch
```

For fast iteration (no LLM cost):

```bash
python main.py $ARGUMENTS --book --book-section positioning --no-llm --no-fetch
```

With custom output directory:

```bash
python main.py $ARGUMENTS --book --book-section positioning --book-output-dir book_output --no-fetch
```

## After Generation

Verify Chapters 1-2 exist in output:

```bash
python -c "
import json
with open('book_output/book.json') as f:
    data = json.load(f)
for ch in data['chapters']:
    if ch['number'] in [1, 2]:
        print(f'Ch{ch[\"number\"]}: {ch[\"title\"]}')
        print(f'  Sections: {len(ch.get(\"sections\", []))}')
        cites = sum(len(s.get('citations', [])) for s in ch.get('sections', []))
        print(f'  Citations: {cites}')
"
```

## Quality Targets

- **Chapter 1**: Clear one-sentence product proposition. Specific competitive differentiators. Timeline references real version tags.
- **Chapter 2**: Capability map covers ALL user-facing capabilities. User journey is concrete. Command/API inventory is complete.

## Notes

- Use `--book-section` for chapter-level generation (implemented).
- `--book-part` is a planned future flag, not yet in CLI.
- Each section must follow 4-part structure: 能力定位 / 源码实现 / 设计决策 / 可迁移价值.
