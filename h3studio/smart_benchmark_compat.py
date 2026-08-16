"""Final compatibility guard for Smart Benchmark workflow values.

Old alpha workflows briefly serialized ``benchmark_mode=''`` and allowed
``max_scenarios`` values above the current four-scenario product limit. ComfyUI
validates widget values before ``run()`` gets a chance to normalize them, so a
strict enum/max in INPUT_TYPES can reject an otherwise recoverable workflow.

Keep the execution limit at four inside smart_benchmark_restore._run, but make
the validation surface permissive enough to accept those old serialized values.
"""

from __future__ import annotations

from typing import Any

from .nodes.smart_benchmark import H3StudioSmartBenchmark

_INSTALLED = False


def install() -> None:
    global _INSTALLED
    if _INSTALLED:
        return
    _INSTALLED = True

    previous = H3StudioSmartBenchmark.INPUT_TYPES.__func__

    def input_types(cls) -> dict[str, Any]:
        base = previous(cls)
        required = dict(base.get("required", {}))

        # Accept legacy serialized values during ComfyUI prompt validation.
        # Execution still clamps this to four scenarios in smart_benchmark_restore.
        required["max_scenarios"] = (
            "INT",
            {"default": 4, "min": 1, "max": 24, "step": 1},
        )

        # The mode is no longer a real user-facing choice. STRING accepts the
        # old blank value while the runtime ignores it and always uses Unified.
        required["benchmark_mode"] = (
            "STRING",
            {"default": "Unified"},
        )

        return {**base, "required": required}

    H3StudioSmartBenchmark.INPUT_TYPES = classmethod(input_types)
