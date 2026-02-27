from __future__ import annotations

from typing import Any

import fitz
import pytesseract
from PIL import Image, ImageOps

from .base import ModelDefinition
from .common import apply_common_options, get_max_pages, render_pdf_images


class OcrOnlyConverter:
    def _preprocess_for_ocr(self, image: Image.Image) -> Image.Image:
        gray = image.convert("L")
        enhanced = ImageOps.autocontrast(gray)
        resampling = getattr(Image, "Resampling", Image)
        upscaled = enhanced.resize((enhanced.width * 2, enhanced.height * 2), resampling.BICUBIC)
        bw = upscaled.point(lambda p: 0 if p < 185 else 255, mode="1")
        return bw.convert("L")

    def convert(self, pdf_path: str, options: dict[str, Any] | None = None) -> str:
        max_pages = get_max_pages(options)
        pages_output = []
        with fitz.open(pdf_path) as doc:
            total_pages = len(doc)
            limit = min(total_pages, max_pages) if max_pages else total_pages
            images = render_pdf_images(pdf_path, max_pages=limit, dpi=220)
            for page_num in range(1, limit + 1):
                page_text = self._ocr_page(images, doc, page_num)
                page_text = page_text.strip() or "*No text detected on this page.*"
                pages_output.append(f"## Page {page_num}\n\n{page_text}")
            if limit < total_pages:
                pages_output.append(
                    f"> Truncated to first {limit} pages out of {total_pages}. "
                    "Increase `maxPages` in options for full-document OCR."
                )
        markdown = "\n\n".join(pages_output).strip() + "\n"
        return apply_common_options(markdown, options)

    def _ocr_page(self, images: list, doc: fitz.Document, page_number: int) -> str:
        if not images or page_number > len(images):
            return ""

        image = images[page_number - 1]
        try:
            best_text = ""
            candidates = [self._preprocess_for_ocr(image), image]
            for candidate in candidates:
                for config in ("--oem 3 --psm 6", "--oem 3 --psm 11", "--oem 1 --psm 6"):
                    text = pytesseract.image_to_string(candidate, lang="eng", config=config)
                    if len(text.strip()) > len(best_text.strip()):
                        best_text = text
            if best_text.strip():
                return best_text
        except Exception:
            pass

        # Last-resort text extraction when Tesseract is unavailable.
        if 1 <= page_number <= len(doc):
            return doc.load_page(page_number - 1).get_text("text")
        return ""


model = ModelDefinition(
    model_id="ocr-only",
    description="Force OCR on every page using PyMuPDF rasterization + Tesseract.",
    converter=OcrOnlyConverter(),
    capabilities=["ocr", "scanned-pdf"],
)
