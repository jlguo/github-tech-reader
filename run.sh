#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

# DATA_DIR: set via env for containers, auto-detected for local dev
export DATA_DIR="${DATA_DIR:-$ROOT/backend/data}"
mkdir -p "$DATA_DIR"

cleanup() {
  echo ""
  echo "Shutting down..."
  kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
  wait $BACKEND_PID $FRONTEND_PID 2>/dev/null
  echo "Stopped."
}
trap cleanup EXIT INT TERM

echo "=== Starting backend (port 8000, data: $DATA_DIR) ==="
cd "$ROOT/backend"
DATA_DIR="$DATA_DIR" uv run uvicorn app.main:app --reload --port 8000 &
BACKEND_PID=$!

echo "=== Starting frontend (port 5173) ==="
cd "$ROOT/frontend"
pnpm dev &
FRONTEND_PID=$!

echo ""
echo "Backend:  http://localhost:8000"
echo "Frontend: http://localhost:5173"
echo "Data:     $DATA_DIR"
echo "Press Ctrl+C to stop."
echo ""

wait
