from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, Optional

from .adapters.base import ModelAdapter
from .model_loader import load_models
from .provider_plugins import discover_provider_plugins
from .provider_plugins.base import BuildContext


class AdapterRegistry:
    def __init__(self, registry_path: Optional[str] = None):
        self.registry_path = Path(registry_path or Path(__file__).resolve().parents[1] / "model_registry.json")
        self.local_models = load_models()
        self.provider_plugins = discover_provider_plugins()
        self.adapters: Dict[str, ModelAdapter] = {}
        self._load_registry()

    def _load_registry(self) -> None:
        if not self.registry_path.exists():
            raise FileNotFoundError(f"Model registry not found: {self.registry_path}")

        data = json.loads(self.registry_path.read_text(encoding="utf-8"))
        entries = [entry for entry in data.get("models", []) if entry.get("enabled", True)]

        context = BuildContext(
            local_models=self.local_models,
            resolve_adapter=lambda model_id: self.adapters.get(model_id),
        )

        # Validate entries first so schema errors fail fast and clearly.
        for entry in entries:
            provider = entry.get("provider")
            plugin = self.provider_plugins.get(provider)
            if plugin is None:
                raise ValueError(f"Unknown model provider `{provider}` in entry `{entry.get('id')}`")
            plugin.validate(entry)

        # Build adapters with dependency retry (for fallback chains).
        pending = list(entries)
        while pending:
            next_pending: list[dict[str, Any]] = []
            progressed = False
            for entry in pending:
                plugin = self.provider_plugins[entry["provider"]]
                adapter = plugin.build(entry, context)
                if adapter is None:
                    next_pending.append(entry)
                    continue
                self.adapters[entry["id"]] = adapter
                progressed = True

            if not next_pending:
                break
            if not progressed:
                unresolved = ", ".join(str(entry.get("id")) for entry in next_pending)
                raise ValueError(f"Unresolved model dependencies in registry: {unresolved}")
            pending = next_pending

    def get(self, model_id: str) -> Optional[ModelAdapter]:
        return self.adapters.get(model_id)

    def all(self) -> Dict[str, ModelAdapter]:
        return dict(self.adapters)
