# Contributor Guide

## 1) Repository Areas

- frontend UI and API proxy: `tingyun sipping tool/`
- model backend: `backend/`
- legacy scripts/assets: `Scripts/`

Most feature work touches both:

- `tingyun sipping tool/` (UX + API proxy)
- `backend/` (model behavior)

## 2) Adding a New OCR Model

1. Implement or adapt model in `backend/app/models/<model>.py`.
2. Register model in `backend/model_registry.json`.
3. Ensure provider plugin (`local` or `hf_space`) can build adapter.
4. Add Next route file:
   - `tingyun sipping tool/app/api/convert/<model>/route.ts`
5. Add model metadata in UI:
   - `tingyun sipping tool/tingyun-snipping-tool.tsx`
6. Validate conversion from UI and backend smoke scripts.

## 3) Error Handling Requirements

All conversion paths should:

- return clear HTTP errors (`4xx` input, `5xx` runtime)
- preserve backend `detail` into user-facing message
- include `requestId` on proxy errors for tracing
- write structured diagnostics to desktop log in Electron mode

## 4) Testing Expectations

Minimum before commit:

1. `npm run build`
2. `npm run test:backend:smoke`
3. run one UI conversion path manually (or automated suite)

For Electron-sensitive changes:

1. `npm run electron:dev`
2. open PDF
3. run at least one model conversion
4. save markdown + LaTeX
5. validate screenshot flow

## 5) Coding Conventions

- keep API payload shape stable (`markdown`, `execution`, `requestId`)
- avoid placeholder output in model adapters
- prefer explicit fallback notes over silent fallback
- keep logs structured JSON for machine parsing

## 6) Pull Request / Commit Guidelines

Commit messages should clearly state:

- surface area changed (UI/API/backend/electron)
- behavior change
- fallback/compatibility impact

Recommended commit format:

```text
feat(ocr): add <model> adapter and proxy route
fix(electron): improve capture permission diagnostics
docs(runbook): add release and debugging workflow
```

