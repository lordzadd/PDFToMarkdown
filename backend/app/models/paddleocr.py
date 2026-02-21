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


class PaddleOcrConverter:
    def __init__(self):
        self.last_run: dict[str, Any] = {
            "engine_used": "paddleocr",
            "provider_used": "local",
            "fallback_used": False,
            "note": None,
        }
        self._ocr = None

    def is_available(self) -> tuple[bool, str | None]:
        if importlib.util.find_spec("paddleocr") is None:
            return (True, "paddleocr missing; using OCR fallback")
        return (True, "local paddleocr runtime")

    def _load_ocr(self):
        if self._ocr is not None:
            return self._ocr

        from paddleocr import PaddleOCR  # type: ignore

        os.environ.setdefault("PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK", "True")
        lang = os.getenv("PADDLEOCR_LANG", "en")
        self._ocr = PaddleOCR(
            lang=lang,
            device="cpu",
            use_doc_orientation_classify=False,
            use_doc_unwarping=False,
            use_textline_orientation=False,
        )
        return self._ocr

    def convert(self, pdf_path: str, options: dict[str, Any] | None = None) -> str:
        if importlib.util.find_spec("paddleocr") is None:
            self.last_run = {
                "engine_used": "ocr-only",
                "provider_used": "local",
                "fallback_used": True,
                "note": "paddleocr missing; using OCR fallback",
            }
            markdown = get_ocr_converter().convert(pdf_path, None)
            return apply_common_options(markdown, options)

        max_pages = None
        if isinstance(options, dict) and isinstance(options.get("maxPages"), int):
            max_pages = max(1, min(40, int(options["maxPages"])))

        try:
            ocr = self._load_ocr()
            pages_output: list[str] = []
            with tempfile.TemporaryDirectory(prefix="paddleocr_") as tmp:
                images = convert_from_path(pdf_path, dpi=96, output_folder=tmp, fmt="png")
                images_to_process = images[:max_pages] if max_pages else images
                for idx, image in enumerate(images_to_process, start=1):
                    result = ocr.ocr(np.array(image))
                    lines: list[str] = []
                    if result:
                        for page_result in result:
                            if not page_result:
                                continue
                            if isinstance(page_result, dict):
                                rec_texts = page_result.get("rec_texts", [])
                                for text in rec_texts:
                                    if isinstance(text, str) and text.strip():
                                        lines.append(text.strip())
                            else:
                                # Compatibility with older PaddleOCR outputs.
                                for entry in page_result:
                                    try:
                                        text = entry[1][0]
                                    except Exception:
                                        text = ""
                                    if isinstance(text, str) and text.strip():
                                        lines.append(text.strip())
                    text = "\n".join(lines).strip() or "*No text detected on this page.*"
                    pages_output.append(f"## Page {idx}\n\n{text}")

            self.last_run = {
                "engine_used": "paddleocr",
                "provider_used": "local",
                "fallback_used": False,
                "note": "local paddleocr runtime",
            }
            markdown = "\n\n".join(pages_output).strip() + "\n"
            return apply_common_options(markdown, options)
        except Exception as exc:
            logger.warning("paddleocr local runtime failed (%s), using OCR fallback", exc)
            self.last_run = {
                "engine_used": "ocr-only",
                "provider_used": "local",
                "fallback_used": True,
                "note": f"PaddleOCR local runtime failed: {exc}",
            }
            markdown = get_ocr_converter().convert(pdf_path, None)
            return apply_common_options(markdown, options)


model = ModelDefinition(
    model_id="paddleocr",
    description="PaddleOCR local adapter (China) with OCR-only fallback.",
    converter=PaddleOcrConverter(),
    capabilities=["ocr", "multilingual", "markdown", "local-runtime"],
)
