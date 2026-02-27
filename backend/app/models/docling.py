from __future__ import annotations

import importlib.util
import os
import tempfile
from typing import Any

import fitz

from .base import ModelDefinition
from .common import apply_common_options, apply_docling_options, get_max_pages, get_ocr_converter


class DoclingConverter:
    def __init__(self):
        self.last_run: dict[str, Any] = {
            "engine_used": "docling",
            "provider_used": "local",
            "fallback_used": False,
            "note": None,
        }

    def is_available(self) -> tuple[bool, str | None]:
        if importlib.util.find_spec("docling") is None:
            return (False, "Docling runtime missing")
        try:
            from docling.document_converter import DocumentConverter  # type: ignore

            _ = DocumentConverter
        except Exception as exc:
            return (False, f"Docling import failed: {exc}")
        return (True, None)

    def convert(self, pdf_path: str, options: dict[str, Any] | None = None) -> str:
        available, reason = self.is_available()
        max_pages = get_max_pages(options)
        source_pdf_path = pdf_path
        bounded_suffix = ""

        if max_pages:
            with fitz.open(pdf_path) as source_doc:
                total_pages = len(source_doc)
                if total_pages > max_pages:
                    bounded_suffix = (
                        f"\n\n> Truncated to first {max_pages} pages out of {total_pages}. "
                        "Increase `maxPages` in options for fuller Docling output.\n"
                    )
                    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as limited_pdf:
                        limited_path = limited_pdf.name
                    with fitz.open() as target_doc:
                        target_doc.insert_pdf(source_doc, from_page=0, to_page=max_pages - 1)
                        target_doc.save(limited_path)
                    source_pdf_path = limited_path

        try:
            markdown = ""
            if available:
                try:
                    from docling.document_converter import DocumentConverter  # type: ignore

                    converter = DocumentConverter()
                    result = converter.convert(source_pdf_path)
                    markdown = result.document.export_to_markdown()
                    if not isinstance(markdown, str) or not markdown.strip():
                        reason = "docling conversion returned empty content"
                        markdown = ""
                    self.last_run = {
                        "engine_used": "docling",
                        "provider_used": "local",
                        "fallback_used": False,
                        "note": None,
                    }
                except Exception as exc:
                    reason = f"docling conversion failed at runtime: {exc}"
                    markdown = ""

            if not markdown:
                fallback_reason = reason or "docling conversion failed at runtime"
                self.last_run = {
                    "engine_used": "ocr-only",
                    "provider_used": "local",
                    "fallback_used": True,
                    "note": fallback_reason,
                }
                markdown = get_ocr_converter().convert(pdf_path, options)

            markdown = apply_common_options(markdown, options)
            markdown = apply_docling_options(markdown, options)
            if bounded_suffix:
                markdown = markdown.rstrip() + bounded_suffix
            return markdown
        finally:
            if source_pdf_path != pdf_path:
                try:
                    os.unlink(source_pdf_path)
                except OSError:
                    pass


model = ModelDefinition(
    model_id="docling",
    description="Docling converter with segmentation options; falls back to OCR-only when docling is unavailable.",
    converter=DoclingConverter(),
    capabilities=["segmentation", "multilingual", "tables", "ocr-enhancement"],
)
