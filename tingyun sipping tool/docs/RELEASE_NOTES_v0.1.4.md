# Tingyun Snipping Tool v0.1.4

## CI Release Fix
- Fixed desktop release workflow failure on Windows runners.
- `Generate app icons` step now runs only on macOS (the script uses macOS-only `sips`/`iconutil`).

## Why this matters
- Previous `v0.1.3` workflow failed before release publishing due to Windows icon-step error.
- `v0.1.4` restores successful cross-platform artifact publishing (mac + windows).
