import logging
import os
import re
import tempfile
from dataclasses import dataclass
from typing import List, Optional

import fitz  # PyMuPDF

try:
    from pdf2image import convert_from_path
except Exception:  # pragma: no cover
    convert_from_path = None

try:
    import pytesseract
except Exception:  # pragma: no cover
    pytesseract = None


@dataclass
class PageConversionResult:
    page_number: int
    markdown: str


class PDFConverter:
    def __init__(self) -> None:
        logging.basicConfig(
            level=logging.INFO,
            format="%(asctime)s - %(levelname)s - %(message)s",
        )
        self.logger = logging.getLogger(__name__)

    def process_pdf(self, pdf_path: str, output_path: Optional[str] = None) -> str:
        markdown = self.convert_to_markdown(pdf_path)

        if output_path:
            output_dir = os.path.dirname(output_path)
            if output_dir:
                os.makedirs(output_dir, exist_ok=True)
            with open(output_path, "w", encoding="utf-8") as md_file:
                md_file.write(markdown)
            self.logger.info("Saved markdown to %s", output_path)

        return markdown

    def convert_to_markdown(self, pdf_path: str) -> str:
        if not os.path.isfile(pdf_path):
            raise FileNotFoundError(f"PDF not found: {pdf_path}")

        self.logger.info("Processing PDF: %s", pdf_path)
        pages: List[PageConversionResult] = []

        with fitz.open(pdf_path) as doc:
            for index, page in enumerate(doc, start=1):
                page_markdown = self._extract_page_markdown(page)

                # OCR fallback for scanned/image-heavy pages.
                if len(page_markdown.strip()) < 30:
                    ocr_text = self._ocr_page(pdf_path, index)
                    if ocr_text:
                        page_markdown = self._format_text_to_markdown(ocr_text)

                pages.append(PageConversionResult(page_number=index, markdown=page_markdown.strip()))

        rendered_pages = [
            f"## Page {page.page_number}\n\n{page.markdown or '*No text detected on this page.*'}"
            for page in pages
        ]
        return "\n\n".join(rendered_pages).strip() + "\n"

    def _extract_page_markdown(self, page: fitz.Page) -> str:
        text_dict = page.get_text("dict")
        blocks = text_dict.get("blocks", [])

        text_blocks = []
        for block in blocks:
            if block.get("type") != 0:
                continue

            block_lines = []
            for line in block.get("lines", []):
                spans = line.get("spans", [])
                line_text = "".join(span.get("text", "") for span in spans).strip()
                if line_text:
                    block_lines.append(line_text)

            if block_lines:
                y0 = float(block.get("bbox", [0, 0, 0, 0])[1])
                x0 = float(block.get("bbox", [0, 0, 0, 0])[0])
                text_blocks.append((y0, x0, "\n".join(block_lines)))

        text_blocks.sort(key=lambda item: (item[0], item[1]))
        merged_text = "\n\n".join(block_text for _, _, block_text in text_blocks)
        return self._format_text_to_markdown(merged_text)

    def _ocr_page(self, pdf_path: str, page_number: int) -> str:
        if convert_from_path is None or pytesseract is None:
            return ""

        self.logger.info("Falling back to OCR for page %s", page_number)
        try:
            with tempfile.TemporaryDirectory(prefix="pdf_ocr_") as temp_dir:
                images = convert_from_path(
                    pdf_path,
                    dpi=250,
                    first_page=page_number,
                    last_page=page_number,
                    output_folder=temp_dir,
                    fmt="png",
                )
                if not images:
                    return ""

                return pytesseract.image_to_string(images[0]).strip()
        except Exception as exc:
            self.logger.warning("OCR fallback unavailable for page %s: %s", page_number, str(exc))
            return ""

    def _format_text_to_markdown(self, text: str) -> str:
        lines = [line.rstrip() for line in text.splitlines()]
        normalized: List[str] = []

        for line in lines:
            stripped = line.strip()
            if not stripped:
                normalized.append("")
                continue

            if self._looks_like_heading(stripped):
                heading = stripped.rstrip(":")
                normalized.append(f"### {heading}")
                continue

            if re.match(r"^(?:[-*•]|\d+[.)])\s+", stripped):
                normalized.append(stripped)
                continue

            normalized.append(stripped)

        # Collapse excessive empty lines.
        markdown = "\n".join(normalized)
        markdown = re.sub(r"\n{3,}", "\n\n", markdown)
        return markdown.strip()

    def _looks_like_heading(self, line: str) -> bool:
        words = line.split()
        if len(words) == 0 or len(words) > 12:
            return False

        if line.isupper() and len(line) > 3:
            return True

        title_case_ratio = sum(1 for w in words if w[:1].isupper()) / max(1, len(words))
        if title_case_ratio >= 0.7 and not line.endswith("."):
            return True

        if re.match(r"^(Chapter|Section|Part)\s+\d+", line, flags=re.IGNORECASE):
            return True

        return False
