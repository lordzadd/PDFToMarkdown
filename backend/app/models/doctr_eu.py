from __future__ import annotations

import importlib.util
import logging
from typing import Any

import numpy as np

from .base import ModelDefinition
from .common import apply_common_options, get_max_pages, get_ocr_converter, render_pdf_images

logger = logging.getLogger(__name__)


class DoctrEuConverter:
    def __init__(self):
        self.last_run: dict[str, Any] = {
            "engine_used": "doctr-eu",
            "provider_used": "local",
            "fallback_used": False,
            "note": None,
        }
        self._predictor = None

    def is_available(self) -> tuple[bool, str | None]:
        if importlib.util.find_spec("doctr") is None:
            return (True, "python-doctr missing; using OCR fallback")
        return (True, "local docTR (Mindee) runtime")

    def _load_predictor(self):
        if self._predictor is not None:
            return self._predictor
        from doctr.models import ocr_predictor  # type: ignore

        # Lightweight architecture choices for local usage.
        self._predictor = ocr_predictor(
            det_arch="db_resnet50",
            reco_arch="crnn_vgg16_bn",
            pretrained=True,
        )
        return self._predictor

    def convert(self, pdf_path: str, options: dict[str, Any] | None = None) -> str:
        if importlib.util.find_spec("doctr") is None:
            self.last_run = {
                "engine_used": "ocr-only",
                "provider_used": "local",
                "fallback_used": True,
                "note": "python-doctr missing; using OCR fallback",
            }
            markdown = get_ocr_converter().convert(pdf_path, None)
            return apply_common_options(markdown, options)

        max_pages = get_max_pages(options)
        if isinstance(max_pages, int):
            max_pages = max(1, min(30, max_pages))

        try:
            predictor = self._load_predictor()
            pages_output: list[str] = []
            images = render_pdf_images(pdf_path, max_pages=max_pages, dpi=230)
            for idx, image in enumerate(images, start=1):
                doc = predictor([np.array(image)])
                page_text: list[str] = []
                if doc and getattr(doc, "pages", None):
                    page = doc.pages[0]
                    for block in page.blocks:
                        for line in block.lines:
                            words = [w.value for w in line.words if getattr(w, "value", "")]
                            if words:
                                page_text.append(" ".join(words))
                text = "\n".join(page_text).strip() or "*No text detected on this page.*"
                pages_output.append(f"## Page {idx}\n\n{text}")

            self.last_run = {
                "engine_used": "doctr-eu",
                "provider_used": "local",
                "fallback_used": False,
                "note": "local docTR (Mindee) runtime",
            }
            markdown = "\n\n".join(pages_output).strip() + "\n"
            return apply_common_options(markdown, options)
        except Exception as exc:
            logger.warning("doctr-eu local runtime failed (%s), using OCR fallback", exc)
            self.last_run = {
                "engine_used": "ocr-only",
                "provider_used": "local",
                "fallback_used": True,
                "note": f"docTR runtime failed: {exc}",
            }
            markdown = get_ocr_converter().convert(pdf_path, None)
            return apply_common_options(markdown, options)


model = ModelDefinition(
    model_id="doctr-eu",
    description="docTR by Mindee (Europe) local OCR adapter with OCR-only fallback.",
    converter=DoctrEuConverter(),
    capabilities=["ocr", "multilingual", "markdown", "local-runtime"],
)
