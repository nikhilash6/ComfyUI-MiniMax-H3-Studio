"""Small web endpoints for runtime capability and benchmark asset discovery."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from .constants import SAMPLING_PROFILES
from .runtime_optimization import RUNTIME_LABELS, detect_capabilities


def _normalize(value: Any) -> str:
    return str(value or "").replace("\\", "/").strip()


def _compact(value: Any) -> str:
    return "".join(ch for ch in _normalize(value).lower() if ch.isalnum())


def _size(category: str, name: str) -> int:
    try:
        import folder_paths
        path = folder_paths.get_full_path(category, name)
        return int(Path(path).stat().st_size) if path else 0
    except Exception:
        return 0


def _files(*categories: str) -> list[tuple[str, str]]:
    import folder_paths

    values: dict[str, str] = {}
    for category in categories:
        try:
            mapped = folder_paths.map_legacy(category)
        except Exception:
            mapped = category
        try:
            for name in folder_paths.get_filename_list(category):
                normalized = _normalize(name)
                if normalized:
                    values.setdefault(normalized, mapped)
        except Exception:
            continue
    return sorted(values.items(), key=lambda item: item[0].casefold())


def _route_for_model(name: str) -> str:
    compact = _compact(name)
    if "ref2va" in compact or "ref2v" in compact:
        return "ref2va"
    if "fl2va" in compact or "fl2v" in compact:
        return "fl2va"
    return "unknown"


def _quant_for_name(name: str) -> str:
    compact = _compact(name)
    for label, token in (
        ("W4A8", "w4a8"),
        ("NVFP4", "nvfp4"),
        ("INT8 ConvRoT", "int8convrot"),
        ("FP8", "fp8"),
        ("BF16", "bf16"),
        ("GGUF", "gguf"),
    ):
        if token in compact:
            return label
    return ""


def _recommended_lora_strengths() -> dict[str, float]:
    result: dict[str, float] = {}
    for metadata in SAMPLING_PROFILES.values():
        artifact = _normalize(metadata.get("lora_artifact"))
        if artifact and metadata.get("lora_strength") is not None:
            result[artifact.split("/")[-1].casefold()] = float(metadata["lora_strength"])
    try:
        from .acceleration import PDD_PROFILES
        for profile in PDD_PROFILES.values():
            result[_normalize(profile.lora_filename).split("/")[-1].casefold()] = float(profile.lora_strength)
    except Exception:
        pass
    return result


def asset_catalog() -> dict[str, Any]:
    strengths = _recommended_lora_strengths()
    models = []
    for name, category in _files("diffusion_models", "unet"):
        compact = _compact(name)
        if "minimax" not in compact and "h3" not in compact:
            continue
        models.append({
            "name": name,
            "category": category,
            "route": _route_for_model(name),
            "quantization": _quant_for_name(name),
            "size_bytes": _size(category, name),
        })

    loras = []
    for name, category in _files("loras"):
        base = name.split("/")[-1].casefold()
        loras.append({
            "name": name,
            "size_bytes": _size(category, name),
            "recommended_strength": strengths.get(base),
            "known_h3": any(token in _compact(name) for token in ("minimax", "h3", "lightx", "pdd")),
        })

    encoders = []
    for name, category in _files("text_encoders", "clip"):
        if "qwen3vl" not in _compact(name):
            continue
        encoders.append({"name": name, "size_bytes": _size(category, name), "quantization": _quant_for_name(name)})

    vaes = []
    for name, category in _files("vae", "vae_approx"):
        compact = _compact(name)
        if not any(token in compact for token in ("minimaxh3", "taeh3")):
            continue
        vaes.append({"name": name, "category": category, "size_bytes": _size(category, name), "quantization": _quant_for_name(name)})

    return {
        "models": models,
        "loras": loras,
        "text_encoders": encoders,
        "vaes": vaes,
        "sampling_profiles": [
            {
                "key": key,
                "label": str(metadata.get("label") or key),
                "route": metadata.get("route"),
                "steps": metadata.get("steps"),
                "lora_strength": metadata.get("lora_strength"),
                "lora_artifact": metadata.get("lora_artifact"),
            }
            for key, metadata in SAMPLING_PROFILES.items()
        ],
        "runtime_presets": [{"key": key, "label": label} for key, label in RUNTIME_LABELS.items()],
    }


def register_runtime_routes() -> None:
    try:
        from aiohttp import web
        from server import PromptServer
    except ImportError:
        return

    server = getattr(PromptServer, "instance", None)
    if server is None or getattr(server, "_h3studio_runtime_routes_registered", False):
        return
    server._h3studio_runtime_routes_registered = True

    @server.routes.get("/h3studio/runtime/capabilities")
    async def h3studio_runtime_capabilities(_request):
        return web.json_response(
            {"capabilities": detect_capabilities().as_dict(), "presets": RUNTIME_LABELS},
            headers={"Cache-Control": "no-store"},
        )

    @server.routes.get("/h3studio/assets")
    async def h3studio_assets(_request):
        try:
            return web.json_response(asset_catalog(), headers={"Cache-Control": "no-store"})
        except Exception as exc:
            return web.json_response(
                {"error": f"Could not enumerate H3 Studio assets: {type(exc).__name__}: {exc}"},
                status=500,
                headers={"Cache-Control": "no-store"},
            )
