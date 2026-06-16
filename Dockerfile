FROM node:22-alpine AS frontend-build

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10 --activate

COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN pnpm install --no-frozen-lockfile

COPY frontend/ .

ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

RUN pnpm build


FROM python:3.11-slim

RUN pip install --no-cache-dir uv

WORKDIR /app

COPY backend/pyproject.toml ./
RUN uv sync --no-dev

COPY backend/ .
COPY --from=frontend-build /app/dist /app/static

RUN mkdir -p /app/data

EXPOSE 8000

ENV PATH="/app/.venv/bin:$PATH"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
