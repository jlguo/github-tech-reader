# AGENTS.md — github-tech-reader-v2

## Project

**电子书架 (Cloud Shelf)** — a web app for organizing and reading GitHub tech content in a digital bookshelf interface. Design prototypes live in `docs/电子书架.zip` (Figma Make export).

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
```

## Architecture

```
frontend/          # React SPA (Vite)
  src/
    app/           # App component, pages
    components/    # shadcn/ui, BookCard, Sidebar, readers
    styles/        # fonts, tailwind, theme CSS
    assets/        # static assets (figma:asset/ resolves here)

backend/           # FastAPI (Python)
  app/
    main.py        # FastAPI entrypoint, CORS, lifespan
    core/          # config.py (settings), database.py (SQLAlchemy async engine)
    models/        # SQLAlchemy ORM models (Repo, ReadingProgress, ContentSection)
    api/           # REST endpoints (repos, reading, agents)
    services/      # GitHub API client (httpx)
    agents/        # CrewAI agent team for book chapter generation
  data/            # SQLite database file (auto-created)
```

### Key architectural details

- **`@/`** aliases to `./src/` in frontend (vite.config.ts)
- **`figma:asset/filename`** imports resolve to `src/assets/filename` (custom Vite plugin)
- CSS: `fonts.css` → `tailwind.css` → `theme.css` (order matters)
- Tailwind v4 scans from within CSS via `@source`; no tailwind.config file needed
- Theme: warm cream/brown — `background #f5f0e8`, `primary #5c3d1e`, `accent #c17f3a`
- Dark mode via `.dark` class, not media query
- Database auto-creates tables on startup (init_db in lifespan)
- CORS configured for `localhost:5173` by default

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
| POST | `/api/agents/generate-chapter/{repo_id}` | Trigger CrewAI chapter generation |

## Design vs Implementation Gap

The `docs/` directory contains a **Figma-generated prototype** with hardcoded mock book data (`src/app/components/bookData.ts`). It has:

- Shelf UI: grid/list views, categories, search, sort, favorites, recent reads
- Mock readers for epub, pdf, doc, ppt, excel, html, manga file types
- No real data layer, no API calls, no backend

**The actual v2 product** needs real GitHub integration: fetching repos, READMEs, code, issues, etc. and presenting them as "books" on a shelf. The design language from the prototype should be preserved, but the data model and backend are completely new.

## Conventions

- **pnpm** only for frontend — no npm or yarn
- Use Tailwind classes over inline styles (prototype has many Figma-export inline styles; prefer Tailwind tokens)
- shadcn/ui components as the UI foundation; avoid adding new UI libraries
- MUI is in the prototype's dependencies but should be removed — shadcn/ui covers the same surface
- Chinese content; use `localeCompare("zh")` for sorting Chinese strings
- Reader components follow the pattern in `ReaderModal.tsx`: one component per document type, dispatched by type
- Backend: async SQLAlchemy with `aiosqlite` driver; use `selectinload` for eager-loading relationships
- Environment: copy `backend/.env.example` to `backend/.env` and configure `GITHUB_TOKEN` and `OPENAI_API_KEY`
