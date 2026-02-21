from __future__ import annotations

from typing import Any, Optional

from ..adapters.local import LocalModelAdapter
from .base import BuildContext


class LocalProviderPlugin:
    provider = "local"

    def validate(self, entry: dict[str, Any]) -> None:
        model_id = entry.get("id")
        if not isinstance(model_id, str) or not model_id:
            raise ValueError("local provider entry requires non-empty string `id`")

        local_model = entry.get("local_model")
        if local_model is not None and (not isinstance(local_model, str) or not local_model):
            raise ValueError("local provider field `local_model` must be a non-empty string when provided")

        supports_options = entry.get("supports_options")
        if supports_options is not None and (
            not isinstance(supports_options, list) or not all(isinstance(v, str) for v in supports_options)
        ):
            raise ValueError("local provider field `supports_options` must be a list of strings")

    def build(self, entry: dict[str, Any], context: BuildContext) -> Optional[LocalModelAdapter]:
        model_key = entry.get("local_model") or entry.get("id")
        model = context.local_models.get(model_key)
        if model is None:
            raise ValueError(f"unknown local model `{model_key}` for entry `{entry.get('id')}`")

        adapter = LocalModelAdapter(model, enabled=True)
        adapter.info.supports_options = list(entry.get("supports_options", []))
        adapter.info.latency_hint = entry.get("latency_hint")
        adapter.info.cost_hint = entry.get("cost_hint")
        return adapter


plugin = LocalProviderPlugin()
