"""Workload-aware runtime optimization for MiniMax H3 Studio.

The planner is deliberately independent from sampling profiles. Base/LightX/PDD
choose the denoising recipe; this module only chooses execution kernels and
memory-pressure patches.
"""

from __future__ import annotations

import logging
import platform
import threading
from collections import OrderedDict
from dataclasses import asdict, dataclass
from typing import Any, Mapping

LOGGER = logging.getLogger(__name__)

RUNTIME_PRESETS = (
    "auto",
    "og_current",
    "quality",
    "fast",
    "low_vram",
    "extreme_low_vram",
)

RUNTIME_LABELS = {
    "auto": "Auto",
    "og_current": "OG / Current",
    "quality": "Quality",
    "fast": "Fast",
    "low_vram": "Low VRAM",
    "extreme_low_vram": "Extreme Low VRAM",
}

ATTENTION_AUTO = "auto"
ATTENTION_OG = "og"
ATTENTION_PYTORCH = "pytorch"
ATTENTION_CK = "comfy_kitchen"
ATTENTION_SAGE = "sage_mem_eff"
ATTENTION_CHOICES = (ATTENTION_AUTO, ATTENTION_OG, ATTENTION_PYTORCH, ATTENTION_CK, ATTENTION_SAGE)


@dataclass(frozen=True, slots=True)
class RuntimeCapabilities:
    os_name: str = "unknown"
    gpu_name: str = "unknown"
    total_vram_gb: float = 0.0
    free_vram_gb: float = 0.0
    compute_capability: str = ""
    ck_attention: bool = False
    sage_mem_eff: bool = False
    low_vram_attention: bool = False
    ffn_chunking: bool = False
    native_h3_masks: bool = False
    native_h3_add_guide: bool = False
    face_refine: bool = False

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True, slots=True)
class RuntimeWorkload:
    route: str
    mode: str
    reference_count: int
    frames: int
    width: int
    height: int
    megapixels: float
    sequence_length: int
    sequence_breakdown: str = ""

    @property
    def is_still_packet(self) -> bool:
        return self.frames <= 9

    @property
    def is_ref_heavy(self) -> bool:
        return self.route == "ref2va" or self.reference_count >= 2

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True, slots=True)
class RuntimeDecision:
    requested: str
    resolved: str
    attention_backend: str
    head_chunks: int
    ffn_chunks: int
    ffn_sequence_threshold: int
    reason: str
    warnings: tuple[str, ...] = ()
    fallbacks: tuple[str, ...] = ()

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)


def _requested(value: Any) -> str:
    value = str(value or "auto").strip().lower().replace(" ", "_").replace("/", "_")
    aliases = {
        "og": "og_current",
        "current": "og_current",
        "og___current": "og_current",
        "balanced": "fast",
    }
    value = aliases.get(value, value)
    return value if value in RUNTIME_PRESETS else "auto"


def _advanced(value: Mapping[str, Any] | None) -> dict[str, Any]:
    value = value if isinstance(value, Mapping) else {}
    attention = str(value.get("attention_backend") or ATTENTION_AUTO).strip().lower()
    if attention not in ATTENTION_CHOICES:
        attention = ATTENTION_AUTO
    try:
        head_chunks = max(0, min(56, int(value.get("head_chunks") or 0)))
    except (TypeError, ValueError):
        head_chunks = 0
    try:
        ffn_chunks = max(0, min(64, int(value.get("ffn_chunks") or 0)))
    except (TypeError, ValueError):
        ffn_chunks = 0
    try:
        threshold = max(256, min(262144, int(value.get("ffn_sequence_threshold") or 4096)))
    except (TypeError, ValueError):
        threshold = 4096
    return {
        "attention_backend": attention,
        "head_chunks": head_chunks,
        "ffn_chunks": ffn_chunks,
        "ffn_sequence_threshold": threshold,
    }


