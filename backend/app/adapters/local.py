from __future__ import annotations

from typing import Any, Optional

from ..models.base import ModelDefinition
from .base import AdapterExecution, AdapterHealth, AdapterInfo


class LocalModelAdapter:
    def __init__(self, model: ModelDefinition, enabled: bool = True):
        self.model = model
        self.info = AdapterInfo(
            model_id=model.model_id,
            description=model.description,
            capabilities=model.capabilities,
            provider="local",
            enabled=enabled,
        )

    def health(self) -> AdapterHealth:
        ok, note = self.model.is_available()
        return AdapterHealth(ok=ok, note=note)

    def convert(self, pdf_path: str, options: Optional[dict[str, Any]] = None) -> str:
        return self.model.converter.convert(pdf_path, options)

    def convert_with_meta(
        self, pdf_path: str, options: Optional[dict[str, Any]] = None
    ) -> tuple[str, AdapterExecution]:
        markdown = self.model.converter.convert(pdf_path, options)
        run = getattr(self.model.converter, "last_run", None)

        if isinstance(run, dict):
            engine_used = str(run.get("engine_used") or self.info.model_id)
            provider_used = str(run.get("provider_used") or self.info.provider)
            fallback_used = bool(run.get("fallback_used", False))
            note = run.get("note")
            note = str(note) if isinstance(note, str) else None
        else:
            available, reason = self.model.is_available()
            engine_used = self.info.model_id if available else "native"
            provider_used = self.info.provider
            fallback_used = not available and self.info.model_id != "native"
            note = reason

        return (
            markdown,
            AdapterExecution(
                requested_model=self.info.model_id,
                engine_used=engine_used,
                provider_used=provider_used,
                fallback_used=fallback_used,
                note=note,
            ),
        )
