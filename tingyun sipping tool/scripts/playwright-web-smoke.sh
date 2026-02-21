#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
APP_DIR="$ROOT_DIR/tingyun sipping tool"
OUTPUT_DIR="$APP_DIR/output/playwright"
LOG_DIR="/tmp/tingyun-playwright-smoke"
mkdir -p "$OUTPUT_DIR" "$LOG_DIR"

cd "$APP_DIR"

FASTAPI_PORT="${FASTAPI_PORT:-8014}"
FRONTEND_PORT="${FRONTEND_PORT:-3002}"
FASTAPI_BASE_URL="http://127.0.0.1:${FASTAPI_PORT}"
FRONTEND_BASE_URL="http://127.0.0.1:${FRONTEND_PORT}"

CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
PWCLI_DEFAULT="$CODEX_HOME/skills/playwright/scripts/playwright_cli.sh"
PLAYWRIGHT_SESSION="twsmk$(date +%H%M%S)"

BACKEND_PID=""
FRONTEND_PID=""

pw() {
  if [[ -x "$PWCLI_DEFAULT" ]]; then
    "$PWCLI_DEFAULT" --session "$PLAYWRIGHT_SESSION" "$@"
  else
    npx --yes --package @playwright/cli playwright-cli --session "$PLAYWRIGHT_SESSION" "$@"
  fi
}

cleanup() {
  set +e
  if [[ -n "$FRONTEND_PID" ]] && kill -0 "$FRONTEND_PID" >/dev/null 2>&1; then
    kill "$FRONTEND_PID" >/dev/null 2>&1
  fi
  if [[ -n "$BACKEND_PID" ]] && kill -0 "$BACKEND_PID" >/dev/null 2>&1; then
    kill "$BACKEND_PID" >/dev/null 2>&1
  fi
  pw close >/dev/null 2>&1 || true
}
trap cleanup EXIT

kill_port_listener() {
  local port="$1"
  local pids
  pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "$pids" ]]; then
    echo "[step] freeing port :$port"
    kill $pids >/dev/null 2>&1 || true
    sleep 1
  fi
}

wait_http() {
  local url="$1"
  local name="$2"
  local retries="${3:-90}"
  local i
  for ((i = 1; i <= retries; i++)); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      echo "[ok] $name ready at $url"
      return 0
    fi
    sleep 1
  done
  echo "[error] $name did not become ready at $url"
  return 1
}

run_js_check() {
  local js="$1"
  local out
  out="$(pw eval "$js")"
  if printf '%s' "$out" | rg -q '^false$|^"false"$'; then
    echo "[error] JS check failed"
    echo "$out"
    return 1
  fi
}

get_execution_line() {
  local out
  out="$(pw eval "(() => { const line = (document.body.innerText || '').split('\\n').find(l => l.startsWith('Execution:')); return line || null; })()")"
  printf '%s\n' "$out" | sed -n 's/^"\(Execution:[^"]*\)"$/\1/p' | tail -1
}

assert_execution_contains() {
  local expected="$1"
  local tries=25
  local i line
  for ((i = 1; i <= tries; i++)); do
    line="$(get_execution_line || true)"
    if [[ -n "$line" ]] && [[ "$line" == *"$expected"* ]]; then
      echo "[ok] $line"
      return 0
    fi
    sleep 1
  done
  echo "[error] Expected execution text containing: $expected"
  echo "[error] Last seen: ${line:-<none>}"
  return 1
}

select_model() {
  local label="$1"
  run_js_check "(() => { const icon=document.querySelector('svg.lucide-settings'); const btn=icon && icon.closest('button'); if(!btn) return false; btn.click(); return true; })()"
  run_js_check "(() => { const radios=[...document.querySelectorAll('[role=\"radio\"]')]; const target=radios.find(r => (r.getAttribute('aria-label')||'').trim() === '$label'); if(!target) return false; target.click(); return true; })()"
  run_js_check "(() => { const btn=[...document.querySelectorAll('button')].find(b => (b.textContent||'').includes('Save Settings')); if(!btn) return false; btn.click(); return true; })()"
}

upload_pdf() {
  local pdf_path="$1"
  run_js_check "(() => { const icon=document.querySelector('svg.lucide-file-text'); const btn=icon && icon.closest('button'); if(!btn) return false; btn.click(); return true; })()"
  pw upload "$pdf_path" >/dev/null
}

convert_current() {
  run_js_check "(() => { const btn=[...document.querySelectorAll('button')].find(b => (b.textContent||'').includes('Convert to Markdown')); if(!btn) return false; btn.click(); return true; })()"
}

kill_port_listener "$FASTAPI_PORT"
kill_port_listener "$FRONTEND_PORT"

echo "[step] starting backend on :$FASTAPI_PORT"
(
  cd "$ROOT_DIR"
  if /usr/bin/arch -arm64 /usr/bin/python3 -c "import platform;print(platform.machine())" >/dev/null 2>&1; then
    /usr/bin/arch -arm64 /usr/bin/python3 -m uvicorn backend.app.main:app --port "$FASTAPI_PORT" --app-dir .
  else
    /usr/bin/python3 -m uvicorn backend.app.main:app --port "$FASTAPI_PORT" --app-dir .
  fi
) >"$LOG_DIR/backend.log" 2>&1 &
BACKEND_PID=$!
wait_http "$FASTAPI_BASE_URL/health" "backend"

echo "[step] starting frontend on :$FRONTEND_PORT"
(
  cd "$APP_DIR"
  FASTAPI_BASE_URL="$FASTAPI_BASE_URL" npm run dev -- --port "$FRONTEND_PORT"
) >"$LOG_DIR/frontend.log" 2>&1 &
FRONTEND_PID=$!
wait_http "$FRONTEND_BASE_URL" "frontend"

echo "[step] preparing sample files"
BASE_PDF="$OUTPUT_DIR/sample-base.pdf"
curl -L -sS -o "$BASE_PDF" "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf"

MODELS=(
  "deepseek|DeepSeek OCR|requested deepseek, ran"
  "euro-ocr|Euro OCR (Mistral)|requested euro-ocr, ran"
  "layoutlm|LayoutLM|requested layoutlm, ran layoutlm"
  "markitdown|MarkItDown (Microsoft)|requested markitdown, ran markitdown"
  "docling|Docling|requested docling, ran docling"
  "zerox|ZeroX (OmniAI)|requested zerox, ran"
)

echo "[step] launching browser session"
pw open "$FRONTEND_BASE_URL" >/dev/null
pw snapshot >/dev/null

for entry in "${MODELS[@]}"; do
  IFS='|' read -r model_id model_label expected <<<"$entry"
  pdf_path="$OUTPUT_DIR/sample-${model_id}.pdf"
  cp "$BASE_PDF" "$pdf_path"

  echo "[step] model=$model_id"
  select_model "$model_label"
  upload_pdf "$pdf_path"
  convert_current
  assert_execution_contains "$expected"
done

echo "[step] collecting artifacts"
pw screenshot >/dev/null || true
pw console > "$OUTPUT_DIR/console-latest.log" || true

echo "[ok] Web smoke test passed for all models"
echo "[info] backend log: $LOG_DIR/backend.log"
echo "[info] frontend log: $LOG_DIR/frontend.log"
echo "[info] artifacts: $OUTPUT_DIR"