def _best_fast_backend(caps: RuntimeCapabilities) -> tuple[str, tuple[str, ...]]:
    if caps.ck_attention:
        return ATTENTION_CK, ()
    if caps.sage_mem_eff:
        return ATTENTION_SAGE, ("Comfy Kitchen unavailable; using memory-efficient SageAttention.",)
    return ATTENTION_PYTORCH, ("No accelerated H3 attention backend detected; using PyTorch attention.",)


def _best_low_backend(caps: RuntimeCapabilities) -> tuple[str, tuple[str, ...]]:
    if caps.sage_mem_eff:
        return ATTENTION_SAGE, ()
    if caps.ck_attention:
        return ATTENTION_CK, ("Memory-efficient SageAttention unavailable; using Comfy Kitchen with head chunking when possible.",)
    return ATTENTION_PYTORCH, ("No low-memory attention backend detected; using PyTorch with head chunking when possible.",)


def _auto_decision(caps: RuntimeCapabilities, workload: RuntimeWorkload) -> RuntimeDecision:
    total = caps.total_vram_gb
    free = caps.free_vram_gb
    seq = max(0, workload.sequence_length)
    windows = caps.os_name.lower().startswith("win")
    severe = total > 0 and total <= 8.5
    low = total > 0 and total <= 12.5
    mid = total > 0 and total <= 16.5
    upper_mid = total > 0 and total <= 20.0
    heavy = workload.is_ref_heavy or seq >= 16000 or workload.frames >= 13 or workload.megapixels >= 1.6
    very_heavy = workload.is_ref_heavy and (seq >= 18000 or workload.reference_count >= 3)

    warnings: list[str] = []
    if workload.route == "ref2va" and total and total <= 8.5:
        warnings.append("REF2VA is highly constrained at 8 GB; reference tokens can trigger host paging or OOM.")

    if severe:
        backend, fallback = _best_low_backend(caps)
        if workload.is_still_packet and workload.route == "fl2va" and seq and seq < 9000 and workload.megapixels <= 0.75:
            chunks = 1
            reason = "8 GB card, but this is a small FL2VA still packet; avoid unnecessary head-chunk relaunch overhead."
        elif workload.is_still_packet and workload.route == "fl2va" and seq < 13000:
            chunks = 2
            reason = "8 GB card with a short H3 still packet; use the low-memory backend with only two head groups."
        elif very_heavy or seq >= 24000:
            chunks = 8
            reason = "8 GB card under extreme reference/sequence pressure; prioritize survival over kernel launch overhead."
        else:
            chunks = 4
            reason = "8 GB card under sustained H3 memory pressure; split attention heads to lower peak transients."
        if windows and caps.ck_attention:
            reason += " Windows low-VRAM runs also avoid CK by default because packed initialization can oversubscribe WDDM memory."
        return RuntimeDecision("auto", "extreme_low_vram", backend, chunks if caps.low_vram_attention else 1, 0, 4096, reason, tuple(warnings), fallback)

    if low:
        backend, fallback = _best_low_backend(caps)
        chunks = 4 if heavy or seq >= 15000 else 2
        reason = "Low-VRAM H3 workload; use the memory-efficient attention path and scale head chunking with actual packed sequence pressure."
        return RuntimeDecision("auto", "low_vram", backend, chunks if caps.low_vram_attention else 1, 0, 4096, reason, tuple(warnings), fallback)

    if mid:
        ck_has_headroom = caps.ck_attention and (free <= 0 or free >= 2.0)
        if not heavy and ck_has_headroom:
            return RuntimeDecision(
                "auto", "fast", ATTENTION_CK, 1, 0, 4096,
                "12-16 GB card with a compact workload and CK available; use the faster native CK INT8 attention path.",
                tuple(warnings), (),
            )
        backend, fallback = _best_low_backend(caps)
        reason = "12-16 GB card with reference, resolution, frame, or sequence pressure; trade a small amount of speed for lower attention peaks."
        return RuntimeDecision("auto", "low_vram", backend, 2 if caps.low_vram_attention else 1, 0, 4096, reason, tuple(warnings), fallback)

    if upper_mid:
        backend, fallback = _best_fast_backend(caps)
        chunks = 2 if (heavy and caps.low_vram_attention) else 1
        resolved = "low_vram" if chunks > 1 else "fast"
        reason = (
            "16-20 GB card with a heavy packed sequence; keep the fast backend but split independent attention heads to cap transients."
            if chunks > 1 else
            "16-20 GB card with enough headroom for the accelerated attention path without chunking."
        )
        return RuntimeDecision("auto", resolved, backend, chunks, 0, 4096, reason, tuple(warnings), fallback)

    backend, fallback = _best_fast_backend(caps)
    reason = "More than 20 GB VRAM detected; use the fastest available attention backend and avoid chunking overhead."
    return RuntimeDecision("auto", "fast", backend, 1, 0, 4096, reason, tuple(warnings), fallback)


