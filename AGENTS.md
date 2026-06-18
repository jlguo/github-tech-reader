# AGENTS.md — github-tech-reader-v2

## Project

**电子书架 (Cloud Shelf)** — a web app for organizing and reading tech content (GitHub repos, uploaded files, web pages) in a digital bookshelf interface. Design prototypes live in `docs/电子书架.zip` (Figma Make export).

## Stack

- **Frontend**: React 18 + TypeScript, Vite 6, pnpm (`frontend/`)
- **Backend**: Python 3.11+, FastAPI, SQLAlchemy (async), SQLite, CrewAI (`backend/`)
- **Styling**: Tailwind CSS v4 (`@tailwindcss/vite` plugin, source scanned from `src/`), custom theme via CSS variables in `src/styles/theme.css`
- **UI primitives**: shadcn/ui (Radix UI) — components in `src/app/components/ui/`
- **Fonts**: Google Fonts — Playfair Display, Source Serif 4, Inter (`src/styles/fonts.css`)

## Ports (DO NOT CHANGE)

| Service | Port | Reason |
|---------|------|--------|
| Frontend (Vite) | **5173** | Vite default, CORS configured for this |
| Backend (FastAPI) | **8000** | uvicorn default, frontend hard-coded to this |

These are **fixed** — never change them in config, CLI args, or env vars.

```sh
# Frontend
cd frontend && pnpm install   # install frontend deps
cd frontend && pnpm dev       # start Vite dev server (port 5173)

# Backend (uses uv for Python deps)
cd backend && uv sync              # install backend deps
cd backend && uv run uvicorn app.main:app --reload --port 8000  # start API server

# One-shot (both services + auto data dir)
./run.sh
```

## Architecture

```
frontend/          # React SPA (Vite)
  src/
    app/           # App component, pages
    components/    # shadcn/ui, BookCard, Sidebar, readers
    components/readers/  # EpubReader, PdfReader, HtmlReader, FileReader
    hooks/         # useBookStatus (SSE + poll fallback)
    services/      # Data layer abstraction + on-device PWA runtime
    styles/        # fonts, tailwind, theme CSS
    assets/        # static assets (figma:asset/ resolves here)
    config/        # api.ts (API_BASE_URL, POLL_INTERVAL_MS)
  public/
    sql-wasm.wasm  # SQLite engine (645 KB, loaded by sql.js)
    icon-192.png   # PWA icons (placeholder)
    icon-512.png

backend/           # FastAPI (Python) — UNTOUCHED
  app/
    main.py        # FastAPI entrypoint, CORS, lifespan
    core/          # config.py (settings), database.py (SQLAlchemy async engine)
    models/        # SQLAlchemy ORM models (Repo, BookGeneration, ImportedBook, ContentSection)
    api/           # REST endpoints (repos, reading, agents, books, imports)
    services/      # GitHub API client (httpx)
    agents/        # CrewAI agent team for book chapter generation
    events.py      # In-process pub/sub for SSE status streaming
  data/            # SQLite database + uploads/ (auto-created)
```

### `frontend/src/services/` — Data Layer

| File | Lines | Purpose |
|------|-------|---------|
| `api.ts` | 138 | `IDataService` interface + factory (`getDataService()`, `switchToLocal()`) |
| `remoteService.ts` | 191 | `RemoteDataService` — 1:1 fetch wrapper for Python backend |
| `localService.ts` | 312 | `LocalDataService` — full on-device implementation (sql.js + OPFS + book generation) |
| `db.ts` | 660 | `BookDatabase` — SQLite via sql.js, 5 tables, full CRUD, book list JOIN |
| `bookGenerator.ts` | 334 | Port of CrewAI pipeline (`crew.py`) to TypeScript: planning → cover → writing → review → publish |
| `githubApi.ts` | 187 | `GitHubApi` — GitHub REST API via browser fetch (readme, issues, repo info) |
| `llmClient.ts` | 60 | `LlmClient` — OpenAI-compatible chat completions via browser fetch |

### Dual-Mode Architecture

The app supports two data access modes, switched via `VITE_DATA_SOURCE` env var:

| Mode | `VITE_DATA_SOURCE` | Backend | Storage | Book Gen |
|------|-------------------|---------|---------|----------|
| **Remote** (default) | `remote` | Python FastAPI server | Server-side SQLite | CrewAI (Python LLM agents) |
| **Local** (on-device) | `local` | None — everything in browser | sql.js + OPFS (browser-native SQLite) | TypeScript pipeline (browser fetch to LLM API) |

