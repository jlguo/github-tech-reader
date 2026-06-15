# Backend

FastAPI + SQLAlchemy + SQLite + CrewAI

## Prerequisites

- Python 3.11+
- [uv](https://docs.astral.sh/uv/) — package manager

## Install

```sh
# Install uv if needed
curl -LsSf https://astral.sh/uv/install.sh | sh

# Install dependencies (creates .venv automatically)
uv sync
```

## Configure

```sh
cp .env.example .env
```

Edit `.env` with your credentials:

```ini
LLM_API_KEY=sk-xxx              # Required for CrewAI
LLM_BASE_URL=https://api.openai.com/v1   # OpenAI-compatible endpoint
LLM_MODEL=gpt-4o-mini           # Model name
GITHUB_TOKEN=ghp_xxx            # Optional, increases API rate limit
```

## Run

```sh
uv run uvicorn app.main:app --reload --port 8000
```

Open http://localhost:8000/docs for interactive API docs.

## Test

```sh
uv run pytest
```

## Dependencies

| Package | Purpose |
|---------|---------|
| fastapi | API framework |
| uvicorn | ASGI server |
| sqlalchemy + aiosqlite | Async ORM + SQLite |
| httpx | GitHub REST API client |
| crewai | Multi-agent book generation |
| pydantic + pydantic-settings | Validation + config |
