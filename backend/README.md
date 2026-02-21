# FastAPI Backend (Registry + Adapter Architecture)

This backend uses a model registry and plugin adapters so you can add/swap OCR models while keeping a stable API.

## Architecture

- Registry file: `backend/model_registry.json`
- Adapter types:
  - `local` (Python model plugins in `backend/app/models/`)
  - `hf_space` (Hugging Face Space adapters via `gradio_client`)
- Stable output shape from every model endpoint:
  - `{ model_id, markdown }`

## Run

```bash
python3 -m pip install -r backend/requirements.txt
uvicorn backend.app.main:app --reload --port 8000
```

## Endpoints

- `GET /health`
- `GET /models`
- `POST /convert/{model_id}` with multipart:
  - `file`: PDF
  - `options`: optional JSON string

## Add a model (config-only)

Edit `backend/model_registry.json` and add one entry:

### Local plugin model
```json
{
  "id": "my-local-model",
  "provider": "local",
  "local_model": "native",
  "enabled": true
}
```

### Hugging Face Space model
```json
{
  "id": "my-space-model",
  "provider": "hf_space",
  "enabled": true,
  "description": "Space-backed OCR",
  "capabilities": ["ocr"],
  "space_id": "owner/space-name",
  "api_name": "/predict",
  "fallback_model": "native",
  "hf_token_env": "HF_TOKEN",
  "startup_cmd": "python app.py",
  "startup_cwd": "/absolute/path/to/cloned/space"
}
```

## Optional helper

To launch enabled local Space processes from registry entries with `startup_cmd`:

```bash
python3 backend/scripts/run_space_adapters.py
```