- **Strategy pattern**: `IDataService` interface — `RemoteDataService` and `LocalDataService` both implement it
- **Consumer code** calls `getDataService()` (returns `Promise<IDataService>`), never raw `fetch()`
- **Python backend is untouched** — `backend/` has zero changes regardless of mode
- **Timing**: `getDataService()` pre-resolves `RemoteDataService` for remote mode (no async import delay)

### PWA Support

- `vite-plugin-pwa` with Workbox for service worker generation
- Manifest: standalone display, portrait-primary orientation, brown theme (`#5c3d1e`)
- Runtime caching: GitHub API (NetworkFirst), OpenAI API (NetworkOnly), OG images (CacheFirst)
- WASM included in precache glob (`sql-wasm.wasm`)

### Android APK (Self-Contained)

- **`bookshelf.apk`** (1.4 MB): Entire PWA bundled inside WebView via `WebViewAssetLoader`
- Zero network needed — no server, no WiFi, just install and open
- Built with Gradle 8.5 + JDK 17 (`/tmp/bookshelf-apk/` — ephemeral build directory)
- Android manifest: no TWA/remote URLs, all assets loaded from `file:///android_asset/`
- **APK rebuild**: after `pnpm build`, copy `frontend/dist/**` into APK assets, rebuild with Gradle
- **File uploads**: `WebChromeClient#onShowFileChooser()` implemented in `MainActivity.java` to open system file picker for `<input type="file">` elements (WebView does not handle file choosers by default)
- **App icon**: generated via `generate_icons.py` (Pillow), placed in mipmap densities (mdpi–xxxhdpi) + adaptive icon XML
- **Signing**: debug keystore at `app/bookshelf.keystore` (alias: `bookshelf`, password: `bookshelf`)

### Local Dev Mode

```sh
./run-local.sh                    # Start PWA in local mode (VITE_DATA_SOURCE=local)
pnpm dev                          # Standard mode (remote backend needed)
```

- **`run-local.sh`**: sets `VITE_DATA_SOURCE=local`, starts Vite on port 5173, no backend required
- **API keys for local mode** (stored in `localStorage`, set via DevTools):
  - `bookshelf_llm_key` — OpenAI-compatible API key for book generation
  - `bookshelf_llm_url` — LLM API base URL (default: `https://api.openai.com/v1`)
  - `bookshelf_llm_model` — Model name (default: `gpt-4o-mini`)
  - `bookshelf_gh_token` — GitHub token for higher rate limits (optional)

### Key architectural details

- **`@/`** aliases to `./src/` in frontend (vite.config.ts)
- **`figma:asset/filename`** imports resolve to `src/assets/filename` (custom Vite plugin)
- CSS: `fonts.css` → `tailwind.css` → `theme.css` (order matters)
- Tailwind v4 scans from within CSS via `@source`; no tailwind.config file needed
- Theme: warm cream/brown — `background #f5f0e8`, `primary #5c3d1e`, `accent #c17f3a`
- Dark mode via `.dark` class, not media query
- Database auto-creates tables on startup (init_db in lifespan); models auto-discovered via import
- CORS configured for `localhost:5173` by default
- **SSE events**: `app/events.py` — in-process pub/sub via `asyncio.Queue` per `repo_id`. `_status_updater` and direct DB writes publish after commit. `GET /agents/book-status/{repo_id}/stream` subscribes.
- **Data path**: `config.py` uses `DATA_DIR` env var (container-friendly); falls back to `backend/data/` relative path. `extra = "ignore"` on pydantic config for backward compat with old `DATABASE_URL` env var.
- **File uploads**: stored in `backend/data/uploads/`, served via `GET /api/imports/{id}/file` with `inline` Content-Disposition for iframe embedding
- **URL imports**: fetched via `httpx`, `<title>` extracted, stored as `content_text` in `ImportedBook`

