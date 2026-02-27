from __future__ import annotations

import importlib.util
import logging
import os
import tempfile
from typing import Any

import fitz

from .base import ModelDefinition
from .common import apply_common_options, get_max_pages, get_ocr_converter

logger = logging.getLogger(__name__)


class MarkItDownConverter:
    def __init__(self):
        self.last_run: dict[str, Any] = {
            "engine_used": "markitdown",
            "provider_used": "local",
            "fallback_used": False,
            "note": None,
        }

    def is_available(self) -> tuple[bool, str | None]:
        if importlib.util.find_spec("markitdown") is None:
            return (False, "markitdown missing")
        try:
            from markitdown import MarkItDown  # type: ignore

            _ = MarkItDown
        except Exception as exc:
            return (False, f"markitdown import failed: {exc}")
        return (True, "local markitdown runtime")

    def _limited_pdf(self, pdf_path: str, max_pages: int | None) -> tuple[str, str | None, str | None]:
        if not max_pages:
            return pdf_path, None, None

        with fitz.open(pdf_path) as source_doc:
            total_pages = len(source_doc)
            if total_pages <= max_pages:
                return pdf_path, None, None

            with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as limited_pdf:
                limited_path = limited_pdf.name

            with fitz.open() as target_doc:
                target_doc.insert_pdf(source_doc, from_page=0, to_page=max_pages - 1)
                target_doc.save(limited_path)

            note = (
                f"\\n\\n> Truncated to first {max_pages} pages out of {total_pages}. "
                "Increase `maxPages` in options for full-document conversion.\\n"
            )
            return limited_path, limited_path, note

    def convert(self, pdf_path: str, options: dict[str, Any] | None = None) -> str:
        if importlib.util.find_spec("markitdown") is None:
            self.last_run = {
                "engine_used": "ocr-only",
                "provider_used": "local",
                "fallback_used": True,
                "note": "markitdown missing; using OCR fallback",
            }
            markdown = get_ocr_converter().convert(pdf_path, options)
            return apply_common_options(markdown, options)

        max_pages = get_max_pages(options)
        source_pdf, temp_path, truncation_note = self._limited_pdf(pdf_path, max_pages)

        try:
            from markitdown import MarkItDown  # type: ignore

            converter = MarkItDown()
            result = converter.convert(source_pdf)
            markdown = (
                getattr(result, "text_content", None)
                or getattr(result, "markdown", None)
                or getattr(result, "content", None)
                or ""
            )

            if not isinstance(markdown, str) or not markdown.strip():
                raise RuntimeError("MarkItDown returned empty content")

            if truncation_note:
                markdown = markdown.rstrip() + truncation_note

            self.last_run = {
                "engine_used": "markitdown",
                "provider_used": "local",
                "fallback_used": False,
                "note": "local markitdown runtime",
            }
            return apply_common_options(markdown.rstrip() + "\n", options)
        except Exception as exc:
            logger.warning("markitdown runtime failed (%s), using OCR fallback", exc)
            self.last_run = {
                "engine_used": "ocr-only",
                "provider_used": "local",
                "fallback_used": True,
                "note": f"MarkItDown runtime failed: {exc}",
            }
            markdown = get_ocr_converter().convert(pdf_path, options)
            return apply_common_options(markdown, options)
        finally:
            if temp_path:
                try:
                    os.unlink(temp_path)
                except OSError:
                    pass


model = ModelDefinition(
    model_id="markitdown",
    description="Microsoft MarkItDown adapter with OCR fallback.",
    converter=MarkItDownConverter(),
    capabilities=["markdown", "ocr", "documents", "local-runtime"],
)
