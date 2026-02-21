#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PORT="${FASTAPI_PORT:-8014}"

lsof -tiTCP:"$PORT" -sTCP:LISTEN | xargs -I{} kill {} >/dev/null 2>&1 || true

unset NO_COLOR
export PYTHONWARNINGS="${PYTHONWARNINGS:-ignore:urllib3 v2 only supports OpenSSL 1.1.1+}"
export PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK="${PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK:-True}"
export PATH="/Users/ritviksharma/Library/Python/3.9/bin:$PATH"

cd "$ROOT_DIR"

# Prefer native arm64 Python on Apple Silicon even if this shell runs under Rosetta.
if /usr/bin/arch -arm64 /usr/bin/python3 -c "import platform; print(platform.machine())" >/dev/null 2>&1; then
  exec /usr/bin/arch -arm64 /usr/bin/python3 -m uvicorn backend.app.main:app --port "$PORT" --app-dir .
fi

exec /usr/bin/python3 -m uvicorn backend.app.main:app --port "$PORT" --app-dir .
