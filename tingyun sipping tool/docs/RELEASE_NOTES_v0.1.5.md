# Tingyun Snipping Tool v0.1.5

## Critical Release Fix
- Fixed GitHub Actions desktop release packaging to include bundled Python runtime and model dependencies.
- Removed `SKIP_PYTHON_PREPARE=1` from release workflow.

## Why this was needed
- Previous CI artifacts were much smaller than local builds and missed required runtime/model packages.
- This caused runtime launch failures and backend/model errors in downloaded releases.

## Expected result
- Release artifact size should now be comparable to local full builds.
- Electron app should include `python-env` and model dependencies required for local OCR execution.
