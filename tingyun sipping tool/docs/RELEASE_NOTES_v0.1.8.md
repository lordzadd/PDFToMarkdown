# Tingyun Snipping Tool v0.1.8

## CI Runtime Packaging Fix (Follow-up)
- Fixed `prepare-python-runtime.sh` failure at venv creation under `set -u` when `BUILDER_PY_ARGS` is empty.
- Guarded both venv invocation and final log message against empty array expansion.

## Why this matters
- `v0.1.7` still failed during bundled runtime prep on macOS due to strict shell expansion.
- This patch should allow full bundled packaging to proceed in release CI.
