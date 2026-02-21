#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FASTAPI_PORT="${FASTAPI_PORT:-8014}"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"
FASTAPI_BASE_URL="${FASTAPI_BASE_URL:-http://127.0.0.1:${FASTAPI_PORT}}"

export FASTAPI_PORT FRONTEND_PORT FASTAPI_BASE_URL

bash "$APP_DIR/scripts/cleanup-dev-processes.sh"

cd "$APP_DIR"
FASTAPI_PORT="$FASTAPI_PORT" npm run backend:dev &
BACKEND_PID=$!

FASTAPI_BASE_URL="$FASTAPI_BASE_URL" npm run dev -- --port "$FRONTEND_PORT" &
FRONTEND_PID=$!

cleanup() {
  kill "$BACKEND_PID" "$FRONTEND_PID" >/dev/null 2>&1 || true
  bash "$APP_DIR/scripts/cleanup-dev-processes.sh" >/dev/null 2>&1 || true
}

trap cleanup EXIT INT TERM

npx --no-install wait-on "http://127.0.0.1:${FRONTEND_PORT}" "${FASTAPI_BASE_URL}/health"
FASTAPI_BASE_URL="$FASTAPI_BASE_URL" electron .
