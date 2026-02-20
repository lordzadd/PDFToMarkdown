# Contributing to PDFToMarkdown

This project is a local-first OCR + PDF-to-Markdown system with:
- Next.js frontend (`/tingyun sipping tool`)
- FastAPI backend (`/backend`)
- Pluggable model adapters (`/backend/app/models`)

## Prerequisites

- Python 3.9+
- Node.js 18+
- npm
- macOS/Linux shell tools (`bash`, `lsof`)

Optional but recommended:
- `poppler` (for `pdf2image`)
- Tesseract OCR

## Local Setup

1. Install Python deps:
```bash
python3 -m pip install -r requirements.txt
python3 -m pip install -r backend/requirements.txt
```

2. Install frontend deps:
```bash
npm --prefix "tingyun sipping tool" install
```

3. Start full local app:
```bash
npm --prefix "tingyun sipping tool" run dev:local
```

Frontend: `http://localhost:3000`  
Backend: `http://127.0.0.1:8014`

## Architecture Notes

- Model registry: `backend/model_registry.json`
- Adapter registry loader: `backend/app/adapter_registry.py`
- Local model plugins: `backend/app/models/*.py`
- Frontend API proxy routes: `tingyun sipping tool/app/api/convert/*/route.ts`

Every backend model should expose:
- `model_id`
- `description`
- `capabilities`
- `converter.convert(pdf_path, options)`
- `converter.is_available()` (recommended)

## Adding a New OCR Model

1. Add a backend model file in `backend/app/models/`.
2. Register it in `backend/model_registry.json`.
3. Add frontend route in:
   - `tingyun sipping tool/app/api/convert/<model-id>/route.ts`
4. Add model option in:
   - `tingyun sipping tool/tingyun-snipping-tool.tsx`
5. Add/update E2E expectation in:
   - `tingyun sipping tool/tests/e2e/web-ui.spec.ts`

## Testing

Build frontend:
```bash
npm --prefix "tingyun sipping tool" run build
```

Run web E2E:
```bash
npm --prefix "tingyun sipping tool" run test:web:e2e
```

## Model Runtime Policy

- Prefer local runtime over API calls.
- Expose fallback metadata in backend responses (`execution.engine_used`, `fallback_used`, `note`).
- Keep conversion API stable: `POST /convert/{model_id}`.

## Commit Guidelines

- Keep commits focused (model adapter, frontend wiring, tests, docs).
- Include verification notes in commit message body when possible.
- Avoid committing generated outputs unless required for reproducibility.
