---
description: Export book JSON to readable formats (Markdown, plain text). HTML planned for future.
---

# /book-export

Convert the structured book JSON into human-readable or distributable formats.

**Input**: `$ARGUMENTS` -- book output directory or JSON path. Default: `book_output/book.json`.

**Skill Required**: Load `open-source-product-book-generator` before proceeding.

## Supported Formats

| Format | Extension | Status |
|--------|-----------|--------|
| `json` | `.json` | Primary artifact (validate + copy) |
| `markdown` | `.md` | JSON-to-MD conversion (inline script) |
| `text` | `.txt` | JSON-to-plain-text (inline script) |
| `html` | `.html` | Planned future (requires `html_generator.py` integration) |

## Prerequisites

1. Book JSON must exist and be valid.
2. Run `/book-check-style` first. Block export on CRITICAL issues.

## Execution

### Markdown Export

```bash
python -c "
import json
with open('book_output/book.json') as f:
    book = json.load(f)

lines = []
lines.append(f'# {book[\"meta\"][\"project\"]} -- Product Capability Analysis')
lines.append('')
lines.append(f'Version: {book[\"meta\"][\"version\"]} | Branch: {book[\"meta\"][\"branch\"]}')
lines.append(f'Generated: {book[\"meta\"][\"generated_at\"]} | Language: {book[\"meta\"][\"language\"]}')
lines.append('')

lines.append('## Table of Contents')
for ch in book['chapters']:
    lines.append(f'- Chapter {ch[\"number\"]}: {ch[\"title\"]}')
lines.append('')

for ch in book['chapters']:
    lines.append(f'## Chapter {ch[\"number\"]}: {ch[\"title\"]}')
    lines.append('')
    for sec in ch.get('sections', []):
        lines.append(f'### {sec[\"title\"]}')
        lines.append('')
        for field, label in [('positioning', '能力定位'), ('implementation', '源码实现'),
                             ('design_decisions', '设计决策'), ('transferable_value', '可迁移价值')]:
            if sec.get(field):
                lines.append(f'**{label}**: {sec[field]}')
                lines.append('')
        if sec.get('citations'):
            lines.append('*Citations:*')
            for cit in sec['citations']:
                lines.append(f'  - [{cit[\"type\"]}] {cit[\"ref\"]}')
            lines.append('')
    lines.append(f'> **本章核心收获**: {ch.get(\"takeaways\", \"\")}')
    lines.append('')

with open('book_output/book.md', 'w') as f:
    f.write(chr(10).join(lines))
print('Exported: book_output/book.md')
"
```

### Text Export

```bash
python -c "
import json
with open('book_output/book.json') as f:
    book = json.load(f)

lines = []
for ch in book['chapters']:
    lines.append('=' * 60)
    lines.append(f'Chapter {ch[\"number\"]}: {ch[\"title\"]}')
    lines.append('=' * 60)
    for sec in ch.get('sections', []):
        lines.append(f'  {sec[\"title\"]}')
        for field in ['positioning', 'implementation', 'design_decisions', 'transferable_value']:
            if sec.get(field):
                lines.append(f'    {sec[field]}')
    lines.append(f'  Takeaways: {ch.get(\"takeaways\", \"\")}')
    lines.append('')

with open('book_output/book.txt', 'w') as f:
    f.write(chr(10).join(lines))
print('Exported: book_output/book.txt')
"
```

### JSON (Validate + Copy)

```bash
python -c "
import json, shutil
with open('book_output/book.json') as f:
    book = json.load(f)
shutil.copy('book_output/book.json', 'book_output/book_validated.json')
print(f'Validated {len(book[\"chapters\"])} chapters. Copy saved.')
"
```

## Planned Future

These are planned but NOT yet CLI flags:

```
python main.py $ARGUMENTS --book --book-format markdown   # FUTURE
python main.py $ARGUMENTS --book --book-format html       # FUTURE
python main.py $ARGUMENTS --book --book-export book.md    # FUTURE
```

Currently, export uses inline Python scripts as shown above.

## Post-Export

```bash
ls -lh book_output/book.json book_output/book.md book_output/book.txt
wc -l book_output/book.md book_output/book.txt
```

## Notes

- All exports use UTF-8. Chinese characters must render correctly.
- JSON is always the source of truth. Markdown and text derive from it.
- HTML export with navigation is planned for future `html_generator.py` integration.
