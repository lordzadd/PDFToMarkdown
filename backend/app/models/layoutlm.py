from __future__ import annotations

import fitz
from typing import Any

from .base import ModelDefinition
from .common import apply_common_options, get_ocr_converter


class LayoutLMConverter:
    def __init__(self):
        self.last_run: dict[str, Any] = {
            "engine_used": "layoutlm",
            "provider_used": "local",
            "fallback_used": False,
            "note": None,
        }

    def convert(self, pdf_path: str, options: dict[str, Any] | None = None) -> str:
        pages = []
        with fitz.open(pdf_path) as doc:
            for idx, page in enumerate(doc, start=1):
                blocks = page.get_text("blocks")
                blocks = sorted(blocks, key=lambda b: (b[1], b[0]))

                content = []
                for block in blocks:
                    text = (block[4] or "").strip()
                    if not text:
                        continue

                    if len(text) < 80 and text.isupper():
                        content.append(f"### {text}")
                    else:
                        content.append(text)

                page_markdown = "\n\n".join(content).strip() or "*No text detected on this page.*"
                pages.append(f"## Page {idx}\n\n{page_markdown}")

        markdown = "\n\n".join(pages).strip() + "\n"
        if len(markdown.strip()) < 80:
            self.last_run = {
                "engine_used": "ocr-only",
                "provider_used": "local",
                "fallback_used": True,
                "note": "layout extraction too sparse; using OCR fallback",
            }
            markdown = get_ocr_converter().convert(pdf_path, None)
        else:
            self.last_run = {
                "engine_used": "layoutlm",
                "provider_used": "local",
                "fallback_used": False,
                "note": None,
            }
        return apply_common_options(markdown, options)


model = ModelDefinition(
    model_id="layoutlm",
    description="Layout-oriented conversion with block ordering and heading heuristics.",
    converter=LayoutLMConverter(),
    capabilities=["layout-awareness", "tables", "forms"],
)
