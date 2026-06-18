#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

cleanup() {
  echo ""
  echo "Shutting down..."
  kill $FRONTEND_PID 2>/dev/null
  wait $FRONTEND_PID 2>/dev/null
  echo "Stopped."
}
trap cleanup EXIT INT TERM

echo "=== Starting on-device PWA mode (no backend) ==="
cd "$ROOT/frontend"

if [ ! -d "node_modules" ]; then
  echo "Installing frontend dependencies..."
  pnpm install
fi

VITE_DATA_SOURCE=local pnpm dev &
FRONTEND_PID=$!

echo ""
echo "========================================"
echo " 电子书架 — On-Device Mode"
echo "========================================"
echo ""
echo " Frontend: http://localhost:5173"
echo ""
echo " No backend needed — all data stored in browser SQLite (OPFS)."
echo ""
echo " API keys (optional, for book generation):"
echo "   Open DevTools → Application → Local Storage"
echo "   Set: bookshelf_llm_key, bookshelf_llm_url, bookshelf_llm_model"
echo "   Set: bookshelf_gh_token (for higher GitHub rate limits)"
echo ""
echo " Press Ctrl+C to stop."
echo ""

wait
