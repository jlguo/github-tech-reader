---
description: Clear book output and cache directories for a specific repository or globally
---

# /book-clear-cache

Clear book output and cache data. Use when switching repositories, changing analysis versions, or recovering from corrupted state.

**Input**: `$ARGUMENTS` -- scope: `--all` or `--repo owner/name` or `--book-output`. If omitted, prompt.

**Skill Required**: Load `open-source-product-book-generator` before proceeding.

## Cache Locations

| Directory | Content | Impact of clearing |
|-----------|---------|-------------------|
| `repo_cache/<owner>_<name>.git` | Bare git clone | Next run re-clones (network) |
| `cache_json/` | LLM analysis results | Next run re-analyzes (LLM cost) |
| `svg_cache/` | Rendered Mermaid SVGs | Next run re-renders (CPU) |
| `book_output/` | Generated book artifacts | Lost; must regenerate |
| `report_output/` | Historical HTML reports | Lost; must regenerate |

## Clear Scopes

### `--all`

Remove all caches. REQUIRES CONFIRMATION.

```bash
echo "WARNING: This removes ALL cached repos, LLM results, and book outputs."
echo "Current sizes:"
du -sh repo_cache/ cache_json/ svg_cache/ book_output/ report_output/ 2>/dev/null

rm -rf repo_cache/ cache_json/ svg_cache/ book_output/ report_output/
echo "All caches cleared."
```

### `--repo <owner/name>`

Clear data for one repository:

```bash
OWNER=$(echo "$ARGUMENTS" | cut -d/ -f1)
NAME=$(echo "$ARGUMENTS" | cut -d/ -f2)
rm -rf "repo_cache/${OWNER}_${NAME}.git"
rm -rf book_output/
rm -rf report_output/${OWNER}_${NAME}_*/
echo "Cleared cache for ${OWNER}/${NAME}"
```

LLM cache (`cache_json/`) uses URL-based keys and naturally misses on next run.

### `--book-output`

Clear only book output, preserving repo and LLM cache:

```bash
rm -rf book_output/
echo "Book output cleared. Repo cache and LLM cache preserved."
```

## Safety Rules

1. Confirm `--all` scope with the user before executing.
2. Check for running generation processes before clearing.
3. Report directory sizes before deleting: `du -sh repo_cache/ book_output/`.
4. Never touch `.opencode/`, `.git/`, or source directories.
5. All cleared data is regenerable by re-running the pipeline.

## Planned Future

```bash
python main.py --book-clear-cache --all              # FUTURE flag
python main.py --book-clear-cache --repo owner/name   # FUTURE flag
```

These flags are planned but not yet implemented. Use shell commands above.

## Post-Clear Verification

```bash
echo "Remaining caches:"
ls repo_cache/ 2>/dev/null | wc -l && echo "  repo caches"
ls book_output/ 2>/dev/null | wc -l && echo "  book output files"
```
