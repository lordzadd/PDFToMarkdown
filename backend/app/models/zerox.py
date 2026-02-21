from __future__ import annotations

import asyncio
import importlib.util
import logging
import os
import tempfile
from typing import Any

import fitz

from .base import ModelDefinition
from .common import apply_common_options, get_max_pages, get_ocr_converter

logger = logging.getLogger(__name__)


class ZeroXConverter:
    def __init__(self):
        self.last_run: dict[str, Any] = {
            "engine_used": "zerox",
            "provider_used": "api",
            "fallback_used": False,
            "note": None,
        }

    def is_available(self) -> tuple[bool, str | None]:
        if importlib.util.find_spec("pyzerox") is None:
            return (True, "py-zerox missing; using OCR fallback")
        if not os.getenv("OPENAI_API_KEY"):
            return (True, "OPENAI_API_KEY missing for py-zerox; using OCR fallback")
        return (True, "py-zerox runtime")

    def _limited_pdf(self, pdf_path: str, max_pages: int | None) -> tuple[str, str | None]:
        if not max_pages:
            return pdf_path, None

        with fitz.open(pdf_path) as source_doc:
            total_pages = len(source_doc)
            if total_pages <= max_pages:
                return pdf_path, None

            with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as limited_pdf:
                limited_path = limited_pdf.name

            with fitz.open() as target_doc:
                target_doc.insert_pdf(source_doc, from_page=0, to_page=max_pages - 1)
                target_doc.save(limited_path)

            return limited_path, limited_path

    def _extract_markdown(self, payload: Any) -> str:
        if isinstance(payload, str):
            return payload

        if isinstance(payload, dict):
            pages = payload.get("pages")
            if isinstance(pages, list):
                collected: list[str] = []
                for page in pages:
                    if isinstance(page, dict):
                        content = page.get("markdown") or page.get("content") or page.get("text")
                        if isinstance(content, str) and content.strip():
                            collected.append(content.strip())
                    elif isinstance(page, str) and page.strip():
                        collected.append(page.strip())
                if collected:
                    return "\n\n".join(collected)

            for key in ("markdown", "content", "text"):
                value = payload.get(key)
                if isinstance(value, str) and value.strip():
                    return value

        if isinstance(payload, list):
            parts: list[str] = []
            for item in payload:
                text = self._extract_markdown(item)
                if text.strip():
                    parts.append(text.strip())
            if parts:
                return "\n\n".join(parts)

        return ""

    def convert(self, pdf_path: str, options: dict[str, Any] | None = None) -> str:
        if importlib.util.find_spec("pyzerox") is None:
            self.last_run = {
                "engine_used": "ocr-only",
                "provider_used": "local",
                "fallback_used": True,
                "note": "py-zerox missing; using OCR fallback",
            }
            markdown = get_ocr_converter().convert(pdf_path, options)
            return apply_common_options(markdown, options)

        if not os.getenv("OPENAI_API_KEY"):
            self.last_run = {
                "engine_used": "ocr-only",
                "provider_used": "local",
                "fallback_used": True,
                "note": "OPENAI_API_KEY missing for py-zerox; using OCR fallback",
            }
            markdown = get_ocr_converter().convert(pdf_path, options)
            return apply_common_options(markdown, options)

        max_pages = get_max_pages(options)
        source_pdf, temp_path = self._limited_pdf(pdf_path, max_pages)

        try:
            from pyzerox import zerox  # type: ignore

            kwargs: dict[str, Any] = {
                "file_path": source_pdf,
                "cleanup": True,
            }
            if os.getenv("ZEROX_MODEL"):
                kwargs["model"] = os.getenv("ZEROX_MODEL")
            if os.getenv("ZEROX_MODEL_PROVIDER"):
                kwargs["model_provider"] = os.getenv("ZEROX_MODEL_PROVIDER")

            result = asyncio.run(zerox(**kwargs))
            markdown = self._extract_markdown(result)
            if not markdown.strip():
                raise RuntimeError("ZeroX returned empty content")

            self.last_run = {
                "engine_used": "zerox",
                "provider_used": "api",
                "fallback_used": False,
                "note": "py-zerox runtime",
            }
            return apply_common_options(markdown.rstrip() + "\n", options)
        except Exception as exc:
            logger.warning("zerox runtime failed (%s), using OCR fallback", exc)
            self.last_run = {
                "engine_used": "ocr-only",
                "provider_used": "local",
                "fallback_used": True,
                "note": f"ZeroX runtime failed: {exc}",
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
    model_id="zerox",
    description="OmniAI ZeroX adapter (API-backed) with OCR fallback.",
    converter=ZeroXConverter(),
    capabilities=["ocr", "markdown", "llm-assisted"],
)
