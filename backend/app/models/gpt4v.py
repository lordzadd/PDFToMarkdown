from __future__ import annotations

import base64
import importlib.util
import logging
import os
import tempfile
from typing import Any

from pdf2image import convert_from_path

from .base import ModelDefinition
from .common import apply_common_options, get_ocr_converter

logger = logging.getLogger(__name__)


class GPT4VConverter:
    def __init__(self):
        self.last_run: dict[str, Any] = {
            "engine_used": "gpt4v",
            "provider_used": "local",
            "fallback_used": False,
            "note": None,
        }

    def is_available(self) -> tuple[bool, str | None]:
        if importlib.util.find_spec("openai") is None:
            return (True, "OpenAI package missing; using OCR fallback")
        if not os.getenv("OPENAI_API_KEY"):
            return (True, "OPENAI_API_KEY missing; using OCR fallback")
        return (True, None)

    def convert(self, pdf_path: str, options: dict[str, Any] | None = None) -> str:
        has_openai = importlib.util.find_spec("openai") is not None
        has_key = bool(os.getenv("OPENAI_API_KEY"))
        if not has_openai or not has_key:
            reason = "OpenAI runtime unavailable; using OCR fallback"
            if not has_openai:
                reason = "OpenAI package missing; using OCR fallback"
            elif not has_key:
                reason = "OPENAI_API_KEY missing; using OCR fallback"
            logger.info("gpt4v unavailable (%s)", reason)
            self.last_run = {
                "engine_used": "ocr-only",
                "provider_used": "local",
                "fallback_used": True,
                "note": reason,
            }
            markdown = get_ocr_converter().convert(pdf_path, None)
            return apply_common_options(markdown, options)

        from openai import OpenAI

        client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])

        max_pages = 2
        if isinstance(options, dict) and isinstance(options.get("maxPages"), int):
            max_pages = max(1, min(8, int(options["maxPages"])))

        pages: list[str] = []
        try:
            with tempfile.TemporaryDirectory(prefix="gpt4v_") as temp_dir:
                images = convert_from_path(pdf_path, dpi=200, output_folder=temp_dir, fmt="png")
                for index, image in enumerate(images[:max_pages], start=1):
                    tmp_img = os.path.join(temp_dir, f"page_{index}.png")
                    image.save(tmp_img, format="PNG")
                    with open(tmp_img, "rb") as f:
                        b64 = base64.b64encode(f.read()).decode("ascii")

                    response = client.chat.completions.create(
                        model="gpt-4.1",
                        messages=[
                            {
                                "role": "user",
                                "content": [
                                    {
                                        "type": "text",
                                        "text": (
                                            "Convert this PDF page to markdown. Preserve headings, lists, tables, and equations. "
                                            "Return only markdown content."
                                        ),
                                    },
                                    {
                                        "type": "image_url",
                                        "image_url": {
                                            "url": f"data:image/png;base64,{b64}",
                                            "detail": "high",
                                        },
                                    },
                                ],
                            }
                        ],
                        max_tokens=4096,
                    )

                    page_markdown = response.choices[0].message.content or ""
                    pages.append(f"## Page {index}\n\n{page_markdown.strip()}")
        except Exception as exc:
            logger.warning("gpt4v request failed (%s), using OCR fallback", exc)
            self.last_run = {
                "engine_used": "ocr-only",
                "provider_used": "local",
                "fallback_used": True,
                "note": f"gpt4v request failed: {exc}",
            }
            markdown = get_ocr_converter().convert(pdf_path, None)
            return apply_common_options(markdown, options)

        markdown = "\n\n".join(pages).strip() + "\n"
        self.last_run = {
            "engine_used": "gpt4v",
            "provider_used": "local",
            "fallback_used": False,
            "note": None,
        }
        return apply_common_options(markdown, options)


model = ModelDefinition(
    model_id="gpt4v",
    description="OpenAI GPT-4V conversion (image-based) with OCR-only fallback when API key/runtime is unavailable.",
    converter=GPT4VConverter(),
    capabilities=["vision-llm", "context-understanding", "equations", "tables"],
)
