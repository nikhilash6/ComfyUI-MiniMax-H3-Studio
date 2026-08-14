"""ComfyUI nodes that inject H3 Studio's resolved runtime policy."""

from __future__ import annotations

import logging
from dataclasses import replace
from typing import Any

from ..context import H3StudioGeneration
from ..runtime_optimization import (
    RUNTIME_LABELS,
    RuntimeWorkload,
    apply_runtime_decision,
    detect_capabilities,
    remember_runtime,
    resolve_runtime,
    runtime_for_context,
)
from .director import H3StudioCondition, H3StudioContextSamplingPreset

LOGGER = logging.getLogger(__name__)


def _packed_sequence(samples: Any, conditioning: Any) -> tuple[int, str]:
    """Build the same PackedLayout the native H3 model uses and report its largest schedule."""
    try:
        from comfy.ldm.minimax.model import PackedLayout

        latent = samples["samples"]
        if getattr(latent, "is_nested", False):
            values = latent.unbind()
            video = values[0]
            audio_t = int(values[1].shape[-1]) if len(values) > 1 else 0
        else:
            video = latent
            audio_t = 0
        if video.ndim != 5:
            return 0, f"unavailable: unexpected latent shape {tuple(video.shape)}"

        latent_t = int(video.shape[2])
        lat_h = (int(video.shape[3]) + 1) // 2 * 2
        lat_w = (int(video.shape[4]) + 1) // 2 * 2
        layouts = []
        for cond, cond_dict in conditioning:
            layouts.append(
                PackedLayout(
                    int(cond.shape[1]),
                    latent_t,
                    lat_h,
                    lat_w,
                    audio_t,
                    keyframes=cond_dict.get("minimax_keyframes"),
                    refs=cond_dict.get("minimax_refs"),
                    frame_count=cond_dict.get("minimax_frame_count"),
                )
            )
        if not layouts:
            return 0, "unavailable: empty conditioning"
        layout = max(layouts, key=lambda item: item.seq_len)
        rows: dict[str, int] = {}
        blocks: dict[str, int] = {}
        for start, stop, kind in layout.segments:
            rows[kind] = rows.get(kind, 0) + int(stop - start)
            blocks[kind] = blocks.get(kind, 0) + 1
        details = [f"total={layout.seq_len}", f"text={rows.get('text', 0)}", f"video={rows.get('video', 0)}"]
        if rows.get("audio"):
            details.append(f"audio={rows['audio']}")
        if rows.get("cond"):
            details.append(f"keyframes={rows['cond']}({blocks.get('cond', 0)})")
        if rows.get("ref_img"):
            details.append(f"image_refs={rows['ref_img']}({blocks.get('ref_img', 0)})")
        if rows.get("ref_audio"):
            details.append(f"audio_refs={rows['ref_audio']}({blocks.get('ref_audio', 0)})")
        return int(layout.seq_len), " · ".join(details)
    except Exception as exc:
        return 0, f"unavailable: {type(exc).__name__}: {exc}"


def _frame_count(studio_context: Any, samples: Any, requested_frames: int) -> int:
    try:
        value = int(samples.get("h3_context_frames", samples.get("h3_requested_frames", requested_frames)))
        return max(1, value)
    except Exception:
        return max(1, int(requested_frames or 1))


def _send_runtime_event(studio_context: Any, payload: dict[str, Any]) -> None:
    try:
        from server import PromptServer
        node_id = dict(studio_context.state.ui).get("director_node_id")
        if node_id in (None, ""):
            return
        PromptServer.instance.send_sync(
            "h3studio-runtime-resolved",
            {"node_id": str(node_id), **payload},
            PromptServer.instance.client_id,
        )
    except Exception:
        LOGGER.debug("H3 Studio runtime UI event skipped", exc_info=True)


def _vae_mode(vae: Any) -> tuple[str, str]:
    try:
        from ..vae_io import detect_vae_io
        info = detect_vae_io(vae)
        if info.chunked:
            return "native chunked H3 VAE", info.detail
        return "native H3 VAE", info.detail
    except Exception as exc:
        return "native H3 VAE", f"VAE I/O detection unavailable: {exc}"


def _format_runtime_log(payload: dict[str, Any]) -> str:
    cap = payload["capabilities"]
    work = payload["workload"]
    lines = [
        "=" * 74,
        "H3 STUDIO RUNTIME · EFFECTIVE CONFIG",
        "=" * 74,
        f"Requested     : {payload['requested_label']}",
        f"Resolved      : {payload['resolved_label']}",
        f"GPU           : {cap['gpu_name']} · {cap['total_vram_gb']:.2f} GB total · {cap['free_vram_gb']:.2f} GB free · {cap['os_name']}",
        f"Workload      : {work['route'].upper()} · {work['frames']} frames · {work['width']}x{work['height']} · {work['megapixels']:.2f} MP · refs={work['reference_count']}",
        f"Packed tokens : {work['sequence_length']} · {work['sequence_breakdown']}",
        f"Attention     : {payload['attention_label']}",
        f"Head chunks   : {'off' if payload['head_chunks'] <= 1 else payload['head_chunks']}",
        f"FFN chunks    : {'off' if payload['ffn_chunks'] <= 1 else payload['ffn_chunks']} (experimental override only)",
        f"VAE decode    : {payload['vae_mode']}",
        f"Transformer   : {payload['assets']['transformer']}",
        f"Text encoder  : {payload['assets']['text_encoder']}",
        f"Sampling      : {payload['sampling_profile']} (runtime preset never changes this)",
        f"Why           : {payload['reason']}",
    ]
    for note in payload.get("fallbacks", ()):
        lines.append(f"Fallback      : {note}")
    for note in payload.get("warnings", ()):
        lines.append(f"Warning       : {note}")
    for note in payload.get("patch_notes", ()):
        lines.append(f"Patch note    : {note}")
    lines.append("=" * 74)
    return "\n".join(lines)


