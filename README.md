# 电子书架 · Cloud Shelf

将技术内容变成一本本可以翻阅的「电子书」——收藏、整理、阅读你的数字书架。

Import GitHub repos, upload files, or fetch web pages as "books" on a digital shelf — organize, track reading progress, and read AI-generated chapter summaries.

> This README is the **detailed reference** for the project. `AGENTS.md` holds the
> high-level rules, principles, and practices, linking back to the sections here.

---

## 功能 · Features

- **📚 书架界面** — 网格/列表视图，分类筛选，搜索，收藏，最近阅读
- **📥 多类型导入** — GitHub 仓库 / 本地文件 (epub/pdf/txt/doc/ppt/xlsx/html) / 网页链接 / YouTube 视频
- **🤖 AI 书籍生成** — CrewAI 多智能体将 GitHub 仓库编排为章节式电子书
- **📖 在线阅读** — 支持 HTML/Markdown 内容格式，PDF/图片内嵌 iframe 阅读
- **📊 实时状态** — SSE 推送书籍生成进度，轮询兜底
- **📊 阅读进度** — 自动记录每本书的阅读进度
- **🐳 Docker 部署** — 多服务编排，支持热重载开发模式，开箱即用
- **🚀 一键启动** — `./run.sh` 本地双服务并行启动
- **📱 PWA + Android APK** — 离线可用，自包含 APK 零网络运行

---

## 技术栈 · Tech Stack

| 层 | 技术 |
|---|---|
| **前端** | React 18 + TypeScript, Vite 6, Tailwind CSS v4 (`@tailwindcss/vite`), shadcn/ui (Radix), pnpm |
| **后端** | Python 3.11+, FastAPI, SQLAlchemy (async, `aiosqlite`), SQLite |
| **AI** | CrewAI 多智能体 (Chapter Researcher + Chapter Writer) |
| **字体** | Google Fonts — Playfair Display, Source Serif 4, Inter |
| **部署** | Docker Compose (multi-service) |

---

## 快速开始 · Quick Start

### 前置要求

