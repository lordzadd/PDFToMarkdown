#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${FRONTEND_PORT:-3002}"
API="${FASTAPI_BASE_URL:-http://127.0.0.1:8014}"

lsof -tiTCP:"$PORT" -sTCP:LISTEN | xargs -I{} kill {} >/dev/null 2>&1 || true
unset NO_COLOR

cd "$APP_DIR"
exec env FASTAPI_BASE_URL="$API" npm run dev -- --port "$PORT"
