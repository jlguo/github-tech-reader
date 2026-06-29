# AGENTS.md — github-tech-reader-v2

High-level rules, principles, and practices for working in this repo.
**For all implementation detail (architecture, data layer, security internals,
Android build, API tables, categories, flows), see [`README.md`](./README.md)** — each
rule below links to the relevant section.

> **Project**: 电子书架 (Cloud Shelf) — a web app for organizing and reading tech content
> (GitHub repos, uploaded files, web pages, YouTube) as a digital bookshelf.
> Stack & architecture: [README → 技术栈](./README.md#技术栈--tech-stack),
> [README → 架构](./README.md#架构--architecture).

---

## Hard Rules (non-negotiable)

1. **Ports are fixed** — Frontend Vite `5173`, Backend FastAPI `8000`. Never change them
   in config, CLI args, or env vars. CORS and the frontend client are hard-coded to these.
   See [README → 快速开始](./README.md#快速开始--quick-start).

2. **uv only for the backend** — All backend Python runs through `uv`. Never invoke raw
   `python`/`pip`, never `pip install`, and never hand-activate a venv. Use:
   - Run the server: `uv run uvicorn app.main:app --reload --port 8000` (from `backend/`).
   - Run any script / one-off: `uv run python ...`, tests: `uv run pytest`.
   - Add/upgrade deps: `uv add <pkg>` (edits `pyproject.toml` + `uv.lock`); sync with
     `uv sync`. `pyproject.toml` and `uv.lock` are the source of truth — keep them in sync.
   - **After adding a backend dependency, restart the backend and confirm `app.main`
     imports cleanly** (`uv run python -c "import app.main"`) before claiming done. A dep
     listed in `pyproject.toml` but not synced will crash a fresh start even if a stale
     server still runs.

3. **Verify frontend changes with Playwright** — After ANY frontend change that affects UI
   behavior, data flow, or API integration, run Playwright to verify. Never ship without
   Playwright confirmation. This is the project's primary verification mechanism.
   - **How to run**: from `frontend/`, `pnpm test:e2e` (config: `tests/e2e`, chromium,
     `baseURL` `http://localhost:5173`). The dev server is reused if already running on
     `5173`; the backend on `8000` must be up for remote-mode specs. Set `CHROME_PATH` if a
     specific Chrome binary is required. Run a single spec with
     `pnpm test:e2e tests/e2e/<file>.spec.ts`.
   - **Scoped verification for small changes**: For a **small change** (a single bug fix or
     a specific, self-contained enhancement), **do NOT run the full e2e suite**. Instead,
     write (or reuse) **one specific e2e spec that covers exactly that change**, run only
     that spec, and confirm it passes. The full suite is reserved for broad/cross-cutting
     changes (shared state, data layer, routing, multi-reader, or anything touching several
     features). See [README → E2E Tests](./README.md#e2e-tests--playwright).
   - **Interact like a real user**: never use `page.route` mocking or `page.goto` to bypass
     the UI; never add/increase `waitForTimeout` without justification (debug the stuck step
     with `console.log` first). See **Practices → Testing** below.

4. **Delegate proactively** — Do not implement, explore, or research alone when a
   specialized sub-agent can do it. Decompose first, dispatch in parallel
   (`run_in_background=true`) when units have no shared state. See **Delegation** below.

5. **Never weaken type safety or swallow errors** — No `as any`, `@ts-ignore`,
   `@ts-expect-error`, or empty `catch {}`. Never delete failing tests to make a suite pass.

6. **Never commit unless explicitly requested.**

7. **Clean test books after every e2e test run** — E2E tests create books (imported files,
   demo repos) that accumulate in the database and `data/` directories. After ANY `pnpm
   test:e2e` run (full suite or single spec), clean up test data immediately so the shelf
   stays clean for the next run. Running tests on a dirty shelf causes flakes and pollutes
   the database.
   - **How to clean**: from `backend/`, run `uv run python scripts/cleanup_test_books.py`.
     The backend must be running on `8000` for the API-based cleanup to work.
   - **Convenience script**: from `frontend/`, `pnpm test:e2e:clean` runs cleanup via curl
     (requires backend on `8000`) and is available as a standalone command.
   - See [README → E2E Tests](./README.md#e2e-tests--playwright) and
     `backend/scripts/cleanup_test_books.py` for details.

---

## Delegation — HARD RULE

> ALWAYS delegate work to sub-agents proactively. This is non-negotiable.

- **Decompose first**: break any non-trivial task into independent units; run them in
  parallel when there is no shared state or sequential dependency.
- **Match the agent to the work**:
  - codebase search / pattern discovery → `explore`
  - external libs, docs, OSS examples → `librarian`
  - hard architecture / debugging / review → `oracle`
  - frontend / UI / styling → `visual-engineering` category
  - hard logic / algorithms → `ultrabrain` category
  - autonomous end-to-end work → `deep` category
- **Always pass `load_skills`**: evaluate available skills before every dispatch; load the
  relevant ones (`[]` only when none match).
- **Never duplicate delegated work**: once a sub-agent is working, do not redo the same
  search yourself — wait for results, then verify them.
- **Verify after delegation**: confirm the deliverable works, follows existing patterns, and
  met the stated MUST DO / MUST NOT DO constraints before marking complete.
- **Git worktrees for new sessions / topics**: when a distinct new topic could run in
  parallel with in-progress work, consider an isolated git worktree (and branch). Case-by-
  case judgment, not a requirement; skip for small self-contained edits. **Always get
  explicit human approval before creating a worktree.**

---

## Practices

### Testing
- Simulate human UI interactions. Do not use API mocking (`page.route`) or `page.goto` to
  bypass the UI — interact through the page like a real user.
- Do not add/increase `waitForTimeout` without justification. When a test hangs, add
  `console.log` debug to find the exact stuck step before touching any timeout.
- New features get Playwright tests covering happy path, edge cases, and error states.
- For visual verification, use `console.log` + `innerText()` — do not rely on screenshots
  alone. Full practices: [README → Smoke Test Practices](./README.md#smoke-test-practices).
- **Clean test books after every e2e run** — see Hard Rule #7.

### Security (backend is hardened — keep it that way)
- The backend enforces SSRF blocking, upload caps, extension whitelist, path-traversal
  guards, SQLite foreign-key cascades, and script-disabled sandboxed file serving. Do not
  regress these. Details: [README → 后端安全加固](./README.md#后端安全加固--backend-security-hardening).
- Untrusted HTML must be DOMPurify-sanitized before rendering. See
  [README → HTML Sanitization](./README.md#html-sanitization).

### Data layer & dual mode
- Consumer code calls `getDataService()` — **never** raw `fetch()`. The same code path must
  work in both remote and local modes. See
  [README → Dual-Mode Architecture](./README.md#dual-mode-architecture).

### Categories
- Membership is computed by **label matching** against a book's `tags`, not a stored
  per-book field. The legacy `book.category` is vestigial — never filter on it. Keep
  import-time tag injection in sync with `SYSTEM_CATEGORIES`. See
  [README → Categories](./README.md#categories--label-based-membership-runtime-managed).

### Reading progress
- `book.progress` is reading progress (0–100), **NOT** generation progress. Never set it
  from `status === "done"`. See [README → Reading Progress](./README.md#reading-progress).

---

## Conventions

- **pnpm** only for frontend — no npm or yarn.
- Prefer Tailwind classes over inline styles (the Figma export has many inline styles).
- **shadcn/ui** is the UI foundation; avoid adding new UI libraries. MUI lingers in the
  prototype deps and should be removed.
- Chinese content: sort with `localeCompare("zh")`.
- Readers follow the `ReaderModal.tsx` dispatch pattern (one component per document type,
  dispatched by `book.type` / `sourceType`). Untrusted HTML is sanitized and rendered via
  same-origin `srcDoc`; the parent listens for the `reader-center-tap` `postMessage`.
- Backend: async SQLAlchemy with `aiosqlite`; use `selectinload` for eager-loading.
- Environment: copy `backend/.env.example` to `backend/.env` and configure `GITHUB_TOKEN`
  and the LLM keys. See [README → 配置](./README.md#配置--configuration).
- **SSE**: use the `useBookStatus` hook (SSE primary, 5s polling fallback); open only for
  the selected book (detail modal), not shelf-wide.
- **Imported books** use the `ImportedBook` model; `GET /api/books` unions them with
  repo-generated books via `source_type`.
- **genStatus**: `"pending" | "fetching" | "planning" | "cover" | "writing" | "reviewing" | "publishing" | "done" | "failed" | "no_book"` — all 10 recognized in UI.

---

## Reference Index → README.md

| Topic | README section |
|-------|----------------|
| Tech stack | [技术栈](./README.md#技术栈--tech-stack) |
| Directory layout & key details | [架构](./README.md#架构--architecture) |
| Data-layer files | [services 数据层](./README.md#frontendsrcservices--data-layer) |
| Dual-mode (remote/local) | [Dual-Mode Architecture](./README.md#dual-mode-architecture) |
| PWA | [PWA Support](./README.md#pwa-support) |
| Android APK build | [Android APK](./README.md#android-apk-self-contained) |
| Backend security | [后端安全加固](./README.md#后端安全加固--backend-security-hardening) |
| HTML sanitization | [HTML Sanitization](./README.md#html-sanitization) |
| Reading progress | [Reading Progress](./README.md#reading-progress) |
| Categories | [Categories](./README.md#categories--label-based-membership-runtime-managed) |
| API routes & import flows | [API 端点](./README.md#api-端点--api-endpoints) |
| Book status pipeline | [Book status pipeline](./README.md#book-status-pipeline) |
| E2E tests | [E2E Tests](./README.md#e2e-tests--playwright) |
| Demo books | [Demo books](./README.md#demo-books) |
| Design vs implementation | [Design vs Implementation Gap](./README.md#design-vs-implementation-gap) |
| Docker & deployment | [Docker 部署](./README.md#docker-部署--docker-deployment) |
| Config / env vars | [配置](./README.md#配置--configuration) |
