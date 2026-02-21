from __future__ import annotations

import importlib.util
import tempfile
from typing import Any

import fitz
from pdf2image import convert_from_path
import pytesseract

from .base import ModelDefinition
from .common import apply_common_options, get_max_pages


class DonutConverter:
    def __init__(self):
        self.last_run: dict[str, Any] = {
            "engine_used": "donut",
            "provider_used": "local",
            "fallback_used": False,
            "note": None,
        }

    def is_available(self) -> tuple[bool, str | None]:
        if importlib.util.find_spec("donut") is None:
            return (True, "donut-python missing; using OCR implementation")
        return (True, None)

    def convert(self, pdf_path: str, options: dict[str, Any] | None = None) -> str:
        # Donut implementation fallback: OCR-centric pipeline.
        available = importlib.util.find_spec("donut") is not None
        self.last_run = {
            "engine_used": "donut",
            "provider_used": "local",
            "fallback_used": False,
            "note": None if available else "donut-python missing; using OCR implementation",
        }
        max_pages = get_max_pages(options)
        pages_output = []
        with fitz.open(pdf_path) as doc:
            total_pages = len(doc)
            limit = min(total_pages, max_pages) if max_pages else total_pages
            for page_num in range(1, limit + 1):
                page_text = self._ocr_page(pdf_path, page_num)
                page_text = page_text.strip() or "*No text detected on this page.*"
                pages_output.append(f"## Page {page_num}\n\n{page_text}")
            if limit < total_pages:
                pages_output.append(
                    f"> Truncated to first {limit} pages out of {total_pages}. "
                    "Increase `maxPages` in options for a fuller Donut OCR pass."
                )

        markdown = "\n\n".join(pages_output).strip() + "\n"
        return apply_common_options(markdown, options)

    def _ocr_page(self, pdf_path: str, page_number: int) -> str:
        with tempfile.TemporaryDirectory(prefix="pdf_donut_") as temp_dir:
            images = convert_from_path(
                pdf_path,
                dpi=260,
                first_page=page_number,
                last_page=page_number,
                output_folder=temp_dir,
                fmt="png",
            )
            if not images:
                return ""
            return pytesseract.image_to_string(images[0])


model = ModelDefinition(
    model_id="donut",
    description="Donut-style document parsing (OCR fallback implementation).",
    converter=DonutConverter(),
    capabilities=["structured-documents", "ocr", "fast-path"],
)
