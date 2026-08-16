"""Restore H3 Studio's old T2I+image FL2VA behavior, extended to 9 guides.

Historically the Director could resolve to text-to-image while the conditioner
still noticed connected images and entered FL2VA source/keyframe conditioning.
That accidental hybrid produced useful results: creative T2I prompt semantics
plus strong visual grounding. Keep that behavior intentionally for explicit
T2I with connected images, without changing pure T2I, I2I, or REF2VA.
"""

from __future__ import annotations

import logging
from typing import Any

LOGGER = logging.getLogger(__name__)
_RUNTIME_MODE = "text_to_image_guided (FL2VA)"
_MAX_GUIDES = 9


def _guide_positions(count: int, frame_count: int) -> tuple[int, ...]:
    """Spread FL2VA guides over the available still packet.

    One image stays at frame 0 exactly like the historical path. Multiple
    images use H3's native multi-keyframe mechanism and are distributed over
    the packet. Duplicate frame indices are allowed when there are more guides
    than decoded frames; PackedLayout keeps every condition block separately.
    """

    count = max(0, min(_MAX_GUIDES, int(count)))
    frame_count = max(1, int(frame_count))
    if count <= 0:
        return ()
    if count == 1 or frame_count == 1:
        return tuple(0 for _ in range(count))
    last = frame_count - 1
    return tuple(int(round(index * last / (count - 1))) for index in range(count))


def _install_contract_patch() -> None:
    from . import runtime_contract_fixes as contracts
    from .constants import MODE_TEXT_TO_IMAGE

    current = contracts.conditioning_contract
    if bool(getattr(current, "__h3studio_legacy_t2i_multiguide__", False)):
        return

    original = current

    def conditioning_contract(studio_context):
        mode = str(studio_context.compile_result.resolved_mode)
        route = str(studio_context.route.selected)
        images = tuple(studio_context.images)[:_MAX_GUIDES]
        if mode == MODE_TEXT_TO_IMAGE and route == "fl2va" and images:
            count = len(images)
            return contracts.ConditioningContract(
                runtime_mode=_RUNTIME_MODE,
                used_images=images,
                pixel_conditioning=(
                    f"{count} FL2VA visual guide{'s' if count != 1 else ''} · "
                    "T2I compiler semantics preserved"
                ),
                note=(
                    " Legacy guided-T2I behavior is active: connected images are real H3/FL2VA visual "
                    "conditioning, while the prompt remains creative text-to-image rather than locked-source edit prose."
                ),
            )
        return original(studio_context)

    conditioning_contract.__h3studio_legacy_t2i_multiguide__ = True
    conditioning_contract.__wrapped__ = original
    contracts.conditioning_contract = conditioning_contract


