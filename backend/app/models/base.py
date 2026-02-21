from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Protocol


class ModelConverter(Protocol):
    def convert(self, pdf_path: str, options: dict[str, Any] | None = None) -> str:
        ...


@dataclass(frozen=True)
class ModelDefinition:
    model_id: str
    description: str
    converter: ModelConverter
    capabilities: list[str] = field(default_factory=list)

    def is_available(self) -> tuple[bool, str | None]:
        checker = getattr(self.converter, "is_available", None)
        if checker is None:
            return True, None
        return checker()
