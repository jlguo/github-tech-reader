# Contributing to 电子书架 (Cloud Shelf)

See [README.md](./README.md) for architecture, tech stack, and development setup.

## Development
- Frontend: `cd frontend && pnpm dev` (port 5173)
- Backend: `cd backend && uv run uvicorn app.main:app --reload` (port 8000)
- Copy `backend/.env.example` to `backend/.env` and configure secrets

## Before Submitting
- Run E2E tests: `cd frontend && pnpm test:e2e`
- Verify frontend build: `cd frontend && pnpm build`
- Backend tests: `cd backend && uv run pytest`

See [AGENTS.md](./AGENTS.md) for coding conventions and hard rules.
