from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Optional, Protocol

from ..adapters.base import ModelAdapter
from ..models.base import ModelDefinition


@dataclass
class BuildContext:
    local_models: dict[str, ModelDefinition]
    resolve_adapter: Callable[[str], Optional[ModelAdapter]]


class ProviderPlugin(Protocol):
    provider: str

    def validate(self, entry: dict[str, Any]) -> None:
        ...

    def build(self, entry: dict[str, Any], context: BuildContext) -> Optional[ModelAdapter]:
        ...
