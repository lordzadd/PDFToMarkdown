# Tingyun Snipping Tool v0.1.6

## CI Runtime Packaging Fix
- Fixed `prepare-python-runtime.sh` failing under `set -u` when probing python executables.
- This unblocked GitHub Actions `Build bundled Python runtime` step on both macOS and Windows.

## Why this matters
- `v0.1.5` release workflow failed before packaging due to shell script error.
- `v0.1.6` should complete full runtime-inclusive release artifacts again.
