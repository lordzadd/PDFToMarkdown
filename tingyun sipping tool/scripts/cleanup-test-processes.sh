#!/usr/bin/env bash
set -euo pipefail

pkill -f "playwright-web-smoke.sh" >/dev/null 2>&1 || true
pkill -f "npm run test:web:smoke" >/dev/null 2>&1 || true
pkill -f "playwright-cli --session" >/dev/null 2>&1 || true
pkill -f "run-cli-server" >/dev/null 2>&1 || true
pkill -f "next dev --port 3002" >/dev/null 2>&1 || true
pkill -f "uvicorn backend.app.main:app --port 8014" >/dev/null 2>&1 || true

for p in 3002 8014; do
  lsof -tiTCP:"$p" -sTCP:LISTEN | xargs -I{} kill {} >/dev/null 2>&1 || true
done

echo "clean test processes"
