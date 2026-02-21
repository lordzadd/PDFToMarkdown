#!/usr/bin/env bash
set -euo pipefail

PORTS=("${FRONTEND_PORT:-3000}" "${FASTAPI_PORT:-8014}")

pkill -f "uvicorn app.main:app" >/dev/null 2>&1 || true
pkill -f "next dev" >/dev/null 2>&1 || true
pkill -f "next start" >/dev/null 2>&1 || true
pkill -f "electron ." >/dev/null 2>&1 || true

for p in "${PORTS[@]}"; do
  lsof -tiTCP:"$p" -sTCP:LISTEN | xargs -I{} kill {} >/dev/null 2>&1 || true
done

echo "cleaned dev processes"
