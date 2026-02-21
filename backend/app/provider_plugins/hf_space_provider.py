from __future__ import annotations

from typing import Any, Optional

from ..adapters.hf_space import HfSpaceAdapter
from .base import BuildContext


class HfSpaceProviderPlugin:
    provider = "hf_space"

    def validate(self, entry: dict[str, Any]) -> None:
        model_id = entry.get("id")
        if not isinstance(model_id, str) or not model_id:
            raise ValueError("hf_space provider entry requires non-empty string `id`")

        space_id = entry.get("space_id")
        if not isinstance(space_id, str) or not space_id:
            raise ValueError(f"hf_space entry `{model_id}` requires non-empty string `space_id`")

        api_name = entry.get("api_name")
        if api_name is not None and not isinstance(api_name, str):
            raise ValueError(f"hf_space entry `{model_id}` has invalid `api_name` (must be string)")

        fallback_model = entry.get("fallback_model")
        if fallback_model is not None and not isinstance(fallback_model, str):
            raise ValueError(f"hf_space entry `{model_id}` has invalid `fallback_model` (must be string)")

        supports_options = entry.get("supports_options")
        if supports_options is not None and (
            not isinstance(supports_options, list) or not all(isinstance(v, str) for v in supports_options)
        ):
            raise ValueError(f"hf_space entry `{model_id}` has invalid `supports_options` (must be list[str])")

    def build(self, entry: dict[str, Any], context: BuildContext) -> Optional[HfSpaceAdapter]:
        fallback_id = entry.get("fallback_model")
        fallback_adapter = context.resolve_adapter(fallback_id) if isinstance(fallback_id, str) else None

        if isinstance(fallback_id, str) and fallback_adapter is None:
            # unresolved dependency; let registry retry after more adapters are built
            return None

        adapter = HfSpaceAdapter(
            model_id=entry["id"],
            description=entry.get("description", f"HF Space adapter for {entry.get('space_id')}"),
            capabilities=entry.get("capabilities", ["ocr"]),
            space_id=entry["space_id"],
            api_name=entry.get("api_name", "/predict"),
            enabled=True,
            hf_token_env=entry.get("hf_token_env", "HF_TOKEN"),
            fallback_adapter=fallback_adapter,
        )
        adapter.info.supports_options = list(entry.get("supports_options", []))
        adapter.info.latency_hint = entry.get("latency_hint")
        adapter.info.cost_hint = entry.get("cost_hint")
        return adapter


plugin = HfSpaceProviderPlugin()
