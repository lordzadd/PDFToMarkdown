#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${FASTAPI_PORT:-8014}"
PDF_PATH="${E2E_PDF_PATH:-/Users/ritviksharma/Downloads/Memoire-JMBorello-1.pdf}"

if [[ ! -f "$PDF_PATH" ]]; then
  echo "Missing PDF for smoke test: $PDF_PATH" >&2
  exit 1
fi

lsof -tiTCP:"$PORT" -sTCP:LISTEN | xargs -I{} kill {} >/dev/null 2>&1 || true

cleanup() {
  if [[ -n "${BACKEND_PID:-}" ]]; then
    kill "$BACKEND_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

(
  cd "$ROOT_DIR"
  FASTAPI_PORT="$PORT" npm run backend:dev
) >/tmp/tingyun-backend-smoke.log 2>&1 &
BACKEND_PID=$!

for _ in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

HEALTH_JSON="$(curl -fsS "http://127.0.0.1:${PORT}/health")"
echo "health: ${HEALTH_JSON}" | head -c 300
echo

RESP_FILE="$(mktemp)"
curl -fsS -X POST "http://127.0.0.1:${PORT}/convert/native" \
  -F "file=@${PDF_PATH};type=application/pdf" \
  -F 'options={"maxPages":1}' >"$RESP_FILE"

python3 - "$RESP_FILE" <<'PY'
import json, sys
data = json.load(open(sys.argv[1], "r", encoding="utf-8"))
md = (data.get("markdown") or "").strip()
if len(md) < 40:
    raise SystemExit("backend smoke failed: markdown output too short")
print(f"backend smoke markdown length={len(md)}")
print(f"backend smoke model={data.get('model_id')}")
PY

echo "backend smoke test passed"
