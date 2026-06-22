#!/usr/bin/env bash
# Restart backend (:8000) and frontend (:5173) for smoke testing.
# Usage: ./scripts/dev-restart.sh [backend|frontend|both]
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${1:-both}"

wait_for() {
  local url="$1" name="$2" tries="${3:-30}"
  for i in $(seq 1 "$tries"); do
    if curl -s --max-time 2 "$url" >/dev/null 2>&1; then
      echo "[ok] $name ready ($url)"
      return 0
    fi
    sleep 1
  done
  echo "[FAIL] $name not ready after ${tries}s ($url)"
  return 1
}

start_backend() {
  fuser -k 8000/tcp 2>/dev/null
  sleep 2
  cd "$ROOT/backend"
  setsid bash -c 'exec .venv/bin/uvicorn app.main:app --port 8000' > /tmp/backend.log 2>&1 < /dev/null &
  disown
  echo "[..] backend launching"
  wait_for "http://localhost:8000/api/health" "backend" 40
}

start_frontend() {
  fuser -k 5173/tcp 2>/dev/null
  sleep 1
  cd "$ROOT/frontend"
  setsid bash -c 'exec pnpm dev' > /tmp/frontend.log 2>&1 < /dev/null &
  disown
  echo "[..] frontend launching"
  wait_for "http://localhost:5173" "frontend" 40
}

case "$TARGET" in
  backend)  start_backend ;;
  frontend) start_frontend ;;
  both)     start_backend && start_frontend ;;
  *) echo "usage: $0 [backend|frontend|both]"; exit 2 ;;
esac
