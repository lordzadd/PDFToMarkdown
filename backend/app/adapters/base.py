from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional, Protocol


@dataclass
class AdapterHealth:
    ok: bool
    note: Optional[str] = None


@dataclass
class AdapterInfo:
    model_id: str
    description: str
    capabilities: list[str] = field(default_factory=list)
    provider: str = "local"
    enabled: bool = True
    supports_options: list[str] = field(default_factory=list)
    latency_hint: Optional[str] = None
    cost_hint: Optional[str] = None


@dataclass
class AdapterExecution:
    requested_model: str
    engine_used: str
    provider_used: str
    fallback_used: bool = False
    note: Optional[str] = None


class ModelAdapter(Protocol):
    info: AdapterInfo

    def health(self) -> AdapterHealth:
        ...

    def convert(self, pdf_path: str, options: Optional[dict[str, Any]] = None) -> str:
        ...

    def convert_with_meta(
        self, pdf_path: str, options: Optional[dict[str, Any]] = None
    ) -> tuple[str, AdapterExecution]:
        ...
