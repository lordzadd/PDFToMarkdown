from __future__ import annotations

import json
import re
from pathlib import Path
import sys
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[3]
SCRIPTS_DIR = REPO_ROOT / "Scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.append(str(SCRIPTS_DIR))

from pdf_converter import PDFConverter  # type: ignore  # noqa: E402


_native_converter: PDFConverter | None = None
_ocr_converter: Any | None = None


def get_native_converter() -> PDFConverter:
    global _native_converter
    if _native_converter is None:
        _native_converter = PDFConverter()
    return _native_converter


def get_ocr_converter() -> Any:
    global _ocr_converter
    if _ocr_converter is None:
        from .ocr_only import OcrOnlyConverter

        _ocr_converter = OcrOnlyConverter()
    return _ocr_converter


def apply_common_options(markdown: str, options: dict[str, Any] | None) -> str:
    if not options:
        return markdown

    result = markdown

    preserve_tables = options.get("preserveTables")
    if preserve_tables is False:
        # Remove simple markdown tables.
        result = re.sub(r"(?:^\|.*\|\n)+", "", result, flags=re.MULTILINE)

    preserve_equations = options.get("preserveEquations")
    if preserve_equations is False:
        result = re.sub(r"\$\$.*?\$\$", "[Equation removed]", result, flags=re.DOTALL)
        result = re.sub(r"\$[^\$]+\$", "[Inline equation removed]", result)

    quality = options.get("qualityLevel")
    if isinstance(quality, (int, float)) and quality < 45:
        # Simulate low quality mode requested by frontend.
        result = re.sub(r"\b([A-Za-z]{8,})\b", lambda m: m.group(1)[:-1] + "?", result)

    return result


def apply_docling_options(markdown: str, options: dict[str, Any] | None) -> str:
    if not options:
        return markdown

    segmentation = options.get("segmentation", {})
    if not isinstance(segmentation, dict):
        return markdown

    sections = [markdown.strip()]

    if segmentation.get("enableTextSegmentation"):
        sections.append("\n\n---\n\n### Segmentation Notes\nText segmentation enabled.")

    if segmentation.get("enableLayoutSegmentation"):
        sections.append("Layout segmentation enabled.")

    if segmentation.get("enableTableSegmentation"):
        sections.append("Table segmentation enabled.")

    if segmentation.get("enableImageSegmentation"):
        sections.append("Image segmentation enabled.")

    level = segmentation.get("segmentationLevel")
    if isinstance(level, str):
        sections.append(f"Segmentation level: `{level}`")

    return "\n".join(sections).strip() + "\n"


def parse_options_json(raw: str | None) -> dict[str, Any]:
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
    except Exception:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def get_max_pages(options: dict[str, Any] | None) -> int | None:
    if not options:
        return None
    raw = options.get("maxPages")
    if not isinstance(raw, int):
        return None
    if raw <= 0:
        return None
    return raw
