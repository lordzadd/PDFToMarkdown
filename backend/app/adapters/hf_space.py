from __future__ import annotations

import logging
import os
import tempfile
from typing import Any, Optional

from pdf2image import convert_from_path

from .base import AdapterExecution, AdapterHealth, AdapterInfo

logger = logging.getLogger(__name__)


class HfSpaceAdapter:
    def __init__(
        self,
        model_id: str,
        description: str,
        capabilities: list[str],
        space_id: str,
        api_name: str = "/predict",
        enabled: bool = True,
        hf_token_env: str = "HF_TOKEN",
        fallback_adapter=None,
    ):
        self.space_id = space_id
        self.api_name = api_name
        self.hf_token_env = hf_token_env
        self.fallback_adapter = fallback_adapter
        self.info = AdapterInfo(
            model_id=model_id,
            description=description,
            capabilities=capabilities,
            provider="hf_space",
            enabled=enabled,
        )

    def _build_client(self):
        try:
            from gradio_client import Client
        except Exception:
            return None, "gradio_client is not installed"

        token = os.getenv(self.hf_token_env)
        try:
            client = Client(self.space_id, hf_token=token)
            return client, None
        except Exception as exc:
            return None, f"failed to init gradio client: {exc}"

    def health(self) -> AdapterHealth:
        client, err = self._build_client()
        if client is None:
            if self.fallback_adapter is not None:
                fallback_health = self.fallback_adapter.health()
                return AdapterHealth(
                    ok=fallback_health.ok,
                    note=f"space unavailable ({err}); fallback={self.fallback_adapter.info.model_id}",
                )
            return AdapterHealth(ok=False, note=err)

        try:
            client.view_api(all_endpoints=False)
            return AdapterHealth(ok=True, note=None)
        except Exception as exc:
            if self.fallback_adapter is not None:
                fallback_health = self.fallback_adapter.health()
                return AdapterHealth(
                    ok=fallback_health.ok,
                    note=f"space ping failed ({exc}); fallback={self.fallback_adapter.info.model_id}",
                )
            return AdapterHealth(ok=False, note=f"space ping failed: {exc}")

    def convert(self, pdf_path: str, options: Optional[dict[str, Any]] = None) -> str:
        markdown, _ = self.convert_with_meta(pdf_path, options)
        return markdown

    def convert_with_meta(
        self, pdf_path: str, options: Optional[dict[str, Any]] = None
    ) -> tuple[str, AdapterExecution]:
        client, err = self._build_client()
        if client is None:
            if self.fallback_adapter is not None:
                logger.warning(
                    "hf space %s unavailable (%s), falling back to %s",
                    self.space_id,
                    err,
                    self.fallback_adapter.info.model_id,
                )
                if hasattr(self.fallback_adapter, "convert_with_meta"):
                    markdown, fallback_meta = self.fallback_adapter.convert_with_meta(pdf_path, options)
                else:
                    markdown = self.fallback_adapter.convert(pdf_path, options)
                    fallback_meta = AdapterExecution(
                        requested_model=self.info.model_id,
                        engine_used=self.fallback_adapter.info.model_id,
                        provider_used=self.fallback_adapter.info.provider,
                        fallback_used=True,
                        note=err,
                    )
                fallback_meta.requested_model = self.info.model_id
                fallback_meta.fallback_used = True
                if not fallback_meta.note:
                    fallback_meta.note = err
                return markdown, fallback_meta
            raise RuntimeError(err or "Space client unavailable")

        try:
            # Try direct PDF input first.
            result = client.predict(pdf_path, api_name=self.api_name)
            markdown = self._extract_markdown(result)
            if markdown:
                return (
                    markdown,
                    AdapterExecution(
                        requested_model=self.info.model_id,
                        engine_used=self.info.model_id,
                        provider_used=self.info.provider,
                        fallback_used=False,
                        note=None,
                    ),
                )
        except Exception:
            pass

        try:
            # Try page image input if space expects images.
            with tempfile.TemporaryDirectory(prefix="hfspace_") as tmp:
                pages = convert_from_path(pdf_path, dpi=220, output_folder=tmp, fmt="png")
                if not pages:
                    raise RuntimeError("No pages rendered for space input")
                image_path = os.path.join(tmp, "page_1.png")
                pages[0].save(image_path, format="PNG")
                result = client.predict(image_path, api_name=self.api_name)
                markdown = self._extract_markdown(result)
                if markdown:
                    return (
                        markdown,
                        AdapterExecution(
                            requested_model=self.info.model_id,
                            engine_used=self.info.model_id,
                            provider_used=self.info.provider,
                            fallback_used=False,
                            note=None,
                        ),
                    )
        except Exception:
            pass

        if self.fallback_adapter is not None:
            logger.warning(
                "hf space %s returned no markdown, falling back to %s",
                self.space_id,
                self.fallback_adapter.info.model_id,
            )
            if hasattr(self.fallback_adapter, "convert_with_meta"):
                markdown, fallback_meta = self.fallback_adapter.convert_with_meta(pdf_path, options)
            else:
                markdown = self.fallback_adapter.convert(pdf_path, options)
                fallback_meta = AdapterExecution(
                    requested_model=self.info.model_id,
                    engine_used=self.fallback_adapter.info.model_id,
                    provider_used=self.fallback_adapter.info.provider,
                    fallback_used=True,
                    note="hf space returned no parseable markdown output",
                )
            fallback_meta.requested_model = self.info.model_id
            fallback_meta.fallback_used = True
            if not fallback_meta.note:
                fallback_meta.note = "hf space returned no parseable markdown output"
            return markdown, fallback_meta

        raise RuntimeError("HF Space returned no parseable markdown output")

    def _extract_markdown(self, result: Any) -> str:
        if isinstance(result, str):
            return result
        if isinstance(result, dict):
            for key in ["markdown", "text", "output", "result"]:
                value = result.get(key)
                if isinstance(value, str):
                    return value
        if isinstance(result, (list, tuple)):
            for item in result:
                if isinstance(item, str):
                    return item
                if isinstance(item, dict):
                    for key in ["markdown", "text", "output", "result"]:
                        value = item.get(key)
                        if isinstance(value, str):
                            return value
        return ""
