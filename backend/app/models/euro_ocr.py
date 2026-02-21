from __future__ import annotations

import importlib.util
import logging
import os
import tempfile
from typing import Any

import numpy as np
from pdf2image import convert_from_path

from .base import ModelDefinition
from .common import apply_common_options, get_ocr_converter

logger = logging.getLogger(__name__)


class EuroOcrConverter:
    def __init__(self):
        self.last_run: dict[str, Any] = {
            "engine_used": "euro-ocr",
            "provider_used": "local",
            "fallback_used": False,
            "note": None,
        }
        self._reader = None

    def is_available(self) -> tuple[bool, str | None]:
        if importlib.util.find_spec("easyocr") is None:
            return (True, "easyocr missing; using OCR fallback")
        return (True, "local easyocr runtime")

    def _load_reader(self):
        if self._reader is not None:
            return self._reader

        import easyocr

        langs = os.getenv("EURO_OCR_LANGS", "en,fr,de,es,it,pt,nl").split(",")
        langs = [l.strip() for l in langs if l.strip()]
        self._reader = easyocr.Reader(langs, gpu=False)
        return self._reader

    def convert(self, pdf_path: str, options: dict[str, Any] | None = None) -> str:
        if importlib.util.find_spec("easyocr") is None:
            reason = "easyocr missing; using OCR fallback"
            self.last_run = {
                "engine_used": "ocr-only",
                "provider_used": "local",
                "fallback_used": True,
                "note": reason,
            }
            markdown = get_ocr_converter().convert(pdf_path, None)
            return apply_common_options(markdown, options)

        max_pages = 10
        if isinstance(options, dict) and isinstance(options.get("maxPages"), int):
            max_pages = max(1, min(40, int(options["maxPages"])))

        try:
            reader = self._load_reader()
            pages_output: list[str] = []
            with tempfile.TemporaryDirectory(prefix="euro_ocr_") as tmp:
                images = convert_from_path(pdf_path, dpi=260, output_folder=tmp, fmt="png")
                for idx, image in enumerate(images[:max_pages], start=1):
                    lines = reader.readtext(np.array(image), detail=0, paragraph=True)
                    text = "\n".join(line for line in lines if isinstance(line, str) and line.strip()).strip()
                    text = text or "*No text detected on this page.*"
                    pages_output.append(f"## Page {idx}\n\n{text}")

            self.last_run = {
                "engine_used": "euro-ocr",
                "provider_used": "local",
                "fallback_used": False,
                "note": "local easyocr runtime",
            }
            markdown = "\n\n".join(pages_output).strip() + "\n"
            return apply_common_options(markdown, options)
        except Exception as exc:
            logger.warning("euro-ocr local runtime failed (%s), using OCR fallback", exc)
            self.last_run = {
                "engine_used": "ocr-only",
                "provider_used": "local",
                "fallback_used": True,
                "note": f"Euro OCR local runtime failed: {exc}",
            }
            markdown = get_ocr_converter().convert(pdf_path, None)
            return apply_common_options(markdown, options)


model = ModelDefinition(
    model_id="euro-ocr",
    description="European multilingual local OCR via EasyOCR, with OCR-only fallback.",
    converter=EuroOcrConverter(),
    capabilities=["ocr", "multilingual", "markdown", "local-runtime"],
)
