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
    components/readers/  # ReaderModal (dispatcher) + Epub/Pdf/Html/File/Doc/Ppt/Excel/Txt/Manga readers
    hooks/         # useBookStatus (SSE + poll fallback), useReadingProgress
    services/      # Data layer abstraction + on-device PWA runtime
    utils/         # sanitize.ts (DOMPurify HTML sanitizer)
    styles/        # fonts, tailwind, theme CSS
    assets/        # static assets (figma:asset/ resolves here)
    config/        # api.ts (API_BASE_URL, POLL_INTERVAL_MS)
  public/
    sql-wasm.wasm  # SQLite engine (645 KB, loaded by sql.js)
    icon-192.png   # PWA icons (placeholder)
    icon-512.png

backend/           # FastAPI (Python)
  app/
    main.py        # FastAPI entrypoint, CORS, lifespan, SPA static serving (path-traversal guarded)
    core/          # config.py (settings, reader.db), database.py (async engine, PRAGMA foreign_keys=ON)
    models/        # SQLAlchemy ORM models (Repo, BookGeneration, ImportedBook, ContentSection)
    api/           # REST endpoints (repos, reading, agents, books, imports)
    services/      # GitHub API client (httpx), file_storage (uploads + content persistence)
    agents/        # CrewAI agent team for book chapter generation
    events.py      # In-process pub/sub for SSE status streaming
  data/            # SQLite database (reader.db) + uploads/ (auto-created)
```

> **Note**: the backend was once "untouched" but is no longer — recent security commits
> hardened it (SSRF blocking, upload caps, extension whitelist, path-traversal guard,
> SQLite foreign-key enforcement + cascade deletes, imported-book file cleanup). See
> the **Backend Security Hardening** section below.

### `frontend/src/services/` — Data Layer

| File | Lines | Purpose |
|------|-------|---------|
| `api.ts` | 143 | `IDataService` interface + factory (`getDataService()`, `switchToLocal()`) |
| `remoteService.ts` | 197 | `RemoteDataService` — 1:1 fetch wrapper for Python backend |
| `localService.ts` | 424 | `LocalDataService` — full on-device implementation (sql.js + OPFS + book generation) |
| `db.ts` | 840 | `BookDatabase` — SQLite via sql.js, 5 tables, full CRUD, book list JOIN |
| `bookGenerator.ts` | 334 | Port of CrewAI pipeline (`crew.py`) to TypeScript: planning → cover → writing → review → publish |
| `githubApi.ts` | 196 | `GitHubApi` — GitHub REST API via browser fetch (readme, issues, repo info) |
| `llmClient.ts` | 60 | `LlmClient` — OpenAI-compatible chat completions via browser fetch |

### Dual-Mode Architecture

The app supports two data access modes, switched via `VITE_DATA_SOURCE` env var:

| Mode | `VITE_DATA_SOURCE` | Backend | Storage | Book Gen |
|------|-------------------|---------|---------|----------|
| **Remote** (default) | `remote` | Python FastAPI server | Server-side SQLite | CrewAI (Python LLM agents) |
| **Local** (on-device) | `local` | None — everything in browser | sql.js + OPFS (browser-native SQLite) | TypeScript pipeline (browser fetch to LLM API) |

- **Strategy pattern**: `IDataService` interface — `RemoteDataService` and `LocalDataService` both implement it
- **Consumer code** calls `getDataService()` (returns `Promise<IDataService>`), never raw `fetch()`
- **Mode-agnostic backend** — `backend/` behaves identically regardless of which frontend mode is selected (local mode simply never calls it)
- **Timing**: `getDataService()` pre-resolves `RemoteDataService` for remote mode (no async import delay)

### PWA Support

- `vite-plugin-pwa` with Workbox for service worker generation
- Manifest: standalone display, portrait-primary orientation, brown theme (`#5c3d1e`)
- Runtime caching: GitHub API (NetworkFirst), OpenAI API (NetworkOnly), OG images (CacheFirst)
- WASM included in precache glob (`sql-wasm.wasm`)

### Android APK (Self-Contained)

- **`bookshelf.apk`** (1.3 MB): Entire PWA bundled inside WebView
- Zero network needed — no server, no WiFi, just install and open
- Android manifest: `package="io.sisyphus.bookshelf"`, `android:icon="@mipmap/ic_launcher"`, `android:label="@string/app_name"` (= "电子书架" in `res/values/strings.xml`), `Theme.NoTitleBar` (no action bar), minSdkVersion 21, targetSdkVersion 34
- All assets loaded from `file:///android_asset/` via `WebViewAssetLoader`
- **File uploads**: `WebChromeClient#onShowFileChooser()` implemented in `MainActivity.java` to open system file picker for `<input type="file">` elements (WebView does not handle file choosers by default)
- **Signing**: debug keystore at `/tmp/bookshelf.keystore` (alias: `bookshelf`, password: `bookshelf`)

