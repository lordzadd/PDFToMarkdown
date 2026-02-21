from __future__ import annotations

import importlib
import importlib.util
import logging
import os
import tempfile
from typing import Any

from pdf2image import convert_from_path

from .base import ModelDefinition
from .common import apply_common_options, get_ocr_converter

logger = logging.getLogger(__name__)


class DeepSeekConverter:
    def __init__(self):
        self.last_run: dict[str, Any] = {
            "engine_used": "deepseek",
            "provider_used": "local",
            "fallback_used": False,
            "note": None,
        }
        self._preferred_model_id = os.getenv("DEEPSEEK_LOCAL_MODEL_ID", "deepseek-ai/DeepSeek-OCR")
        self._backup_model_id = os.getenv("DEEPSEEK_LOCAL_BACKUP_MODEL_ID", "microsoft/trocr-base-printed")
        self._attn_impl = os.getenv("DEEPSEEK_ATTN_IMPL", "eager")
        self._pipe = None
        self._loaded_model_id: str | None = None
        self._deepseek_model = None
        self._deepseek_tokenizer = None

    def is_available(self) -> tuple[bool, str | None]:
        if importlib.util.find_spec("torch") is None or importlib.util.find_spec("transformers") is None:
            return (True, "torch/transformers missing; using OCR fallback")
        if self._cuda_available():
            return (True, f"official deepseek local runtime available: {self._preferred_model_id}")
        return (
            True,
            "official DeepSeek-OCR requires CUDA; using local backup model on this machine",
        )

    def _cuda_available(self) -> bool:
        try:
            import torch

            return bool(torch.cuda.is_available())
        except Exception:
            return False

    def _patch_transformers_compat(self) -> None:
        # DeepSeek OCR custom code imports LlamaFlashAttention2, which is absent in some newer transformers builds.
        ml = importlib.import_module("transformers.models.llama.modeling_llama")
        if not hasattr(ml, "LlamaFlashAttention2") and hasattr(ml, "LlamaAttention"):
            setattr(ml, "LlamaFlashAttention2", ml.LlamaAttention)

    def _load_official_runtime(self) -> tuple[Any, Any]:
        if self._deepseek_model is not None and self._deepseek_tokenizer is not None:
            return self._deepseek_model, self._deepseek_tokenizer

        if not self._cuda_available():
            raise RuntimeError("DeepSeek-OCR official runtime requires CUDA-enabled local GPU")

        self._patch_transformers_compat()
        from transformers import AutoModel, AutoTokenizer

        tokenizer = AutoTokenizer.from_pretrained(self._preferred_model_id, trust_remote_code=True)
        model = AutoModel.from_pretrained(
            self._preferred_model_id,
            trust_remote_code=True,
            use_safetensors=True,
            _attn_implementation=self._attn_impl,
        )

        import torch

        model = model.eval().cuda().to(torch.bfloat16)
        self._deepseek_model = model
        self._deepseek_tokenizer = tokenizer
        return model, tokenizer

    def _load_backup_pipeline(self):
        if self._pipe is not None:
            return self._pipe

        from transformers import pipeline

        local_only = os.getenv("DEEPSEEK_LOCAL_FILES_ONLY", "false").lower() in {"1", "true", "yes"}
        self._pipe = pipeline(
            "image-to-text",
            model=self._backup_model_id,
            trust_remote_code=True,
            model_kwargs={"local_files_only": local_only},
        )
        self._loaded_model_id = self._backup_model_id
        return self._pipe

    def _extract_text(self, output: Any) -> str:
        if isinstance(output, str):
            return output
        if isinstance(output, dict):
            for key in ("generated_text", "text", "output"):
                val = output.get(key)
                if isinstance(val, str):
                    return val
        if isinstance(output, list):
            parts: list[str] = []
            for item in output:
                if isinstance(item, str):
                    parts.append(item)
                elif isinstance(item, dict):
                    txt = item.get("generated_text") or item.get("text") or item.get("output")
                    if isinstance(txt, str):
                        parts.append(txt)
            return "\n".join(parts)
        return ""

    def _run_official_deepseek(self, image_path: str, output_dir: str) -> str:
        model, tokenizer = self._load_official_runtime()
        prompt = "<image>\n<|grounding|>Convert the document to markdown. "
        result = model.infer(
            tokenizer,
            prompt=prompt,
            image_file=image_path,
            output_path=output_dir,
            base_size=1024,
            image_size=640,
            crop_mode=True,
            save_results=False,
            test_compress=False,
            eval_mode=True,
        )
        return (result or "").strip()

    def _run_backup(self, image_obj: Any) -> str:
        pipe = self._load_backup_pipeline()
        output = pipe(image_obj)
        return self._extract_text(output).strip()

    def convert(self, pdf_path: str, options: dict[str, Any] | None = None) -> str:
        has_runtime = importlib.util.find_spec("torch") is not None and importlib.util.find_spec("transformers") is not None
        if not has_runtime:
            reason = "torch/transformers missing; using OCR fallback"
            self.last_run = {
                "engine_used": "ocr-only",
                "provider_used": "local",
                "fallback_used": True,
                "note": reason,
            }
            markdown = get_ocr_converter().convert(pdf_path, None)
            return apply_common_options(markdown, options)

        max_pages = 2
        if isinstance(options, dict) and isinstance(options.get("maxPages"), int):
            max_pages = max(1, min(8, int(options["maxPages"])))

        pages_output: list[str] = []
        with tempfile.TemporaryDirectory(prefix="deepseek_local_") as tmp:
            images = convert_from_path(pdf_path, dpi=220, output_folder=tmp, fmt="png")
            deepseek_error: Exception | None = None
            use_official = os.getenv("DEEPSEEK_OFFICIAL_ENABLED", "true").lower() in {"1", "true", "yes"}

            for idx, image in enumerate(images[:max_pages], start=1):
                text = ""
                if use_official:
                    try:
                        page_path = os.path.join(tmp, f"page-{idx}.png")
                        image.save(page_path)
                        text = self._run_official_deepseek(page_path, tmp)
                    except Exception as exc:  # pragma: no cover - hardware/runtime dependent
                        deepseek_error = exc
                        if idx == 1:
                            logger.warning("deepseek official runtime failed: %s", exc)

                if not text:
                    try:
                        text = self._run_backup(image)
                    except Exception as exc:  # pragma: no cover - model/hardware dependent
                        logger.warning("deepseek local backup failed: %s", exc)
                        text = ""

                if text:
                    pages_output.append(f"## Page {idx}\n\n{text}")

            if not pages_output:
                self.last_run = {
                    "engine_used": "ocr-only",
                    "provider_used": "local",
                    "fallback_used": True,
                    "note": "DeepSeek and backup local runtimes returned no text; used OCR fallback",
                }
                markdown = get_ocr_converter().convert(pdf_path, None)
                return apply_common_options(markdown, options)

            used_official = use_official and deepseek_error is None and self._cuda_available()
            if used_official:
                self.last_run = {
                    "engine_used": "deepseek",
                    "provider_used": "local",
                    "fallback_used": False,
                    "note": f"official local model={self._preferred_model_id}",
                }
            else:
                note = f"local model={self._backup_model_id}"
                if deepseek_error is not None:
                    note = f"official deepseek unavailable ({deepseek_error}); backup {self._backup_model_id}"
                self.last_run = {
                    "engine_used": "deepseek-local-backup",
                    "provider_used": "local",
                    "fallback_used": True,
                    "note": note,
                }

        markdown = "\n\n".join(pages_output).strip() + "\n"
        return apply_common_options(markdown, options)


model = ModelDefinition(
    model_id="deepseek",
    description="DeepSeek OCR local runtime (CUDA path) with local backup OCR path and OCR-only fallback.",
    converter=DeepSeekConverter(),
    capabilities=["ocr", "multilingual", "markdown", "local-runtime"],
)