### API Routes

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/health` | Health check |
| GET | `/api/repos` | List repos (filter: category, favorite, search) |
| POST | `/api/repos/add` | Add repo from GitHub (by `full_name`) |
| GET | `/api/repos/{id}` | Get repo detail with progress & sections |
| PATCH | `/api/repos/{id}` | Update metadata (category, tags, favorite) |
| DELETE | `/api/repos/{id}` | Remove repo |
| POST | `/api/repos/{id}/fetch-readme` | Fetch README from GitHub |
| GET | `/api/reading/progress/{repo_id}` | Get reading progress |
| POST | `/api/reading/progress` | Update reading progress |
| POST | `/api/agents/generate-book/{repo_id}` | Trigger CrewAI book generation |
| GET | `/api/agents/book-status/{repo_id}` | Get book generation status (polling) |
| GET | `/api/agents/book-status/{repo_id}/stream` | SSE real-time status stream |
| GET | `/api/books` | List all books (join Repo+BookGeneration + ImportedBook) |
| GET | `/api/books/{book_id}` | Get book content (supports generated + imported) |
| GET | `/api/books/by-repo/{repo_id}` | Get book HTML content by repo ID |
| POST | `/api/imports/upload` | Upload file (multipart — epub/pdf/txt/doc/ppt/xlsx/html) |
| POST | `/api/imports/import-url` | Import web page by URL |
| GET | `/api/imports/{id}/file` | Serve uploaded file (inline, for iframe embedding) |
| GET | `/api/imports/{id}/content` | Get imported URL content |

### Import flow

```
ImportDialog → POST /repos/add → POST /repos/{id}/fetch-readme → POST /agents/generate-book/{id}
```

The import dialog automatically triggers agent book generation after fetching the README. The agent runs in background — the book appears on the shelf immediately (status: `writing`) and content becomes available once generation completes (status: `done`).

### Import flow (file upload)

```
ImportDialog (drag-drop) → POST /imports/upload → book appears on shelf → GET /imports/{id}/file for reading
```

Uploaded files are stored in `backend/data/uploads/` and served with `Content-Disposition: inline` for iframe embedding. File type auto-detected from extension.

### Import flow (URL)

```
ImportDialog (URL input) → POST /imports/import-url → book appears on shelf → readable immediately via HtmlReader
```

URLs are fetched server-side via `httpx`, `<title>` extracted as book title, HTML content stored in `ImportedBook.content_text`.

### Book status pipeline

```
pending → fetching → planning → cover → writing → reviewing → publishing → done
                                                                              ↓
                                                                             failed
```

SSE endpoint `GET /agents/book-status/{repo_id}/stream` pushes each status change. Frontend `useBookStatus` hook subscribes with 5s polling fallback on SSE errors. BookDetailModal shows phase-specific labels (e.g., "正在获取仓库文件...", "正在规划章节...").

## Demo books

The `bookData.ts` file contains 13 hardcoded **demo books** (百年孤独, 三体, 设计心理学, etc.) that ship with the prototype. All demo books have `isDemo: true` and render a "示例" badge on covers, cards, and the detail modal to distinguish them from real imported repos.

Real imported books (via `ImportDialog`) get `isDemo: undefined` — no badge rendered.

## Design vs Implementation Gap

The `docs/` directory contains a **Figma-generated prototype** with hardcoded mock book data (`src/app/components/bookData.ts`). The v2 product implements real data layers on top of this design:

- **Real data**: Backend APIs power the shelf with real GitHub repos, uploaded files, and URL imports
- **Mock readers**: Epub/Pdf/Doc/Ppt/Excel readers still use mock data; real content goes through HtmlReader (generated books) or FileReader (uploaded files, iframe embed)
- **Design fidelity**: The warm cream/brown theme, typography, and layout from the prototype are preserved

## Conventions

- **pnpm** only for frontend — no npm or yarn
- Use Tailwind classes over inline styles (prototype has many Figma-export inline styles; prefer Tailwind tokens)
- shadcn/ui components as the UI foundation; avoid adding new UI libraries
- MUI is in the prototype's dependencies but should be removed — shadcn/ui covers the same surface
- Chinese content; use `localeCompare("zh")` for sorting Chinese strings
- Reader components follow the pattern in `ReaderModal.tsx`: one component per document type, dispatched by type
- Backend: async SQLAlchemy with `aiosqlite` driver; use `selectinload` for eager-loading relationships
- Environment: copy `backend/.env.example` to `backend/.env` and configure `GITHUB_TOKEN` and `OPENAI_API_KEY`
- **SSE**: `useBookStatus` hook for real-time status; SSE primary, 5s polling fallback; open only for selected book (detail modal), not shelf-wide
- **Imported books**: use `ImportedBook` model for file uploads and URL imports; `GET /api/books` unions them with repo-generated books via `source_type` field
- **genStatus type**: `"pending" | "fetching" | "planning" | "cover" | "writing" | "reviewing" | "publishing" | "done" | "failed" | "no_book"` — all 10 statuses recognized in UI
- **Progress field**: `book.progress` is reading progress (0–100), NOT generation progress. Never set it based on `status === "done"`
