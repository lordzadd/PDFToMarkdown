#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT_DIR"

echo "[doctor] cleaning stale processes"
bash ./scripts/cleanup-dev-processes.sh >/dev/null 2>&1 || true

echo "[doctor] verifying dependencies"
npm install --silent

echo "[doctor] backend smoke test"
npm run test:backend:smoke

echo "[doctor] electron button audit"
npm run test:electron:buttons

echo "[doctor] production build"
npm run build

echo "[doctor] packaged desktop build"
npm run electron:dist

echo "[doctor] completed"
