import importlib
import pkgutil
from typing import Dict

from .models.base import ModelDefinition


def load_models() -> Dict[str, ModelDefinition]:
    models: Dict[str, ModelDefinition] = {}
    package_name = "backend.app.models"

    package = importlib.import_module(package_name)
    for module_info in pkgutil.iter_modules(package.__path__):
        module_name = module_info.name
        if module_name in {"base"} or module_name.startswith("_"):
            continue

        module = importlib.import_module(f"{package_name}.{module_name}")
        model = getattr(module, "model", None)
        if model is None:
            continue

        if not isinstance(model, ModelDefinition):
            raise TypeError(f"Model module '{module_name}' has invalid 'model' export")

        if model.model_id in models:
            raise ValueError(f"Duplicate model_id '{model.model_id}'")

        models[model.model_id] = model

    return models