class H3StudioRuntimeCondition(H3StudioCondition):
    """Condition normally, then apply a workload-aware execution policy."""

    def condition(self, h3_bundle, studio_context):
        result = super().condition(h3_bundle, studio_context)
        model, generation, conditioning, latent, final_vae, requested_frames, run_info = result

        sequence_length, sequence_breakdown = _packed_sequence(latent, conditioning)
        frames = _frame_count(studio_context, latent, requested_frames)
        workload = RuntimeWorkload(
            route=str(studio_context.route.selected),
            mode=str(studio_context.compile_result.resolved_mode),
            reference_count=len(studio_context.images),
            frames=frames,
            width=int(studio_context.width),
            height=int(studio_context.height),
            megapixels=float(studio_context.resolution.actual_megapixels),
            sequence_length=sequence_length,
            sequence_breakdown=sequence_breakdown,
        )
        ui = dict(studio_context.state.ui)
        requested = str(ui.get("runtime_optimization") or "auto")
        advanced = ui.get("runtime_advanced") if isinstance(ui.get("runtime_advanced"), dict) else {}
        capabilities = detect_capabilities()
        decision = resolve_runtime(requested, capabilities, workload, advanced)
        patched_model, attention_label, head_chunks, ffn_chunks, patch_notes = apply_runtime_decision(model, decision)
        vae_mode, vae_detail = _vae_mode(final_vae)

        warnings = [*decision.warnings]
        if decision.resolved in {"low_vram", "extreme_low_vram"} and "chunked" not in vae_mode.lower():
            warnings.append("This VAE does not advertise native chunked I/O; high-resolution decode can still be a memory peak.")
        if workload.route == "ref2va" and capabilities.total_vram_gb and capabilities.total_vram_gb <= 8.5:
            warnings.append("8 GB REF2VA remains experimental: Auto can reduce attention peaks but cannot remove reference-token cost.")

        payload = {
            "requested": decision.requested,
            "requested_label": RUNTIME_LABELS.get(decision.requested, decision.requested),
            "resolved": decision.resolved,
            "resolved_label": RUNTIME_LABELS.get(decision.resolved, decision.resolved),
            "attention_backend": decision.attention_backend,
            "attention_label": attention_label,
            "head_chunks": head_chunks,
            "ffn_chunks": ffn_chunks,
            "ffn_sequence_threshold": decision.ffn_sequence_threshold,
            "reason": decision.reason,
            "warnings": tuple(warnings),
            "fallbacks": decision.fallbacks,
            "patch_notes": patch_notes,
            "capabilities": capabilities.as_dict(),
            "workload": workload.as_dict(),
            "vae_mode": vae_mode,
            "vae_detail": vae_detail,
            "sampling_profile": studio_context.state.generation.sampling_profile,
            "assets": {
                "transformer": h3_bundle.selected_name(studio_context.route.selected),
                "text_encoder": h3_bundle.clip_name,
                "video_vae": h3_bundle.video_vae_name,
                "image_vae": h3_bundle.image_vae_name or "disabled",
            },
        }
        remember_runtime(studio_context, payload)
        _send_runtime_event(studio_context, payload)
        LOGGER.info("\n%s", _format_runtime_log(payload))

        enhanced_run_info = f"{run_info}\n\nRuntime optimization: {payload['resolved_label']} · {attention_label} · head_chunks={head_chunks}. Why: {decision.reason}"
        if isinstance(generation, H3StudioGeneration):
            generation = replace(generation, model=patched_model, run_info=enhanced_run_info)
        return patched_model, generation, conditioning, latent, final_vae, requested_frames, enhanced_run_info


class H3StudioRuntimeSamplingPreset(H3StudioContextSamplingPreset):
    """Keep Sampling Profile separate while printing the final combined config."""

    def build(self, model, studio_context):
        result = super().build(model, studio_context)
        runtime = runtime_for_context(studio_context)
        if runtime:
            sampling_info = (
                f"{result[3]} | runtime={runtime['resolved_label']} | attention={runtime['attention_label']} | "
                f"head_chunks={runtime['head_chunks']} | packed_tokens={runtime['workload']['sequence_length']}"
            )
            LOGGER.info(
                "\n[H3 Studio] Final sampling config\n"
                "  Runtime: %s -> %s\n"
                "  Attention: %s | head_chunks=%s | FFN_chunks=%s\n"
                "  Sampling profile: %s\n"
                "  Sampling recipe: %s",
                runtime["requested_label"],
                runtime["resolved_label"],
                runtime["attention_label"],
                runtime["head_chunks"],
                runtime["ffn_chunks"],
                studio_context.state.generation.sampling_profile,
                result[3],
            )
            return result[0], result[1], result[2], sampling_info
        return result