def resolve_runtime(
    requested: str,
    caps: RuntimeCapabilities,
    workload: RuntimeWorkload,
    advanced: Mapping[str, Any] | None = None,
) -> RuntimeDecision:
    requested = _requested(requested)
    adv = _advanced(advanced)

    if requested == "auto":
        decision = _auto_decision(caps, workload)
    elif requested == "og_current":
        decision = RuntimeDecision(requested, "og_current", ATTENTION_OG, 1, 0, 4096, "Preserve H3 Studio's pre-runtime-optimizer behavior exactly.")
    elif requested == "quality":
        decision = RuntimeDecision(requested, "quality", ATTENTION_PYTORCH, 1, 0, 4096, "Force conservative PyTorch attention with no H3 memory patching.")
    elif requested == "fast":
        backend, fallback = _best_fast_backend(caps)
        decision = RuntimeDecision(requested, "fast", backend, 1, 0, 4096, "Use the fastest detected stable H3 attention backend without chunking overhead.", fallbacks=fallback)
    elif requested == "low_vram":
        backend, fallback = _best_low_backend(caps)
        chunks = 2 if caps.low_vram_attention else 1
        decision = RuntimeDecision(requested, "low_vram", backend, chunks, 0, 4096, "Reduce H3 attention peak memory while keeping head math independent and exact.", fallbacks=fallback)
    else:
        backend, fallback = _best_low_backend(caps)
        chunks = 4 if caps.low_vram_attention else 1
        if caps.total_vram_gb and caps.total_vram_gb <= 8.5 and workload.sequence_length >= 24000 and caps.low_vram_attention:
            chunks = 8
        decision = RuntimeDecision(requested, "extreme_low_vram", backend, chunks, 0, 4096, "Prioritize fitting H3 on severely constrained VRAM; accept extra head-group launch overhead.", fallbacks=fallback)

    backend = decision.attention_backend
    head_chunks = decision.head_chunks
    ffn_chunks = decision.ffn_chunks
    threshold = decision.ffn_sequence_threshold
    reasons = [decision.reason]
    warnings = list(decision.warnings)
    fallbacks = list(decision.fallbacks)

    if adv["attention_backend"] != ATTENTION_AUTO:
        backend = adv["attention_backend"]
        reasons.append(f"Advanced override forced attention={backend}.")
    if adv["head_chunks"] > 0:
        head_chunks = adv["head_chunks"]
        reasons.append(f"Advanced override forced head_chunks={head_chunks}.")
    if adv["ffn_chunks"] > 1:
        ffn_chunks = adv["ffn_chunks"]
        threshold = adv["ffn_sequence_threshold"]
        warnings.append("FFN chunking is experimental for H3 and normally slower; Auto never enables it.")
        reasons.append(f"Advanced override enabled FFN chunks={ffn_chunks} above sequence {threshold}.")

    return RuntimeDecision(
        requested=decision.requested,
        resolved=decision.resolved,
        attention_backend=backend,
        head_chunks=max(1, head_chunks),
        ffn_chunks=max(0, ffn_chunks),
        ffn_sequence_threshold=threshold,
        reason=" ".join(reasons),
        warnings=tuple(warnings),
        fallbacks=tuple(fallbacks),
    )


