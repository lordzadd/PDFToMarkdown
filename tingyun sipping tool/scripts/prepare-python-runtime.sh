#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKEND_REQ="$ROOT_DIR/backend/requirements.txt"
PY_RUNTIME_DIR="$ROOT_DIR/tingyun sipping tool/build/python-env"
PY_RUNTIME_ARCHIVE="$ROOT_DIR/tingyun sipping tool/build/python-env.tar.gz"
IS_WINDOWS=0
if [[ "${OS:-}" == "Windows_NT" || "$(uname -s)" =~ MINGW|MSYS|CYGWIN ]]; then
  IS_WINDOWS=1
fi
if [[ "$IS_WINDOWS" -eq 1 ]]; then
  PY_BIN="$PY_RUNTIME_DIR/Scripts/python.exe"
else
  PY_BIN="$PY_RUNTIME_DIR/bin/python3"
fi
STAMP_FILE="$PY_RUNTIME_DIR/.requirements.sha256"

create_runtime_archive() {
  rm -f "$PY_RUNTIME_ARCHIVE"
  tar -czf "$PY_RUNTIME_ARCHIVE" -C "$(dirname "$PY_RUNTIME_DIR")" "$(basename "$PY_RUNTIME_DIR")"
}

if [[ "${SKIP_PYTHON_PREPARE:-0}" == "1" ]]; then
  mkdir -p "$PY_RUNTIME_DIR"
  echo "Skipped bundled python runtime preparation (SKIP_PYTHON_PREPARE=1)." > "$PY_RUNTIME_DIR/.skipped"
  echo "SKIP" > "$STAMP_FILE"
  echo "Skipping bundled python runtime preparation."
  exit 0
fi

