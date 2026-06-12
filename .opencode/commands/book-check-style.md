---
description: Validate book JSON output against product-capability skill rules (citations, structure, language)
---

# /book-check-style

Validate generated book JSON against the `open-source-product-book-generator` skill rules. Checks citation compliance, section structure, chapter completeness, and Chinese language consistency.

**Input**: `$ARGUMENTS` -- path to `book.json` or `book_output/` directory. Default: `book_output/book.json`.

**Skill Required**: Load `open-source-product-book-generator` before proceeding.

## Validation Checklist

### A. Citation Compliance (CRITICAL)

- [ ] Every section has non-empty `citations` array
- [ ] Analytical claims (design decisions, trade-offs) have at least one source citation
- [ ] Citations use valid types: `file`, `commit`, `issue`, `doc`
- [ ] File citations include relative repo paths
- [ ] Commit citations include hash and brief message
- [ ] Numerical claims backed by tool output or source references
- [ ] Chapter `takeaways` does not introduce unsupported claims

### B. Chapter Structure (HIGH)

- [ ] Exactly 12 chapters present
- [ ] Each chapter title matches product-capability structure:
  - Ch1: 产品定位与用户问题
  - Ch2: 产品能力地图与用户旅程
  - Ch3: 输入与项目理解能力
  - Ch4: 分析模式决策能力
  - Ch5: 源码结构理解能力
  - Ch6: LLM 内容生成能力
  - Ch7: 可信报告生成能力
  - Ch8: 成本、速度与可用性设计
  - Ch9: 面向复杂项目的扩展架构
  - Ch10: 多 Agent 协作生成一本书
  - Ch11: 插件化与生态入口设计
  - Ch12: 从源码到产品洞察的方法论
- [ ] Each chapter has `sections` (at least 3) and `takeaways`
- [ ] Each section has all 4 fields: `positioning`, `implementation`, `design_decisions`, `transferable_value`

### C. Content Quality (HIGH)

- [ ] Content is product-perspective: explains WHY, not line-by-line WHAT
- [ ] No tutorial or introductory content
- [ ] Each section has substance; no placeholder or generic content
- [ ] `product_profile` and `capability_map` populated with real data

### D. Language and Formatting (MEDIUM)

- [ ] Output language is Chinese (zh-CN); no English paragraphs in body text
- [ ] Code identifiers in original language; marked clearly
- [ ] Technical terminology consistent across chapters
- [ ] No emojis in output

### E. JSON Validity (CRITICAL)

- [ ] `book.json` is valid JSON (parseable)
- [ ] `meta` has all required fields: `project`, `version`, `branch`, `generated_at`, `language`
- [ ] Chapter `number` matches array position + 1

## Execution

Quick check for JSON validity and chapter count:

```bash
python -c "
import json, sys
with open('book_output/book.json') as f:
    book = json.load(f)
meta = book.get('meta', {})
chapters = book.get('chapters', [])
print(f'Project: {meta.get(\"project\", \"MISSING\")}')
print(f'Version: {meta.get(\"version\", \"MISSING\")}')
print(f'Chapters: {len(chapters)}')
for ch in chapters:
    n = ch.get('number', '?')
    t = ch.get('title', 'MISSING')
    s = len(ch.get('sections', []))
    c = sum(len(sec.get('citations', [])) for sec in ch.get('sections', []))
    print(f'  Ch{n}: {t} ({s} sections, {c} citations)')
"
```

Check for critical issues (missing citations, missing fields):

```bash
python -c "
import json
with open('book_output/book.json') as f:
    book = json.load(f)
issues = []
for ch in book.get('chapters', []):
    for sec in ch.get('sections', []):
        if not sec.get('citations'):
            issues.append(f'Ch{ch[\"number\"]} \"{sec[\"title\"]}\": no citations')
        for field in ['positioning', 'implementation', 'design_decisions', 'transferable_value']:
            if not sec.get(field):
                issues.append(f'Ch{ch[\"number\"]} \"{sec[\"title\"]}\": missing {field}')
if issues:
    print(f'{len(issues)} issues found:')
    for i in issues:
        print(f'  - {i}')
else:
    print('No critical issues found.')
"
```

## Report Format

| Severity | Count | Action |
|----------|-------|--------|
| CRITICAL | N | Block export; must fix |
| HIGH | N | Strongly recommend fix |
| MEDIUM | N | Fix at discretion |
| LOW | N | Optional |

## Notes

- Read-only validation. Does not modify `book.json`.
- Re-run after fixes to confirm resolution.
- Checklist reflects the `open-source-product-book-generator` skill rules.