- Node.js 18+ & [pnpm](https://pnpm.io/installation) 10+
- Python 3.11+ & [uv](https://docs.astral.sh/uv/)
- LLM API Key（OpenAI 兼容接口，如 DeepSeek、OpenAI 等）
- GitHub Token（可选，提升 API 速率限制）

### 本地开发

```sh
# 一键启动（推荐）
./run.sh                    # 后端 :8000 + 前端 :5173

# 或手动分别启动
# 1. 后端
cd backend
cp .env.example .env       # 编辑 .env，填入 LLM_API_KEY
uv sync
uv run uvicorn app.main:app --reload --port 8000

# 2. 前端（新终端）
cd frontend
pnpm install
pnpm dev                    # http://localhost:5173
```

配置环境变量 `backend/.env` 后再运行。`./run.sh` 自动处理数据目录（本地默认 `backend/data/`，容器可通过 `DATA_DIR` 指定）。

> **端口固定（DO NOT CHANGE）**：前端 Vite `5173`（CORS 已配置），后端 FastAPI `8000`（前端硬编码）。不要在 config、CLI 参数或环境变量中修改它们。

### 本地纯前端模式（On-device / Local mode）

```sh
./run-local.sh             # VITE_DATA_SOURCE=local，Vite :5173，无需后端
pnpm dev                   # 标准模式（需要远程后端）
```

`run-local.sh` 将数据层切到浏览器内的 sql.js + OPFS，书籍生成走 TypeScript 管线（浏览器 fetch LLM）。详见 [Dual-Mode Architecture](#dual-mode-architecture)。本地模式的 API key 存于 `localStorage`（DevTools 设置）：

- `bookshelf_llm_key` — OpenAI 兼容 API key
- `bookshelf_llm_url` — LLM API base URL（默认 `https://api.openai.com/v1`）
- `bookshelf_llm_model` — 模型名（默认 `gpt-4o-mini`）
- `bookshelf_gh_token` — GitHub token（可选）

### Docker 快速启动

```sh
# 1. 配置环境变量
cp backend/.env.example backend/.env
# 编辑 backend/.env，填入 LLM_API_KEY 和 GITHUB_TOKEN

# 2. 启动（生产模式 — nginx + uvicorn）
docker compose up -d --build

# 3. 验证
curl http://localhost:8000/api/health   # 后端
curl http://localhost/                  # 前端 (nginx:80)
```

---

## 架构 · Architecture

### 目录结构 · Directory Layout

```
frontend/          # React SPA (Vite)
  src/
    app/           # App.tsx + components/ + hooks/
      components/  # shadcn/ui, BookCard, BookCover, BookDetailModal, Sidebar, CategoryManager, CategoryPicker, readers/
        readers/   # ReaderModal (dispatcher) + Epub/Pdf/Html/File/Doc/Ppt/Excel/Txt/Manga readers
      hooks/       # useBookStatus (SSE + poll fallback), useReadingProgress
    services/      # Data layer abstraction + on-device PWA runtime
    utils/         # sanitize.ts (DOMPurify HTML sanitizer)
    styles/        # fonts, tailwind, theme CSS
    config/        # api.ts (API_BASE_URL, POLL_INTERVAL_MS)
    main.tsx       # entrypoint
  public/
    sql-wasm.wasm  # SQLite engine (645 KB, loaded by sql.js)
    icon-192.png   # PWA icons (placeholder)
    icon-512.png

backend/           # FastAPI (Python)
  app/
    main.py        # FastAPI entrypoint, CORS, lifespan, SPA static serving (path-traversal guarded)
    core/          # config.py (settings, reader.db), database.py (async engine, PRAGMA foreign_keys=ON)
    models/        # SQLAlchemy ORM (repo.py: Repo, ReadingProgress, ContentSection, BookGeneration; imported_book.py; category.py; bookmark.py)
    api/           # REST endpoints (repos, reading, agents, books, imports, youtube, categories, bookmarks, schemas)
    services/      # github (httpx), file_storage, cover_extractor, cover_renderer, youtube
    agents/        # CrewAI agent team for book chapter generation
    utils/         # slugify.py (category key generation from label)
    events.py      # In-process pub/sub for SSE status streaming
  data/            # SQLite database (reader.db) + uploads/ (auto-created)
```

### Key architectural details

- **`@/`** aliases to `./src/` in frontend (`vite.config.ts`)
- **`figma:asset/filename`** imports resolve to `src/assets/filename` (custom Vite plugin)
- CSS load order matters: `fonts.css` → `tailwind.css` → `theme.css`
- Tailwind v4 scans from within CSS via `@source`; **no `tailwind.config` file** needed
- Theme: warm cream/brown — `background #f5f0e8`, `primary #5c3d1e`, `accent #c17f3a`
- Dark mode via `.dark` class, **not** media query
- Database auto-creates tables on startup (`init_db` in lifespan); models auto-discovered via import
- CORS configured for `localhost:5173` by default
- **Data path**: `config.py` uses `DATA_DIR` env var (container-friendly); falls back to `backend/data/` relative path. `extra = "ignore"` on pydantic config for backward compat with the old `DATABASE_URL` env var.

### `frontend/src/services/` — Data Layer

| File | Purpose |
|------|---------|
| `api.ts` | `IDataService` interface + factory (`getDataService()`, `switchToLocal()`, `resetDataService()`) |
| `remoteService.ts` | `RemoteDataService` — 1:1 fetch wrapper for Python backend |
| `localService.ts` | `LocalDataService` — full on-device implementation (sql.js + OPFS + book generation) |
| `db.ts` | `BookDatabase` — SQLite via sql.js, 7 tables, full CRUD, book list JOIN |
| `bookGenerator.ts` | Port of CrewAI pipeline (`crew.py`) to TypeScript: planning → cover → writing → review → publish |
| `githubApi.ts` | `GitHubApi` — GitHub REST API via browser fetch (readme, issues, repo info) |
| `llmClient.ts` | `LlmClient` — OpenAI-compatible chat completions via browser fetch |

### Dual-Mode Architecture

The app supports two data access modes, switched via the `VITE_DATA_SOURCE` env var:

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

---

## Android APK (Self-Contained)

- **`bookshelf.apk`** (1.3 MB): Entire PWA bundled inside WebView
- Zero network needed — no server, no WiFi, just install and open
- Android manifest: `package="io.sisyphus.bookshelf"`, `android:icon="@mipmap/ic_launcher"`, `android:label="@string/app_name"` (= "电子书架" in `res/values/strings.xml`), `Theme.NoTitleBar` (no action bar), minSdkVersion 21, targetSdkVersion 34
- All assets loaded from `file:///android_asset/` via `WebViewAssetLoader`
- **File uploads**: `WebChromeClient#onShowFileChooser()` implemented in `MainActivity.java` to open the system file picker for `<input type="file">` elements (WebView does not handle file choosers by default)
- **Signing**: debug keystore at `/tmp/bookshelf.keystore` (alias: `bookshelf`, password: `bookshelf`)

### Android Dev Environment (WSL + Windows SDK)

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

### APK Build Procedure (aapt2-based, NOT zip-repack)

The correct way to rebuild `bookshelf.apk` is from source via `aapt2`, **not** by repacking the old binary zip. Repacking causes silent resource linking failures (icon, labels, etc.) because `resources.arsc` must be compiled together with the manifest.

**Assets directory** at `/tmp/apk-repack/assets/` contains the `pnpm build` output (`index.html`, JS/CSS bundles, `sql-wasm.wasm`, PWA icons, service worker). **Real dex** at `/tmp/apk-repack/classes.dex` (2.6 MB, from the original Gradle build — contains `MainActivity` with WebView + `WebChromeClient`).

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

**Critical: NEVER use zip-repack for the binary manifest/`resources.arsc`**. `resources.arsc` must be compiled by `aapt2 link` together with the manifest — manual binary patching of the manifest does NOT update the resource table, causing Android to silently ignore the icon, theme, and label attributes.

---

## 后端安全加固 · Backend Security Hardening

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

---

## Reading Progress

- **`useReadingProgress(bookId)`** hook — debounced (500ms) save with unmount flush via `useEffect` cleanup
- **Scroll tracking**: `HtmlReader` and `FileReader` listen to iframe scroll events, compute position as `scrollTop / (scrollHeight - clientHeight)`
- **Persistence**: `useReadingProgress.save()` → `IDataService.updateReadingProgress()` → POST `/api/reading/progress` → `reading_progress` table
- **BookCard display**: progress bar shown when `book.progress > 0` (both list and grid layouts)
- **Backend**: `/api/books` returns `progress` (latest `reading_progress.position` by `updated_at`) and `progress_metadata`
- **Multiple progress rows**: `reading_progress` appends rows (no unique constraint); `/api/books` picks max by `updated_at`
- **`book.progress`** is reading progress (0–100), **NOT** generation progress. Never set it based on `status === "done"`.

---

## Categories — Label-Based Membership (runtime-managed)

Categories are **runtime-manageable** (created/edited/deleted via the UI) and membership is computed by **label matching**, not a stored per-book category field.

- **Model** (`backend/app/models/category.py`): `Category` has `key` (slug, unique), `label` (display name), `icon`, `color`, `labels: list[str]` (JSON), `sort_order`, `is_system`. `key` is generated from `label` via `app/utils/slugify.py` (`[^a-z0-9]+ → -`; falls back to `cat-<uuid8>` for non-ASCII labels like Chinese).
- **Membership semantics**: a book belongs to a category when **any** of the book's `tags` matches **any** of the category's defining `labels`. Multi-membership is allowed. A category with **empty `labels` matches nothing** (except `uncategorized`, handled client-side).
- **`SYSTEM_CATEGORIES`** (seeded, `is_system=True`, cannot be deleted): `generated` (labels `["AI 生成"]`), `documents` (`["文档资料"]`), `imported` (`["导入内容"]`), `youtube` (`["视频"]`), `uncategorized` (`[]`, sort_order 90).
- **Import-time tag injection** (so books auto-join system categories): uploads tagged `导入内容`, youtube tagged `视频`, documents tagged `文档资料`, generated tagged `AI 生成`. Keep these in sync with `SYSTEM_CATEGORIES` labels.
- **Frontend membership** (`App.tsx` `bookMatchesCategory(book, key, categoryList)`): drives shelf filtering and per-category counts. The legacy `book.category` field is **vestigial** — never filter on it.
- **`POST/PATCH /api/categories`** validates non-empty label + case-insensitive label/key uniqueness (409 on dup). **`DELETE`** is blocked for system categories (403); deleting a custom category reassigns the stale `Repo.category`/`ImportedBook.category` strings to `uncategorized`.
- **Components**: `CategoryManager.tsx` (create/edit/delete dialog — create form is **collapsed by default** behind a "+ 新建分类" ghost button; uses a LabelPicker with suggestion chips). `CategoryPicker.tsx` (mobile category selector). The per-book category `<select>` was **removed** from `BookDetailModal.tsx` — books are organized purely by editing their tags + category labels.
- **Per-book tags**: `BookDetailModal` edits a book's `tags` (free-form, with quick-select chips of existing labels). Tags are what category labels match against.

---

## API 端点 · API Endpoints

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
| GET | `/api/books/{book_id}/cover` | Get book cover image |
| PATCH | `/api/books/{repo_id}` | Update book metadata |
| DELETE | `/api/books/{repo_id}` | Delete book |
| POST | `/api/imports/upload` | Upload file (multipart — epub/pdf/txt/doc/ppt/xlsx/html) |
| POST | `/api/imports/import-url` | Import web page by URL |
| GET | `/api/imports/{id}/file` | Serve uploaded file (inline, for iframe embedding) |
| GET | `/api/imports/{id}/content` | Get imported URL content |
| POST | `/api/youtube/generate-book` | Generate book from YouTube video |
| GET | `/api/youtube/book-status/{repo_id}` | YouTube book generation status (polling) |
| GET | `/api/youtube/book-status/{repo_id}/stream` | SSE YouTube book status stream |
| GET | `/api/categories` | List categories |
| POST | `/api/categories` | Create category |
| PATCH | `/api/categories/{category_id}` | Update category |
| DELETE | `/api/categories/{category_id}` | Delete category |
| GET | `/api/bookmarks/{book_id}` | List bookmarks for a book |
| POST | `/api/bookmarks` | Create bookmark |
| DELETE | `/api/bookmarks/{bookmark_id}` | Delete bookmark |

### Import flow (GitHub)

```
ImportDialog → POST /repos/add → POST /repos/{id}/fetch-readme → POST /agents/generate-book/{id}
```

The import dialog automatically triggers agent book generation after fetching the README. The agent runs in the background — the book appears on the shelf immediately (status: `writing`) and content becomes available once generation completes (status: `done`).

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

SSE endpoint `GET /agents/book-status/{repo_id}/stream` pushes each status change. The frontend `useBookStatus` hook subscribes with 5s polling fallback on SSE errors. `BookDetailModal` shows phase-specific labels (e.g., "正在获取仓库文件...", "正在规划章节...").

- **SSE internals**: `app/events.py` — in-process pub/sub via `asyncio.Queue` per `repo_id`. `_status_updater` and direct DB writes publish after commit.
- **genStatus type**: `"pending" | "fetching" | "planning" | "cover" | "writing" | "reviewing" | "publishing" | "done" | "failed" | "no_book"` — all 10 statuses recognized in UI.
- **Imported books**: use the `ImportedBook` model for file uploads and URL imports; `GET /api/books` unions them with repo-generated books via the `source_type` field.

---

## E2E Tests — Playwright

> The full Playwright workflow and HARD RULES (when to run the full suite vs. a single
> targeted spec) live in `AGENTS.md`. This section documents the test surface.

```sh
cd frontend && npx playwright test              # all specs (CI mode)
cd frontend && npx playwright test --headed     # visible browser (debugging)
npx playwright test <spec> --reporter=line      # single spec, compact output
npx playwright test --headed <spec>             # single spec, visible browser
```

- **Config**: `playwright.config.ts` — testDir `tests/e2e`, 30s timeout, 1 retry, system Chrome via `executablePath`
- **Web server**: reuses existing Vite on port 5173 (`reuseExistingServer: true`)
- **Spec files**: `bookshelf.spec.ts` (layout, view toggle, search, sort, detail modal, import validation, progress smoke, category filter + management, per-book tags, mobile category UI, iPhone SE header), `reader-interactions.spec.ts` (tap/swipe/scroll per reader), `reader-topbar-toggle.spec.ts` (center-tap topbar toggle across all reader types, real uploaded fixtures), `readers-local.spec.ts`, `readers-remote.spec.ts`, `youtube-import.spec.ts` (dialog UI, API integration, already_done flow), `bookmarks.spec.ts`, `cover-fallback.spec.ts`, `cover-integration.spec.ts`, `cover-real.spec.ts`, `epub-progress.spec.ts`, `pdf-progress.spec.ts`, `recent-reading.spec.ts`
- **Smoke test tip**: use `waitUntil: "domcontentloaded"` — `waitUntil: "load"` blocks on OpenGraph cover images (8.5s each)

### Smoke Test Practices

1. All test cases simulate human UI interactions. Do not use API mocking (`page.route`) or `page.goto` to bypass the UI — interact through the page like a real user.
2. Do not increase or add `waitForTimeout` without justification. When a test hangs or times out, add debug logs (`console.log`) to identify the exact stuck step before touching any timeout.
3. When adding new features, add corresponding Playwright tests covering happy path, edge cases, and error states. Prefer real API calls with `page.route()` mocks over fake data.
4. For visual verification of specific elements, use `console.log` + `innerText()` — do NOT rely on screenshots alone; model image support varies.

---

## Demo books

`bookData.ts` contains 13 hardcoded **demo books** (百年孤独, 三体, 设计心理学, etc.) that ship with the prototype. All demo books have `isDemo: true` and render a "示例" badge on covers, cards, and the detail modal to distinguish them from real imported repos. Real imported books (via `ImportDialog`) get `isDemo: undefined` — no badge rendered.

## Design vs Implementation Gap

The `docs/` directory contains a **Figma-generated prototype** (`docs/电子书架.zip`) with hardcoded mock book data (`src/app/components/bookData.ts`). The v2 product implements real data layers on top of this design:

- **Real data**: Backend APIs power the shelf with real GitHub repos, uploaded files, and URL imports
- **Mock readers**: Epub/Pdf/Doc/Ppt/Excel readers still render mock/demo data; real generated books go through `HtmlReader` (same-origin srcDoc + sanitize). Uploaded files go through `FileReader` — HTML is fetched, DOMPurify-sanitized, and rendered via same-origin `srcDoc` (so the center-tap topbar script runs); binary files (pdf/epub/…) embed the sandboxed backend file URL directly.
- **Design fidelity**: The warm cream/brown theme, typography, and layout from the prototype are preserved
- **Reader pattern**: one component per document type, dispatched by `book.type` (and `sourceType` for HTML) in `ReaderModal.tsx`. The parent listens for the `reader-center-tap` `postMessage` from the same-origin srcDoc iframe.

---

## Docker 部署 · Docker Deployment

### 架构

```
            Docker Network
   ┌──────────┐         ┌──────────┐
   │ frontend │ ──proxy─│ backend  │
   │ nginx:80 │  /api/  │ uvicorn  │
   │          │         │ :8000    │
   └──────────┘         └──────────┘
        ↑                    ↑
   http://localhost    http://localhost:8000
```

### 生产模式

```sh
docker compose up -d --build
```

Nginx 提供前端静态文件，`/api/` 请求反向代理到后端。数据持久化在 Docker volume `backend_data`。

### 开发模式（热重载）

```sh
docker compose -f docker-compose.dev.yml up --build
```

- **前端**: Vite dev server + HMR，`src/` 目录挂载为 volume，代码改动即时生效
- **后端**: uvicorn `--reload`，`app/` 目录挂载为 volume

### 端口映射

| 服务 | 容器端口 | 宿主机端口 | 说明 |
|------|---------|-----------|------|
| 前端 (nginx) | 80 | 80 | 静态文件 + API 代理 |
| 后端 (uvicorn) | 8000 | 8000 | REST API + Swagger 文档 |

修改 `docker-compose.yml` 中的端口映射即可自定义。

---

## 配置 · Configuration

`backend/.env`:

```ini
# 必需 — LLM 配置 (OpenAI 兼容接口)
LLM_API_KEY=sk-xxx                          # API 密钥
LLM_BASE_URL=https://api.deepseek.com       # API 地址
LLM_MODEL=deepseek-v4-flash                 # 模型名称

# 可选 — GitHub Token（提升速率限制 60→5000 req/hr）
GITHUB_TOKEN=ghp_xxx

# 可选 — 书籍生成参数
BOOK_LANGUAGE=zh                            # 生成语言
BOOK_MAX_CHAPTERS=16                        # 最大章节数
LLM_MAX_PARALLEL_CHAPTERS=3                 # 并行生成章节数

# 后端配置
DATA_DIR=                                    # 数据目录（留空 = 自动检测 backend/data/）
CORS_ORIGINS=["http://localhost:5173"]
PORT=8000
```

---

## 部署到远程服务器 · Remote Deployment

### 前提

1. 远程服务器已安装 Docker & Docker Compose
2. SSH 免密登录（或密码 + sshpass）
3. 服务器能访问外网（或配置 Docker 镜像加速器）

### 1. 推送代码

```sh
# 方式 A: Git
git push origin main
ssh remote-vps 'git clone <repo-url> /opt/cloudshelf'

# 方式 B: rsync
rsync -avz --exclude node_modules --exclude .venv . remote-vps:/opt/cloudshelf/
```

### 2. 配置环境变量

```sh
ssh remote-vps 'cat > /opt/cloudshelf/backend/.env << EOF
LLM_API_KEY=sk-xxx
LLM_BASE_URL=https://api.deepseek.com
LLM_MODEL=deepseek-v4-flash
GITHUB_TOKEN=ghp_xxx
CORS_ORIGINS=["http://服务器IP"]
DATA_DIR=
PORT=8000
EOF'
```

### 3. 启动服务

```sh
ssh remote-vps 'cd /opt/cloudshelf && docker compose up -d --build'
```

如果服务器带宽有限，可以本地构建镜像后推送至镜像仓库，远程拉取：

```sh
# 本地
docker tag github-tech-reader-v2-backend ttl.sh/cloudshelf-backend:2h
docker push ttl.sh/cloudshelf-backend:2h

# 远程
docker pull ttl.sh/cloudshelf-backend:2h
docker compose up -d
```

### 4. 端口映射（可选）

如果服务器对外端口被防火墙限制，可使用反向代理或端口转发：

```sh
# SSH 隧道（本地访问）
ssh -N -L 8080:localhost:80 remote-vps
# 访问 http://localhost:8080

# 或修改 docker-compose.yml 映射到开放端口
# 例如: "19577:80"  映射 WAN 端口 19577 到容器 80
```

---

## 端口 · Ports

| 模式 | 端口 | 说明 |
|------|------|------|
| 本地开发 (前端) | `5173` | Vite dev server |
| 本地开发 (后端) | `8000` | uvicorn --reload |
| Docker 生产 (前端) | `80` | Nginx 静态 + API 代理 |
| Docker 生产 (后端) | `8000` | uvicorn |
| Docker 开发 (前端) | `5173` | Vite + HMR |
| Docker 开发 (后端) | `8000` | uvicorn --reload |

> 本地开发端口 `5173`/`8000` 是**固定**的，详见 [快速开始](#快速开始--quick-start)。

---

## License

MIT
