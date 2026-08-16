"""Restore H3 Studio's old T2I+image FL2VA behavior, extended to 9 guides.

Historically the Director could resolve to text-to-image while the conditioner
still noticed connected images and entered FL2VA source/keyframe conditioning.
That accidental hybrid produced useful results: creative T2I prompt semantics
plus strong visual grounding. Keep that behavior intentionally for explicit
T2I with connected images, without changing pure T2I, I2I, or REF2VA.

The one-image branch deliberately delegates to the exact historical I2I
conditioning implementation. This keeps the useful old accident byte-for-byte
at the H3 conditioning level while the Director/compiler remains T2I. The only
new behavior is the 2-9 image extension, where all guides are simultaneous
frame-0 FL2VA conditions rather than a temporal morph sequence.
"""

from __future__ import annotations

import logging
from typing import Any

LOGGER = logging.getLogger(__name__)
_RUNTIME_MODE = "text_to_image_guided (FL2VA)"
_MAX_GUIDES = 9


def _guide_positions(count: int, frame_count: int) -> tuple[int, ...]:
    """Place every guided-T2I image at the historical frame-0 anchor.

    H3's PackedLayout accepts multiple FL2VA condition blocks at the same
    resolved frame. Keeping every guide at frame 0 is the closest multi-image
    generalization of the old one-image T2I accident and avoids turning a still
    packet into a temporal interpolation between references.
    """

    del frame_count  # Kept in the signature for tests/diagnostics compatibility.
    count = max(0, min(_MAX_GUIDES, int(count)))
    return tuple(0 for _ in range(count))


def _install_compiler_diagnostics_patch() -> None:
    """Replace the stale strict-T2I warning with the real guided-T2I contract."""

    from dataclasses import replace

    from .constants import MODE_TEXT_TO_IMAGE
    from .errors import Diagnostic
    from .prompting.compiler import PromptCompiler

    current = PromptCompiler.compile
    if bool(getattr(current, "__h3studio_guided_t2i_diagnostics__", False)):
        return

    original = current

    def compile(self, state, *args, **kwargs):
        result = original(self, state, *args, **kwargs)
        if result.resolved_mode != MODE_TEXT_TO_IMAGE or not result.references:
            return result

        count = len(result.references)
        diagnostics = []
        for item in result.diagnostics:
            if item.code == "references_ignored_in_t2i":
                diagnostics.append(
                    Diagnostic(
                        "warning",
                        "references_guided_in_t2i",
                        (
                            f"Explicit text-to-image keeps creative T2I prompt semantics while {count} connected "
                            f"image reference{'s' if count != 1 else ''} are used as real FL2VA visual "
                            f"guide{'s' if count != 1 else ''}. They are not REF2VA edit inputs and are not ignored."
                        ),
                        field="mode",
                        hint="Use Image to Image for a locked source edit, or Reference Mix/Edit for REF2VA semantics.",
                    )
                )
            elif item.code == "references_not_mentioned":
                diagnostics.append(
                    replace(
                        item,
                        message=(
                            "Connected images are active FL2VA visual guides, but the prompt does not explicitly assign "
                            "their job. Visual guidance still applies; @Image mentions make multi-guide intent less ambiguous."
                        ),
                    )
                )
            else:
                diagnostics.append(item)
        return replace(result, diagnostics=tuple(diagnostics))

    compile.__h3studio_guided_t2i_diagnostics__ = True
    compile.__wrapped__ = original
    PromptCompiler.compile = compile


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

        # This is the exact accidental pre-contract-fix path for one image:
        # T2I compiler/context upstream, old FL2VA I2I conditioner downstream.
        # Delegating instead of reimplementing removes every possible semantic
        # difference in source fitting, CLIP multimodal tokenization, latent
        # preparation, VAE encoding, keyframe insertion and cache behavior.
        if len(guides) == 1:
            historical = original(
                bundle,
                studio_context,
                route=route,
                runtime_mode="image_to_image (FL2VA)",
                used_images=guides,
                frame_preset=frame_preset,
                source_fit=source_fit,
                reference_size=reference_size,
            )
            runtime_info = historical.runtime_info.replace(
                "Mode: image_to_image (FL2VA)",
                "Mode: text_to_image (FL2VA · exact legacy one-guide)",
                1,
            )
            diagnostics = historical.diagnostics.replace(
                "reference_conditioning=source_vae:",
                "legacy_t2i_source_vae:",
                1,
            )
            LOGGER.info("[H3 Studio] Exact legacy one-guide T2I conditioning\n  %s", diagnostics)
            return cache.ConditioningStages(
                historical.conditioning,
                historical.latent,
                historical.fitted_source,
                historical.requested_frames,
                runtime_info,
                diagnostics,
            )

        from .nodes.image_runtime import _prompt_warning
        import node_helpers

        width, height = int(studio_context.width), int(studio_context.height)
        prompt = str(studio_context.prompt)
        image_ids = cache.image_cache_key(studio_context, guides)

        # Multi-guide is the only intentional extension beyond historical T2I.
        # Keep the same source-latent policy and same short still packet.
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
            f"Mode: text_to_image (FL2VA · legacy multi-guide) | temporal profile: {internal_frames} frames | "
            f"canvas {width}x{height} | internal packet {natural_frames} frames | decoded profile {requested_frames} | "
            f"{decode_note} | {trained_note}. {len(guides)} connected image guide(s) are passed to H3's multimodal "
            f"conditioning encoder and VAE-encoded as simultaneous native FL2VA frame-0 keyframes. "
            "The Director/compiler remains text-to-image, so no locked-source edit wording is injected. "
            f"Preferred output strategy: {output_strategy}.{_prompt_warning(prompt)}"
        )
        diagnostics = (
            f"text_conditioning={text_state} ({text_seconds:.3f}s) | "
            f"visual_guides=FL2VA:{hits}/{len(guides)} VAE HIT | positions=[{positions_text}] | "
            f"latent_prepare={latent_state} | text_encoder_runtime={residency}"
        )
        LOGGER.info("[H3 Studio] Legacy multi-guide T2I conditioning\n  %s", diagnostics)
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

    _install_compiler_diagnostics_patch()
    _install_pipeline_patch()
    _install_contract_patch()


__all__ = ["install"]
