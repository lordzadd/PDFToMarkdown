# Tingyun Snipping Tool Architecture

## 1) System Overview

The application has three runtime layers:

1. `Next.js UI` (web + Electron renderer)
2. `Next API proxy` (`app/api/convert/*`, `app/api/models`)
3. `FastAPI model backend` (`../backend/app`)

Request flow:

1. User uploads PDF and selects model in `tingyun-snipping-tool.tsx`.
2. UI posts `multipart/form-data` (`pdf`, `options`) to `/api/convert/{model}`.
3. Next route validates payload and forwards to FastAPI `/convert/{model}`.
4. FastAPI adapter registry resolves provider and model implementation.
5. Model returns markdown and execution metadata to UI.

## 2) Frontend Layer

Primary UI component:

- `tingyun-snipping-tool.tsx`

Main responsibilities:

- PDF file selection (browser + Electron)
- model selection
- conversion progress and error display
- markdown and LaTeX output tabs
- file save/export (browser download or Electron save dialog)
- diagnostics panel (backend health, log folder, recent errors)

## 3) API Proxy Layer (Next Routes)

Key files:

- `app/api/convert/_lib/handler.ts`
- `app/api/convert/<model>/route.ts`
- `app/api/models/route.ts`

Responsibilities:

- enforce request shape (`multipart/form-data`)
- parse and validate `options` JSON
- enforce web upload limits for hosted environments
- normalize backend error responses
- return `requestId` for cross-layer debugging
- convert markdown into UI segment blocks
- append structured route logs to Electron desktop log when available (`DESKTOP_APP_LOG_PATH`)

## 4) Backend Layer (FastAPI)

Key files:

- `../backend/app/main.py`
- `../backend/app/adapter_registry.py`
- `../backend/model_registry.json`

Responsibilities:

- expose `/health`, `/models`, `/convert/{model}`
- parse options and input validation
- route to model adapters through registry + provider plugins
- return canonical conversion response:
  - `model_id`
  - `markdown`
  - `execution` (`requested_model`, `engine_used`, `provider_used`, `fallback_used`, `note`)

## 5) Model/Provider Plugin Architecture

Design goal: stable API shape with pluggable providers/models.

Provider plugins:

- `local` provider (`backend/app/provider_plugins/local_provider.py`)
- `hf_space` provider (`backend/app/provider_plugins/hf_space_provider.py`)

Model implementations:

- Local model files in `backend/app/models/*.py`
- Registry mapping in `backend/model_registry.json`

This allows adding models by:

1. adding/updating a model implementation
2. wiring it in `model_registry.json`
3. exposing corresponding Next route (`app/api/convert/<id>/route.ts`) if needed

## 6) Desktop Runtime (Electron)

Key files:

- `electron/main.js`
- `electron/preload.js`

Runtime responsibilities:

- spawn FastAPI backend automatically in packaged mode
- set `FASTAPI_BASE_URL` for renderer/API routes
- run embedded Next server when static export is unavailable
- expose IPC for:
  - open/save files
  - screen source listing and capture
  - diagnostics + log folder access
- write structured desktop logs to:
  - `~/Library/Application Support/my-v0-project/logs/desktop-app.log`

## 7) Observability and Error Correlation

Error path includes three IDs/signals:

1. UI error text (includes `requestId` when API returns it)
2. `next-route:*` structured log entry (request context)
3. backend error details (`detail`, provider/model fallback note)

Use these together to isolate:

- payload/validation issues
- proxy forwarding issues
- backend model runtime errors
- platform permission issues (for screenshot features)