def _install_pipeline_patch() -> None:
    from . import conditioning_cache as cache

    current = cache.run_conditioning_pipeline
    if bool(getattr(current, "__h3studio_legacy_t2i_multiguide__", False)):
        return

    original = current

    def run_conditioning_pipeline(
        bundle: Any,
        studio_context: Any,
        *,
        route: str,
        runtime_mode: str,
        used_images: tuple[Any, ...],
        frame_preset: str,
        source_fit: str = "crop_center",
        reference_size: str = "max_identity_2048",
    ):
        if runtime_mode != _RUNTIME_MODE:
            return original(
                bundle,
                studio_context,
                route=route,
                runtime_mode=runtime_mode,
                used_images=used_images,
                frame_preset=frame_preset,
                source_fit=source_fit,
                reference_size=reference_size,
            )

        if route != "fl2va":
            raise ValueError("Guided text-to-image requires the FL2VA route.")
        guides = tuple(used_images)[:_MAX_GUIDES]
        if not guides:
            return original(
                bundle,
                studio_context,
                route=route,
                runtime_mode="text_to_image (FL2VA)",
                used_images=(),
                frame_preset=frame_preset,
                source_fit=source_fit,
                reference_size=reference_size,
            )

        import node_helpers
        from .nodes.image_runtime import _prompt_warning

        width, height = int(studio_context.width), int(studio_context.height)
        prompt = str(studio_context.prompt)
        image_ids = cache.image_cache_key(studio_context, guides)

        # Deliberately reuse the historical FL2VA source-latent policy. The only
        # behavioral extension is that every connected image becomes a guide.
        latent, requested_frames, natural_frames, internal_frames, output_strategy, latent_state = cache._latent_stage(
            "image_to_image (FL2VA)", width, height, frame_preset
        )

        fitted_guides = []
        guide_latents = []
        source_states = []
        for image, image_id in zip(guides, image_ids, strict=False):
            fitted, encoded, state = cache._source_stage(
                bundle, image, image_id, width, height, source_fit
            )
            fitted_guides.append(fitted)
            guide_latents.append(encoded)
            source_states.append(state)

        positions = _guide_positions(len(fitted_guides), natural_frames)
        prompt_key = (
            cache._selected_model_key(bundle, route),
            route,
            _RUNTIME_MODE,
            cache._clip_key(bundle),
            prompt,
            tuple(image_ids),
            tuple(positions),
            int(width),
            int(height),
            str(source_fit),
        )
        conditioning, text_state, text_seconds, residency = cache._encode_prompt(
            bundle,
            prompt_key,
            lambda: bundle.clip.tokenize(prompt, images=fitted_guides),
        )

        keyframes = [
            {"resolved_frame_index": int(frame_index), "latent": guide_latent}
            for frame_index, guide_latent in zip(positions, guide_latents, strict=False)
        ]
        conditioning = node_helpers.conditioning_set_values(
            conditioning,
            {
                "minimax_keyframes": keyframes,
                "minimax_frame_count": natural_frames,
            },
        )

        fitted_source = fitted_guides[0]
        hits = sum(state == "HIT" for state in source_states)
        positions_text = ", ".join(str(value) for value in positions)
        trained_note = (
            "beyond the documented 124-362-frame training range"
            if natural_frames > 362
            else "inside the documented 124-362-frame training range"
            if natural_frames >= 124
            else "short experimental temporal packet chosen to reduce image-mode compute"
        )
        decode_note = (
            f"exact {requested_frames}-frame batch"
            if requested_frames == natural_frames
            else f"temporal latent naturally decodes {natural_frames} frames; H3 Exact Frame Decode keeps {requested_frames}"
        )
        runtime_info = (
            f"Mode: text_to_image (FL2VA · legacy guided) | temporal profile: {internal_frames} frames | "
            f"canvas {width}x{height} | internal packet {natural_frames} frames | decoded profile {requested_frames} | "
            f"{decode_note} | {trained_note}. {len(guides)} connected image guide(s) are passed to H3's multimodal "
            f"conditioning encoder and VAE-encoded as native FL2VA keyframes at target frame(s) [{positions_text}]. "
            "The Director/compiler remains text-to-image, so no locked-source edit wording is injected. "
            f"Preferred output strategy: {output_strategy}.{_prompt_warning(prompt)}"
        )
        diagnostics = (
            f"text_conditioning={text_state} ({text_seconds:.3f}s) | "
            f"visual_guides=FL2VA:{hits}/{len(guides)} VAE HIT | positions=[{positions_text}] | "
            f"latent_prepare={latent_state} | text_encoder_runtime={residency}"
        )
        LOGGER.info("[H3 Studio] Legacy guided T2I conditioning\n  %s", diagnostics)
        return cache.ConditioningStages(
            conditioning,
            latent,
            fitted_source,
            requested_frames,
            runtime_info,
            diagnostics,
        )

    run_conditioning_pipeline.__h3studio_legacy_t2i_multiguide__ = True
    run_conditioning_pipeline.__wrapped__ = original
    cache.run_conditioning_pipeline = run_conditioning_pipeline


def install() -> None:
    """Install before runtime_contract_fixes captures the conditioning pipeline."""

    _install_pipeline_patch()
    _install_contract_patch()


__all__ = ["install"]
