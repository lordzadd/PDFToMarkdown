# Tingyun Snipping Tool v0.1.7

## Release Pipeline Reliability Fixes
- Fixed `prepare-python-runtime.sh` for strict shell mode (`set -u`) by removing empty-array unsafe expansion.
- Added cross-platform requirements hash fallbacks (`sha256sum`, `openssl`) and safer Windows path handling when python hashing fallback is used.

## Why this matters
- `v0.1.6` release failed at runtime-prep in CI on both macOS and Windows.
- This patch unblocks full bundled Python/model packaging in GitHub release artifacts.
