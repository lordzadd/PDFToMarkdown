#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKEND_REQ="$ROOT_DIR/backend/requirements.txt"
PY_RUNTIME_DIR="$ROOT_DIR/tingyun sipping tool/build/python-env"
PY_BIN="$PY_RUNTIME_DIR/bin/python3"
STAMP_FILE="$PY_RUNTIME_DIR/.requirements.sha256"

pick_builder_python() {
  local candidates=(
    "/opt/homebrew/bin/python3"
    "/usr/local/bin/python3"
    "$(command -v python3 || true)"
  )
  for candidate in "${candidates[@]}"; do
    [[ -n "${candidate:-}" ]] || continue
    [[ -x "$candidate" ]] || continue
    if "$candidate" - <<'PY' >/dev/null 2>&1
import sys
raise SystemExit(0 if sys.version_info >= (3, 9) else 1)
PY
    then
      echo "$candidate"
      return 0
    fi
  done
  return 1
}

if [[ ! -f "$BACKEND_REQ" ]]; then
  echo "Backend requirements not found at $BACKEND_REQ" >&2
  exit 1
fi

REQ_HASH="$(shasum -a 256 "$BACKEND_REQ" | awk '{print $1}')"

if [[ -x "$PY_BIN" && -f "$STAMP_FILE" ]]; then
  CURRENT_HASH="$(cat "$STAMP_FILE" || true)"
  if [[ "$CURRENT_HASH" == "$REQ_HASH" ]]; then
    echo "Bundled python runtime is up to date."
    exit 0
  fi
fi

mkdir -p "$(dirname "$PY_RUNTIME_DIR")"
rm -rf "$PY_RUNTIME_DIR"

BUILDER_PY="$(pick_builder_python || true)"
if [[ -z "${BUILDER_PY:-}" ]]; then
  echo "No compatible Python (>=3.9) found. Install one (e.g. /opt/homebrew/bin/python3) and retry." >&2
  exit 1
fi

"$BUILDER_PY" -m venv "$PY_RUNTIME_DIR"

source "$PY_RUNTIME_DIR/bin/activate"
python -m pip install --upgrade pip setuptools wheel
python -m pip install -r "$BACKEND_REQ"
deactivate

echo "$REQ_HASH" > "$STAMP_FILE"
echo "Prepared bundled python runtime at: $PY_RUNTIME_DIR (builder: $BUILDER_PY)"
