from __future__ import annotations

import logging
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any

from .base import ModelDefinition
from .common import apply_common_options, get_ocr_converter

logger = logging.getLogger(__name__)


class NougatConverter:
    def __init__(self):
        self.last_run: dict[str, Any] = {
            "engine_used": "nougat",
            "provider_used": "local",
            "fallback_used": False,
            "note": None,
        }

    def is_available(self) -> tuple[bool, str | None]:
        binary = shutil.which("nougat")
        if binary is None:
            return (True, "Nougat CLI unavailable; using OCR fallback")
        try:
            proc = subprocess.run([binary, "--help"], capture_output=True, text=True, timeout=20)
            if proc.returncode == 0:
                return (True, None)
            return (True, "Nougat CLI not runnable; using OCR fallback")
        except Exception:
            return (True, "Nougat CLI failed to start; using OCR fallback")

    def convert(self, pdf_path: str, options: dict[str, Any] | None = None) -> str:
        binary = shutil.which("nougat")
        if binary is None:
            reason = "Nougat CLI unavailable; using OCR fallback"
            logger.warning("nougat adapter unavailable (%s)", reason)
            self.last_run = {
                "engine_used": "ocr-only",
                "provider_used": "local",
                "fallback_used": True,
                "note": reason,
            }
            markdown = get_ocr_converter().convert(pdf_path, None)
            return apply_common_options(markdown, options)

        with tempfile.TemporaryDirectory(prefix="nougat_") as out_dir:
            try:
                proc = subprocess.run(
                    [binary, pdf_path, "--out", out_dir],
                    capture_output=True,
                    text=True,
                    check=False,
                )
            except Exception:
                proc = subprocess.CompletedProcess(args=[binary], returncode=1)
            if proc.returncode != 0:
                logger.warning("nougat cli failed (code=%s), using OCR fallback", proc.returncode)
                self.last_run = {
                    "engine_used": "ocr-only",
                    "provider_used": "local",
                    "fallback_used": True,
                    "note": f"nougat cli failed with exit code {proc.returncode}",
                }
                markdown = get_ocr_converter().convert(pdf_path, None)
                return apply_common_options(markdown, options)

            md_files = sorted(Path(out_dir).glob("*.mmd"))
            if not md_files:
                logger.warning("nougat produced no output file, using OCR fallback")
                self.last_run = {
                    "engine_used": "ocr-only",
                    "provider_used": "local",
                    "fallback_used": True,
                    "note": "nougat produced no markdown output file",
                }
                markdown = get_ocr_converter().convert(pdf_path, None)
                return apply_common_options(markdown, options)

            self.last_run = {
                "engine_used": "nougat",
                "provider_used": "local",
                "fallback_used": False,
                "note": None,
            }
            markdown = md_files[0].read_text(encoding="utf-8")
            return apply_common_options(markdown, options)


model = ModelDefinition(
    model_id="nougat",
    description="Nougat OCR for scientific PDFs; falls back to OCR-only extractor if CLI is unavailable.",
    converter=NougatConverter(),
    capabilities=["scientific-pdf", "equations", "tables"],
)
