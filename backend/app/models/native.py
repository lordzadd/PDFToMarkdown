from __future__ import annotations

from typing import Any

from .base import ModelDefinition
from .common import apply_common_options, get_native_converter


class NativeConverter:
    def convert(self, pdf_path: str, options: dict[str, Any] | None = None) -> str:
        markdown = get_native_converter().convert_to_markdown(pdf_path)
        return apply_common_options(markdown, options)


model = ModelDefinition(
    model_id="native",
    description="PyMuPDF text extraction with Tesseract OCR fallback for scanned pages.",
    converter=NativeConverter(),
    capabilities=["text-extraction", "ocr-fallback", "tables", "equations"],
)