def detect_capabilities() -> RuntimeCapabilities:
    gpu_name = "CPU / unavailable"
    total = free = 0.0
    capability = ""
    try:
        import torch
        if torch.cuda.is_available():
            device = torch.cuda.current_device()
            props = torch.cuda.get_device_properties(device)
            gpu_name = props.name
            total = float(props.total_memory) / (1024 ** 3)
            try:
                free_bytes, _total_bytes = torch.cuda.mem_get_info(device)
                free = float(free_bytes) / (1024 ** 3)
            except Exception:
                free = 0.0
            try:
                major, minor = torch.cuda.get_device_capability(device)
                capability = f"sm{major}{minor}"
            except Exception:
                pass
    except Exception:
        pass

    ck = False
    try:
        import comfy.ldm.modules.attention as attention
        ck = bool(getattr(attention, "COMFY_KITCHEN_INT8_ATTENTION_IS_AVAILABLE", False))
        if not ck:
            ck = attention.get_attention_function("comfy_kitchen_int8", None) is not None
    except Exception:
        pass

    mappings: Mapping[str, Any] = {}
    try:
        import nodes
        mappings = getattr(nodes, "NODE_CLASS_MAPPINGS", {}) or {}
    except Exception:
        pass

    native_masks = False
    native_add_guide = "MiniMaxH3AddGuide" in mappings
    try:
        from comfy.model_base import MiniMaxH3
        native_masks = "process_denoise_mask" in MiniMaxH3.__dict__
    except Exception:
        pass

    return RuntimeCapabilities(
        os_name=platform.system() or "unknown",
        gpu_name=gpu_name,
        total_vram_gb=round(total, 2),
        free_vram_gb=round(free, 2),
        compute_capability=capability,
        ck_attention=ck,
        sage_mem_eff="MiniMaxH3MemoryEfficientSageAttentionPatch" in mappings,
        low_vram_attention="MiniMaxLowVRAMAttention" in mappings,
        ffn_chunking="MiniMaxChunkFeedForward" in mappings,
        native_h3_masks=native_masks,
        native_h3_add_guide=native_add_guide,
        face_refine=any(str(name).startswith("H3Face") or "FaceRefine" in str(name) for name in mappings),
    )


def _node_output_first(value: Any) -> Any:
    if hasattr(value, "args"):
        values = tuple(value.args)
    elif isinstance(value, dict) and "result" in value:
        result = value["result"]
        values = tuple(result) if isinstance(result, (tuple, list)) else (result,)
    elif isinstance(value, (tuple, list)):
        values = tuple(value)
    else:
        values = (value,)
    return values[0] if values else None


def _patch_attention_backend(model: Any, backend: str) -> tuple[Any, str, list[str]]:
    notes: list[str] = []
    if backend in {ATTENTION_OG, ATTENTION_AUTO}:
        return model, "OG / inherited", notes

    if backend in {ATTENTION_PYTORCH, ATTENTION_CK}:
        try:
            import comfy.ldm.modules.attention as attention
            name = "comfy_kitchen_int8" if backend == ATTENTION_CK else "pytorch"
            fn = attention.get_attention_function(name, None)
            if fn is None:
                if backend == ATTENTION_CK:
                    notes.append("CK requested but unavailable at execution; fell back to PyTorch.")
                    fn = attention.get_attention_function("pytorch", None)
                if fn is None:
                    return model, "inherited", notes
            patched = model.clone()
            patched.set_model_optimized_attention(fn)
            return patched, "Comfy Kitchen INT8" if backend == ATTENTION_CK and not notes else "PyTorch", notes
        except Exception as exc:
            notes.append(f"Attention backend patch failed ({type(exc).__name__}: {exc}); inherited model backend kept.")
            return model, "inherited", notes

    if backend == ATTENTION_SAGE:
        try:
            import nodes
            cls = getattr(nodes, "NODE_CLASS_MAPPINGS", {}).get("MiniMaxH3MemoryEfficientSageAttentionPatch")
            if cls is None:
                notes.append("Memory-efficient SageAttention is unavailable; inherited backend kept.")
                return model, "inherited", notes
            return _node_output_first(cls.execute(model)), "SageAttention · H3 memory-efficient", notes
        except Exception as exc:
            notes.append(f"Sage H3 patch failed ({type(exc).__name__}: {exc}); inherited backend kept.")
            return model, "inherited", notes

    return model, "inherited", notes


