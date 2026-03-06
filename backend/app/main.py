from __future__ import annotations

import os
import tempfile
from typing import Any, Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from .adapter_registry import AdapterRegistry
from .chart_model_registry import extract_with_chart_model, list_chart_models
from .models.common import parse_options_json


class ModelInfo(BaseModel):
    model_id: str
    description: str
    capabilities: list[str]
    provider: str
    enabled: bool
    available: bool
    availability_note: Optional[str] = None
    supports_options: list[str] = []
    latency_hint: Optional[str] = None
    cost_hint: Optional[str] = None


class ConversionResponse(BaseModel):
    model_id: str
    markdown: str
    execution: dict[str, Any]
    charts: list[dict[str, Any]] = []
    chart_execution: dict[str, Any] | None = None


class ChartModelInfo(BaseModel):
    model_id: str
    name: str
    description: str
    enabled: bool
    available: bool
    availability_note: Optional[str] = None


app = FastAPI(title="PDF to Markdown Model Server", version="3.0.0")
REGISTRY = AdapterRegistry()


@app.get("/health")
def health() -> dict:
    adapters = REGISTRY.all()
    details = {}
    for model_id, adapter in adapters.items():
        h = adapter.health()
        details[model_id] = {
            "available": h.ok,
            "note": h.note,
            "provider": adapter.info.provider,
        }
    return {"ok": True, "models": sorted(adapters.keys()), "availability": details}


@app.head("/health")
def health_head() -> dict:
    return {}


@app.get("/models", response_model=list[ModelInfo])
def list_models() -> list[ModelInfo]:
    output: list[ModelInfo] = []
    for model_id, adapter in REGISTRY.all().items():
        h = adapter.health()
        output.append(
            ModelInfo(
                model_id=model_id,
                description=adapter.info.description,
                capabilities=adapter.info.capabilities,
                provider=adapter.info.provider,
                enabled=adapter.info.enabled,
                available=h.ok,
                availability_note=h.note,
                supports_options=adapter.info.supports_options,
                latency_hint=adapter.info.latency_hint,
                cost_hint=adapter.info.cost_hint,
            )
        )
    return output


@app.get("/chart-models", response_model=list[ChartModelInfo])
def list_chart_model_options() -> list[ChartModelInfo]:
    output: list[ChartModelInfo] = []
    for item in list_chart_models():
        output.append(
            ChartModelInfo(
                model_id=str(item.get("model_id") or ""),
                name=str(item.get("name") or item.get("model_id") or ""),
                description=str(item.get("description") or ""),
                enabled=bool(item.get("enabled")),
                available=bool(item.get("available")),
                availability_note=item.get("availability_note") if isinstance(item.get("availability_note"), str) else None,
            )
        )
    return output


@app.post("/convert/{model_id}", response_model=ConversionResponse)
async def convert_pdf(
    model_id: str,
    file: UploadFile | None = File(default=None),
    pdf: UploadFile | None = File(default=None),
    options: str = Form(default="{}"),
) -> ConversionResponse:
    adapter = REGISTRY.get(model_id)
    if adapter is None:
        raise HTTPException(status_code=404, detail=f"Unknown model: {model_id}")

    uploaded = file or pdf
    if uploaded is None:
        raise HTTPException(status_code=400, detail="No PDF uploaded in field `file` (or legacy field `pdf`).")

    filename = uploaded.filename or "upload.pdf"
    if not filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Uploaded file must be a PDF")

    parsed_options: dict[str, Any] = parse_options_json(options)

    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as temp_file:
            temp_path = temp_file.name
            temp_file.write(await uploaded.read())

        if hasattr(adapter, "convert_with_meta"):
            markdown, execution_meta = adapter.convert_with_meta(temp_path, parsed_options)
            execution = {
                "requested_model": execution_meta.requested_model,
                "engine_used": execution_meta.engine_used,
                "provider_used": execution_meta.provider_used,
                "fallback_used": execution_meta.fallback_used,
                "note": execution_meta.note,
            }
        else:
            markdown = adapter.convert(temp_path, parsed_options)
            execution = {
                "requested_model": model_id,
                "engine_used": model_id,
                "provider_used": adapter.info.provider,
                "fallback_used": False,
                "note": None,
            }

        chart_model_id = parsed_options.get("chartModel") if isinstance(parsed_options.get("chartModel"), str) else None
        charts: list[dict[str, Any]] = []
        chart_execution: dict[str, Any]
        try:
            charts, chart_execution = extract_with_chart_model(
                chart_model_id,
                markdown,
                temp_path,
                parsed_options,
            )
        except Exception as chart_exc:
            chart_execution = {
                "engine_used": chart_model_id or "heuristic-graph-v1",
                "fallback_used": True,
                "note": f"Chart extraction failed: {chart_exc}",
            }

        return ConversionResponse(
            model_id=model_id,
            markdown=markdown,
            execution=execution,
            charts=charts,
            chart_execution=chart_execution,
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    finally:
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)
