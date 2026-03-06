from __future__ import annotations

from dataclasses import dataclass
from typing import Any

try:
    import cv2  # type: ignore
except Exception:  # pragma: no cover
    cv2 = None

from .chart_geometry import extract_geometry_graph_charts
from .chart_sidecar import extract_charts_sidecar


@dataclass(frozen=True)
class ChartModelDef:
    model_id: str
    name: str
    description: str
    enabled: bool = True


CHART_MODELS: dict[str, ChartModelDef] = {
    "geometry-graph-v1": ChartModelDef(
        model_id="geometry-graph-v1",
        name="Geometry Graph v1",
        description="OpenCV-based node/edge geometry extraction from page images with OCR-assisted labels.",
    ),
    "heuristic-graph-v1": ChartModelDef(
        model_id="heuristic-graph-v1",
        name="Heuristic Graph v1",
        description="OCR-token heuristic with reconstructed graph preview for manual correction.",
    ),
    "conservative-v1": ChartModelDef(
        model_id="conservative-v1",
        name="Conservative v1",
        description="Conservative chart extraction with lower hallucination tolerance.",
    ),
}


def list_chart_models() -> list[dict[str, Any]]:
    cv2_available = cv2 is not None
    return [
        {
            "model_id": item.model_id,
            "name": item.name,
            "description": item.description,
            "enabled": item.enabled,
            "available": bool(item.enabled and (cv2_available or item.model_id != "geometry-graph-v1")),
            "availability_note": (
                "OpenCV unavailable in this runtime."
                if item.model_id == "geometry-graph-v1" and not cv2_available
                else None
            ),
        }
        for item in CHART_MODELS.values()
    ]


def extract_with_chart_model(
    chart_model_id: str | None,
    markdown: str,
    _pdf_path: str | None = None,
    _options: dict[str, Any] | None = None,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    selected = chart_model_id or "geometry-graph-v1"
    if selected not in CHART_MODELS:
        selected = "geometry-graph-v1"

    charts: list[dict[str, Any]] = []
    fallback_used = False
    note: str | None = None

    if selected == "geometry-graph-v1":
        if _pdf_path:
            try:
                charts = extract_geometry_graph_charts(_pdf_path, markdown)
            except Exception as exc:
                fallback_used = True
                note = f"geometry extraction failed ({exc}), using sidecar fallback"
        else:
            fallback_used = True
            note = "geometry extraction requires pdf input; using sidecar fallback"

        if not charts:
            charts = extract_charts_sidecar(markdown)
            fallback_used = True

    if selected == "conservative-v1":
        for chart in charts:
            flags = chart.get("flags")
            if isinstance(flags, list) and "inferred-edges" in flags:
                chart["confidence"] = min(float(chart.get("confidence") or 0.0), 0.15)
                chart["flags"] = list(dict.fromkeys([*flags, "conservative-filtered"]))

    execution = {
        "engine_used": selected,
        "fallback_used": fallback_used,
        "note": note if note else (None if charts else "No charts detected"),
    }
    return charts, execution
