# PDF to Markdown Converter

A working PDF to Markdown converter with:
- direct text extraction using PyMuPDF
- OCR fallback (Tesseract via `pdf2image`) for scanned pages
- single-file and batch CLI conversion

## Setup

1. Install dependencies:
```bash
python3 -m pip install -r requirements.txt
```

2. Install Tesseract OCR:
- macOS: `brew install tesseract`
- Ubuntu/Debian: `sudo apt-get install tesseract-ocr poppler-utils`
- Windows: install from [UB Mannheim builds](https://github.com/UB-Mannheim/tesseract/wiki)

3. For OCR conversion from PDF pages, make sure Poppler is installed (`pdftoppm` must be available).

## CLI Usage

### Convert one PDF
```bash
python3 Scripts/convert_pdf.py path/to/input.pdf --output path/to/output.md
```

If `--output` is omitted, output is written next to the input PDF using the same base name.

### Batch convert a folder
```bash
python3 Scripts/convert_pdf.py path/to/pdf-folder --batch --output path/to/output-folder
```

## Notes

- The converter prioritizes embedded PDF text.
- OCR is used only when extracted text for a page is too small (likely scanned/image-only).
- Output is page-separated using `## Page N` headers.

## FastAPI Model Backend (Plugin-Based)

A Python backend is available under `backend/` with auto-discovered model routes.

Run:
```bash
python3 -m pip install -r backend/requirements.txt
uvicorn backend.app.main:app --reload --port 8000
```

List models:
```bash
curl http://127.0.0.1:8000/models
```

Convert with a specific model:
```bash
curl -X POST http://127.0.0.1:8000/convert/native \
  -F "file=@/path/to/file.pdf"
```

To add a new model, add a new Python file in `backend/app/models/` exporting a `model` object (`ModelDefinition`).

## Frontend/Backend Mapping

The Next.js frontend now uses two API routes that proxy to the FastAPI model backend:

- Frontend `fetch('/api/models')` -> Next route `GET /api/models` -> FastAPI `GET /models`
- Frontend `fetch('/api/convert-pdf')` with `file` + `model` -> Next route `POST /api/convert-pdf` -> FastAPI `POST /convert/{model_id}`

This ensures model selection in the frontend has a backend counterpart for conversion.

### Required runtime

Run FastAPI before using conversion from the frontend:

```bash
uvicorn backend.app.main:app --reload --port 8000
```

Set backend URL in environment:

```bash
FASTAPI_BASE_URL=http://127.0.0.1:8000
```