def _patch_head_chunks(model: Any, head_chunks: int) -> tuple[Any, int, list[str]]:
    if head_chunks <= 1:
        return model, 1, []
    try:
        import nodes
        cls = getattr(nodes, "NODE_CLASS_MAPPINGS", {}).get("MiniMaxLowVRAMAttention")
        if cls is None:
            return model, 1, ["Head chunking requested but MiniMaxLowVRAMAttention is unavailable."]
        return _node_output_first(cls.execute(model, int(head_chunks))), int(head_chunks), []
    except Exception as exc:
        return model, 1, [f"H3 head chunking failed ({type(exc).__name__}: {exc})."]


def _patch_ffn_chunks(model: Any, chunks: int, threshold: int) -> tuple[Any, int, list[str]]:
    if chunks <= 1:
        return model, 0, []
    try:
        import nodes
        cls = getattr(nodes, "NODE_CLASS_MAPPINGS", {}).get("MiniMaxChunkFeedForward")
        if cls is None:
            return model, 0, ["FFN chunking requested but MiniMaxChunkFeedForward is unavailable."]
        return _node_output_first(cls.execute(model, int(chunks), int(threshold))), int(chunks), []
    except Exception as exc:
        return model, 0, [f"H3 FFN chunking failed ({type(exc).__name__}: {exc})."]


_PATCH_LOCK = threading.RLock()
_PATCH_CACHE_KEY: tuple[Any, ...] | None = None
_PATCH_CACHE_VALUE: tuple[Any, str, int, int, tuple[str, ...]] | None = None


def apply_runtime_decision(model: Any, decision: RuntimeDecision) -> tuple[Any, str, int, int, tuple[str, ...]]:
    """Apply only runtime patches, caching the unchanged base-model/config pair."""
    global _PATCH_CACHE_KEY, _PATCH_CACHE_VALUE
    key = (
        id(model), decision.attention_backend, decision.head_chunks,
        decision.ffn_chunks, decision.ffn_sequence_threshold,
    )
    with _PATCH_LOCK:
        if key == _PATCH_CACHE_KEY and _PATCH_CACHE_VALUE is not None:
            patched, label, heads, ffn, notes = _PATCH_CACHE_VALUE
            return patched, label, heads, ffn, (*notes, "runtime_patch_cache=hit")

        patched, label, notes = _patch_attention_backend(model, decision.attention_backend)
        patched, heads, more = _patch_head_chunks(patched, decision.head_chunks)
        notes.extend(more)
        patched, ffn, more = _patch_ffn_chunks(patched, decision.ffn_chunks, decision.ffn_sequence_threshold)
        notes.extend(more)
        result = (patched, label, heads, ffn, tuple(notes))
        _PATCH_CACHE_KEY = key
        _PATCH_CACHE_VALUE = result
        return result


_DECISIONS_LOCK = threading.RLock()
_DECISIONS: OrderedDict[int, dict[str, Any]] = OrderedDict()


def remember_runtime(context: Any, payload: dict[str, Any]) -> None:
    with _DECISIONS_LOCK:
        key = id(context)
        _DECISIONS[key] = payload
        _DECISIONS.move_to_end(key)
        while len(_DECISIONS) > 64:
            _DECISIONS.popitem(last=False)


def runtime_for_context(context: Any) -> dict[str, Any] | None:
    with _DECISIONS_LOCK:
        value = _DECISIONS.get(id(context))
        return dict(value) if value else None