#### Android Dev Environment (WSL + Windows SDK)

Android SDK tools live on the Windows side (`D:\Android\Sdk\`) — accessed from WSL via `/mnt/d/Android/Sdk/`.

| Tool | Path | Purpose |
|------|------|---------|
| `aapt2.exe` | `/mnt/d/Android/Sdk/build-tools/36.1.0/aapt2.exe` | Compile/link resources, build APK from source |
| `adb.exe` | `/mnt/d/Android/Sdk/platform-tools/adb.exe` | Device/emulator management, install, shell |
| `apksigner.jar` | `/mnt/d/Android/Sdk/build-tools/36.1.0/lib/apksigner.jar` | Sign APKs (v1+v2+v3) |
| `android.jar` | `/mnt/d/Android/Sdk/platforms/android-36.1/android.jar` | Compile-time Android framework stub |
| `dexdump.exe` | `/mnt/d/Android/Sdk/build-tools/36.1.0/dexdump.exe` | Dump dex bytecode |
| `d8.jar` | `/mnt/d/Android/Sdk/build-tools/36.1.0/lib/d8.jar` | Compile `.class` → `classes.dex` |

**IMPORTANT**: Windows binaries (`aapt2.exe`, `adb.exe`, etc.) cannot access WSL-native paths (`/tmp/`, `/home/`). Always copy files to Linux-native paths before passing to them, or use Windows paths (`D:\temp\`, `C:\Users\`).

**Emulator**: Android emulator `emulator-5556` (x86_64, API 36).

```sh
# List devices
/mnt/d/Android/Sdk/platform-tools/adb.exe devices

# Screenshot from emulator
/mnt/d/Android/Sdk/platform-tools/adb.exe -s emulator-5556 shell screencap -p /sdcard/screen.png
/mnt/d/Android/Sdk/platform-tools/adb.exe -s emulator-5556 pull /sdcard/screen.png /tmp/screen.png

# UI hierarchy dump (check visible text without image analysis)
/mnt/d/Android/Sdk/platform-tools/adb.exe -s emulator-5556 shell uiautomator dump /sdcard/ui.xml
/mnt/d/Android/Sdk/platform-tools/adb.exe -s emulator-5556 pull /sdcard/ui.xml /tmp/ui.xml

# Install/launch
/mnt/d/Android/Sdk/platform-tools/adb.exe -s emulator-5556 install -r <apk_path>
/mnt/d/Android/Sdk/platform-tools/adb.exe -s emulator-5556 shell am start -n io.sisyphus.bookshelf/.MainActivity
```

#### APK Build Procedure (aapt2-based, NOT zip-repack)

The correct way to rebuild `bookshelf.apk` is from source via `aapt2`, **not** by repacking the old binary zip. Repacking causes silent resource linking failures (icon, labels, etc.) because `resources.arsc` must be compiled together with the manifest.

**Assets directory** at `/tmp/apk-repack/assets/` contains the `pnpm build` output (`index.html`, JS/CSS bundles, `sql-wasm.wasm`, PWA icons, service worker). **Real dex** at `/tmp/apk-repack/classes.dex` (2.6 MB, from original Gradle build — contains `MainActivity` with WebView + `WebChromeClient`).

**Build steps:**

```sh
# 0. Prepare manifest and icon resources
TESTDIR=/tmp/icon-test   # manifest at $TESTDIR/manifest/AndroidManifest.xml
                          # icons at $TESTDIR/res/mipmap-*/ic_launcher.png
                          # adaptive icon at $TESTDIR/res/mipmap-anydpi-v26/ic_launcher.xml
                          # foreground drawable at $TESTDIR/res/drawable/ic_launcher_foreground.png

# 1. Copy android.jar to Linux path (Windows binary can't read WSL paths)
cp /mnt/d/Android/Sdk/platforms/android-36.1/android.jar /tmp/android.jar

# 2. Compile resources to .flat files
SDK=/mnt/d/Android/Sdk BJ=$SDK/build-tools/36.1.0
$BJ/aapt2.exe compile -o $TESTDIR/flat --dir $TESTDIR/res

# 3. Link into base APK (manifest + compiled resources + android.jar)
$BJ/aapt2.exe link -o $TESTDIR/out/base.apk \
  --manifest $TESTDIR/manifest/AndroidManifest.xml \
  -R $TESTDIR/flat/*.flat \
  -I /tmp/android.jar \
  --auto-add-overlay

# 4. Inject real dex + assets into base APK (Python zipfile)
#    - Replace template classes.dex with real 2.6 MB dex
#    - Add all assets from /tmp/apk-repack/assets/
#    - resources.arsc must be ZIP_STORED (uncompressed) for Android R+

# 5. Sign (v1+v2+v3)
java -jar $BJ/lib/apksigner.jar sign \
  --ks /tmp/bookshelf.keystore \
  --ks-pass pass:bookshelf \
  --ks-key-alias bookshelf \
  --key-pass pass:bookshelf \
  --out bookshelf.apk \
  /tmp/bookshelf-unsigned.apk
```

**Icon generation**: `generate_icons.py` (Pillow-based) creates icons at 5 mipmap densities (mdpi=48px through xxxhdpi=192px) + adaptive icon foreground (512px) + `mipmap-anydpi-v26/ic_launcher.xml`.

**Manifest template** (`$TESTDIR/manifest/AndroidManifest.xml`):
```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="io.sisyphus.bookshelf">
    <uses-sdk android:minSdkVersion="21" android:targetSdkVersion="34"/>
    <application
        android:icon="@mipmap/ic_launcher"
        android:allowBackup="true"
        android:supportsRtl="true">
        <activity
            android:name=".MainActivity"
            android:theme="@android:style/Theme.NoTitleBar"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN"/>
                <category android:name="android.intent.category.LAUNCHER"/>
            </intent-filter>
        </activity>
    </application>
</manifest>
```

**Critical: NEVER use zip-repack for the binary manifest/resources.arsc**. `resources.arsc` must be compiled by `aapt2 link` together with the manifest — manual binary patching of the manifest does NOT update the resource table, causing Android to silently ignore the icon, theme, and label attributes.

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

### Backend Security Hardening

The backend was hardened by a series of security commits (it is no longer "untouched"):

- **`fix(db)` 33e4f60** — `database.py` sets `PRAGMA foreign_keys=ON` per connection; `BookGeneration` cascades on repo delete
- **`fix(imports)` 7aeefd2** — `imports.py`: SSRF guard (rejects non-http(s) schemes, `localhost`/`0.0.0.0`/`::1`, and any `is_private`/`is_loopback`/`is_link_local`/`is_reserved`/`is_multicast`/`is_unspecified` IP), `MAX_UPLOAD_SIZE = 50 MB` streamed in 1 MB chunks, extension whitelist enforced against `FILE_TYPE_MAP`
- **`fix(spa)` 82cf09f** — `main.py` SPA static serving guards against path traversal
- **`fix(repos)` 0c6e02a** — imported-book deletion removes the on-disk upload file
- **`fix(config)` 2f4019b** — debug defaults to `False`

**File-serve headers** (`GET /imports/{id}/file`, set in `imports.py`):

```
X-Content-Type-Options: nosniff
Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; img-src data: https: http:; sandbox
Content-Disposition: inline
```

The `sandbox` directive (no `allow-scripts`/`allow-same-origin`) means the served file runs in an opaque-origin, script-disabled iframe — uploaded HTML cannot execute scripts or reach the parent window.

**`FILE_TYPE_MAP`** (extension → `file_type` stored in DB):

| Extensions | `file_type` |
|------------|-------------|
| `.epub` | `epub` |
| `.pdf` | `pdf` |
| `.txt`, `.md` | `txt` |
| `.doc`, `.docx` | `doc` |
| `.ppt`, `.pptx` | `ppt` |
| `.xls` | `xls` |
| `.xlsx` | `xlsx` |
| `.html`, `.htm` | `html` |

> The DB `file_type` strings (`doc`/`xls`/`xlsx`/`ppt`) differ from the frontend `BookType`
> enum (`word`/`excel`/`ppt`). `App.tsx` maps them via `FILE_TYPE_TO_BOOK_TYPE` / `toBookType()`;
> a raw cast crashes `typeConfig[book.type]`. Keep the mapping in sync when adding types.

**Content persistence**: only URL imports save extracted HTML via `save_import_content()`. Binary uploads (epub/pdf/docx/…) store just the raw file on disk; `load_import_content()` returns `None` for them.

### HTML Sanitization

`frontend/src/utils/sanitize.ts` wraps DOMPurify (`sanitizeHtml()`) to strip `<script>`, event-handler attributes, `javascript:` URLs, and dangerous tags before rendering untrusted HTML into a same-origin iframe. Consumers: `HtmlReader.tsx`, `DocReader.tsx`, `FileReader.tsx`.

### Reading Progress

- **`useReadingProgress(bookId)`** hook — debounced (500ms) save with unmount flush via `useEffect` cleanup
- **Scroll tracking**: `HtmlReader` and `FileReader` listen to iframe scroll events, compute position as `scrollTop / (scrollHeight - clientHeight)`
- **Persistence**: `useReadingProgress.save()` → `IDataService.updateReadingProgress()` → POST `/api/reading/progress` → `reading_progress` table
- **BookCard display**: progress bar shown when `book.progress > 0 && book.type !== "pdf"` (PDF progress hidden since Chrome's built-in viewer is sealed)
- **Backend**: `/api/books` returns `progress` (latest `reading_progress.position` by `updated_at`) and `progress_metadata`
- **Multiple progress rows**: reading_progress table appends rows (no unique constraint); `/api/books` picks max by `updated_at`

### E2E Tests — **ALWAYS verify with Playwright**

> **HARD RULE**: After ANY frontend change that affects UI behavior, data flow, or API integration, **run `npx playwright` tests to verify**. Never ship without Playwright confirmation. This is the project's primary verification mechanism.

```sh
cd frontend && npx playwright test              # all specs (CI mode)
cd frontend && npx playwright test --headed     # visible browser (debugging)
npx playwright test <spec> --reporter=line      # single spec, compact output
npx playwright test --headed <spec>             # single spec, visible browser
```

- **Config**: `playwright.config.ts` — testDir `tests/e2e`, 30s timeout, 1 retry, system Chrome via `executablePath`
- **Web server**: reuses existing Vite on port 5173 (`reuseExistingServer: true`)
- **Spec files**: `bookshelf.spec.ts` (layout, view toggle, search, sort, detail modal, import validation, progress smoke), `reader-interactions.spec.ts` (tap/swipe/scroll per reader), `reader-topbar-toggle.spec.ts` (center-tap topbar toggle across all reader types, real uploaded fixtures), `readers-local.spec.ts`, `readers-remote.spec.ts`, `youtube-import.spec.ts` (dialog UI, API integration, already_done flow)
- **Smoke test tip**: use `waitUntil: "domcontentloaded"` — `waitUntil: "load"` blocks on OpenGraph cover images (8.5s each)

#### Smoke Test Practices

1. All test cases simulate human UI interactions. Do not use API mocking (`page.route`) or `page.goto` to bypass the UI — interact through the page like a real user.
2. Do not increase or add `waitForTimeout` without justification. When a test hangs or times out, add debug logs (`console.log`) to identify the exact stuck step before touching any timeout.
3. When adding new features, add corresponding Playwright tests covering happy path, edge cases, and error states. Prefer real API calls with `page.route()` mocks over fake data.
4. For visual verification of specific elements, use `console.log` + `innerText()` — do NOT rely on screenshots alone; model image support varies.

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
- **Mock readers**: Epub/Pdf/Doc/Ppt/Excel readers still render mock/demo data; real generated books go through `HtmlReader` (same-origin srcDoc + sanitize). Uploaded files go through `FileReader` — HTML is fetched, DOMPurify-sanitized, and rendered via same-origin `srcDoc` (so the center-tap topbar script runs); binary files (pdf/epub/…) embed the sandboxed backend file URL directly.
- **Design fidelity**: The warm cream/brown theme, typography, and layout from the prototype are preserved

## Conventions

- **pnpm** only for frontend — no npm or yarn
- Use Tailwind classes over inline styles (prototype has many Figma-export inline styles; prefer Tailwind tokens)
- shadcn/ui components as the UI foundation; avoid adding new UI libraries
- MUI is in the prototype's dependencies but should be removed — shadcn/ui covers the same surface
- Chinese content; use `localeCompare("zh")` for sorting Chinese strings
- Reader components follow the pattern in `ReaderModal.tsx`: one component per document type, dispatched by `book.type` (and `sourceType` for HTML). Untrusted HTML is DOMPurify-sanitized and rendered via same-origin `srcDoc` so the center-tap topbar script can run; the parent listens for the `reader-center-tap` `postMessage`
- Backend: async SQLAlchemy with `aiosqlite` driver; use `selectinload` for eager-loading relationships
- Environment: copy `backend/.env.example` to `backend/.env` and configure `GITHUB_TOKEN` and `OPENAI_API_KEY`
- **SSE**: `useBookStatus` hook for real-time status; SSE primary, 5s polling fallback; open only for selected book (detail modal), not shelf-wide
- **Imported books**: use `ImportedBook` model for file uploads and URL imports; `GET /api/books` unions them with repo-generated books via `source_type` field
- **genStatus type**: `"pending" | "fetching" | "planning" | "cover" | "writing" | "reviewing" | "publishing" | "done" | "failed" | "no_book"` — all 10 statuses recognized in UI
- **Progress field**: `book.progress` is reading progress (0–100), NOT generation progress. Never set it based on `status === "done"`