pick_builder_python() {
  local candidates=()
  if [[ "$IS_WINDOWS" -eq 1 ]]; then
    candidates+=(
      "$(command -v python3.12.exe || true)"
      "$(command -v python3.11.exe || true)"
      "$(command -v python3.10.exe || true)"
      "$(command -v python3 || true)"
      "$(command -v py || true)"
    )
  else
    candidates+=(
      "$(command -v python3.12 || true)"
      "$(command -v python3.11 || true)"
      "$(command -v python3.10 || true)"
      "/opt/homebrew/bin/python3"
      "/usr/local/bin/python3"
      "$(command -v python3 || true)"
    )
  fi
  for candidate in "${candidates[@]}"; do
    [[ -n "${candidate:-}" ]] || continue
    [[ -x "$candidate" ]] || continue
    local -a probe_args
    probe_args=()
    if [[ "$candidate" == *"/py" || "$candidate" == *"/py.exe" ]]; then
      probe_args=(-3)
    fi
    if [[ ${#probe_args[@]} -gt 0 ]]; then
      if "$candidate" "${probe_args[@]}" - <<'PY' >/dev/null 2>&1
import sys
raise SystemExit(0 if sys.version_info >= (3, 10) else 1)
PY
      then
        if [[ "${probe_args[*]}" == "-3" ]]; then
          echo "$candidate -3"
        else
          echo "$candidate"
        fi
        return 0
      fi
    elif "$candidate" - <<'PY' >/dev/null 2>&1
import sys
raise SystemExit(0 if sys.version_info >= (3, 10) else 1)
PY
    then
      echo "$candidate"
      return 0
    fi
  done

  if command -v uv >/dev/null 2>&1; then
    uv python install 3.11 --quiet >/dev/null 2>&1 || true
    local uv_py
    uv_py="$(uv python find 3.11 2>/dev/null || true)"
    if [[ -n "${uv_py:-}" && -x "$uv_py" ]]; then
      if "$uv_py" - <<'PY' >/dev/null 2>&1
import sys
raise SystemExit(0 if sys.version_info >= (3, 10) else 1)
PY
      then
        echo "$uv_py"
        return 0
      fi
    fi
  fi

  return 1
}

if [[ ! -f "$BACKEND_REQ" ]]; then
  echo "Backend requirements not found at $BACKEND_REQ" >&2
  exit 1
fi

if command -v shasum >/dev/null 2>&1; then
  REQ_HASH="$(shasum -a 256 "$BACKEND_REQ" | awk '{print $1}')"
elif command -v sha256sum >/dev/null 2>&1; then
  REQ_HASH="$(sha256sum "$BACKEND_REQ" | awk '{print $1}')"
elif command -v openssl >/dev/null 2>&1; then
  REQ_HASH="$(openssl dgst -sha256 "$BACKEND_REQ" | awk '{print $NF}')"
else
  BACKEND_REQ_FOR_PY="$BACKEND_REQ"
  if [[ "$IS_WINDOWS" -eq 1 ]] && command -v cygpath >/dev/null 2>&1; then
    BACKEND_REQ_FOR_PY="$(cygpath -w "$BACKEND_REQ")"
  fi
  REQ_HASH="$(python3 - <<PY
import hashlib
from pathlib import Path
print(hashlib.sha256(Path(r"""$BACKEND_REQ_FOR_PY""").read_bytes()).hexdigest())
PY
)"
fi

if [[ -x "$PY_BIN" && -f "$STAMP_FILE" ]]; then
  CURRENT_HASH="$(cat "$STAMP_FILE" || true)"
  if [[ "$CURRENT_HASH" == "$REQ_HASH" ]]; then
    if [[ ! -f "$PY_RUNTIME_ARCHIVE" ]]; then
      create_runtime_archive
    fi
    echo "Bundled python runtime is up to date."
    exit 0
  fi
fi

mkdir -p "$(dirname "$PY_RUNTIME_DIR")"
rm -rf "$PY_RUNTIME_DIR"

BUILDER_PY_RAW="$(pick_builder_python || true)"
BUILDER_PY=""
BUILDER_PY_ARGS=()
if [[ -n "${BUILDER_PY_RAW:-}" ]]; then
  BUILDER_PY="${BUILDER_PY_RAW%% *}"
  EXTRA_ARG="${BUILDER_PY_RAW#"$BUILDER_PY"}"
  if [[ -n "${EXTRA_ARG// }" ]]; then
    BUILDER_PY_ARGS=(${EXTRA_ARG})
  fi
fi
if [[ -z "${BUILDER_PY:-}" ]]; then
  echo "No compatible Python (>=3.10) found. Install one (or install uv) and retry." >&2
  exit 1
fi

if [[ ${#BUILDER_PY_ARGS[@]} -gt 0 ]]; then
  "$BUILDER_PY" "${BUILDER_PY_ARGS[@]}" -m venv "$PY_RUNTIME_DIR"
else
  "$BUILDER_PY" -m venv "$PY_RUNTIME_DIR"
fi

if [[ "$IS_WINDOWS" -eq 1 ]]; then
  "$PY_BIN" -m pip install --upgrade pip setuptools wheel
  "$PY_BIN" -m pip install -r "$BACKEND_REQ"
else
  source "$PY_RUNTIME_DIR/bin/activate"
  python -m pip install --upgrade pip setuptools wheel
  python -m pip install -r "$BACKEND_REQ"
  # Ensure bundled venv python launchers do not symlink outside the app bundle.
  VENV_BIN_DIR="$PY_RUNTIME_DIR/bin"
  PY_REAL="$("$VENV_BIN_DIR/python3" -c 'import os,sys; print(os.path.realpath(sys.executable))')"
  PY_VERSION_NAME="$("$VENV_BIN_DIR/python3" -c 'import sys; print(f"python{sys.version_info.major}.{sys.version_info.minor}")')"
  rm -f "$VENV_BIN_DIR/$PY_VERSION_NAME"
  cp "$PY_REAL" "$VENV_BIN_DIR/$PY_VERSION_NAME"
  chmod +x "$VENV_BIN_DIR/$PY_VERSION_NAME"
  ln -sf "$PY_VERSION_NAME" "$VENV_BIN_DIR/python3"
  ln -sf "$PY_VERSION_NAME" "$VENV_BIN_DIR/python"
  deactivate
fi

echo "$REQ_HASH" > "$STAMP_FILE"
create_runtime_archive
if [[ ${#BUILDER_PY_ARGS[@]} -gt 0 ]]; then
  echo "Prepared bundled python runtime at: $PY_RUNTIME_DIR (archive: $PY_RUNTIME_ARCHIVE, builder: $BUILDER_PY ${BUILDER_PY_ARGS[*]})"
else
  echo "Prepared bundled python runtime at: $PY_RUNTIME_DIR (archive: $PY_RUNTIME_ARCHIVE, builder: $BUILDER_PY)"
fi
