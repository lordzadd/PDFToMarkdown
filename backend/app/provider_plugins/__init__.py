from __future__ import annotations

import importlib
import pkgutil

from .base import ProviderPlugin


def discover_provider_plugins() -> dict[str, ProviderPlugin]:
    plugins: dict[str, ProviderPlugin] = {}

    for mod_info in pkgutil.iter_modules(__path__):  # type: ignore[name-defined]
        if mod_info.name in {"base"}:
            continue
        module = importlib.import_module(f"{__name__}.{mod_info.name}")
        plugin = getattr(module, "plugin", None)
        if plugin is None:
            continue
        provider = getattr(plugin, "provider", None)
        if not isinstance(provider, str) or not provider:
            continue
        if provider in plugins:
            raise ValueError(f"Duplicate provider plugin: {provider}")
        plugins[provider] = plugin

    return plugins
