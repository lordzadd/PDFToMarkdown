# Tingyun Snipping Tool

This package now supports a unified frontend/backend flow:

- Frontend: Next.js app (`app/`, `tingyun-snipping-tool.tsx`)
- Backend proxy: Next API routes (`app/api/convert/*`)
- Model runtime: FastAPI backend in `../backend`

## Local development (recommended)

1. Install JS deps:
```bash
npm install
```

2. Install Python deps for model backend:
```bash
python3 -m pip install -r ../backend/requirements.txt
```

3. Start frontend + FastAPI together:
```bash
npm run dev:local
```

This runs:
- Next.js on `http://localhost:3000`
- FastAPI model backend on `http://127.0.0.1:8014`

If `8014` is occupied:
```bash
FASTAPI_PORT=8010 FASTAPI_BASE_URL=http://127.0.0.1:8010 npm run dev:local
```

## Electron local development

```bash
npm run electron:dev
```

This starts:
- Next.js frontend
- FastAPI backend
- existing Electron Express helper server (for legacy/electron-only flows)
- Electron shell

## Desktop logs and diagnostics

- Electron now writes structured logs to:
  - `~/Library/Application Support/Tingyun Snipping Tool/logs/desktop-app.log`
- The app error panel includes:
  - backend URL
  - backend health status
  - backend last error
  - log file path
- In Electron mode, use `Open Log Folder` in the error panel to jump directly to logs.

## Automated maintenance / tests

Run everything with one command:

```bash
npm run test:desktop:full
```

This runs:
- backend smoke test (`npm run test:backend:smoke`)
- Electron button audit (`npm run test:electron:buttons`)
- production build
- desktop package build

## Vercel deployment

Deploy this package as a normal Next.js app.

- UI and non-model features work on Vercel.
- Model conversion endpoints (`/api/convert/*`) require a reachable FastAPI backend.
- Set `FASTAPI_BASE_URL` in Vercel project env vars to your hosted backend URL.
- If no backend is configured/reachable, conversion routes return a clear error.

## Frontend to backend mapping

- `/api/convert/nougat` -> FastAPI `/convert/nougat`
- `/api/convert/gpt4v` -> FastAPI `/convert/gpt4v`
- `/api/convert/layoutlm` -> FastAPI `/convert/layoutlm`
- `/api/convert/markitdown` -> FastAPI `/convert/markitdown`
- `/api/convert/docling` -> FastAPI `/convert/docling`
- `/api/convert/zerox` -> FastAPI `/convert/zerox`
- `/api/models` -> FastAPI `/models`

Legacy alias:
- `/api/convert/donut` -> FastAPI `/convert/markitdown`

## Documentation

- Architecture: `docs/ARCHITECTURE.md`
- Operations runbook: `docs/OPERATIONS.md`
- Contributor onboarding: `docs/CONTRIBUTING_GUIDE.md`
