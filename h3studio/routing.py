"""Explicit selection of the H3 conditioning model path."""

from __future__ import annotations

import logging
from dataclasses import dataclass

from .constants import (
    MODE_IMAGE_TO_IMAGE,
    MODE_REFERENCE_EDIT,
    MODE_TEXT_TO_IMAGE,
    ROUTE_AUTO,
    ROUTE_FL2VA,
    ROUTE_REF2VA,
    SAMPLING_PROFILES,
)
from .errors import RouteError


LOGGER = logging.getLogger(__name__)
EXPERIMENTAL_FL2V_REF2VA_WARNING = (
    "Experimental LightX cross-route: this FL2V/FL2VA adapter is being used with REF2VA reference mixing. "
    "This unofficial combination is allowed, but reference adherence, fine detail, hands, and overall stability "
    "may be less consistent than with a dedicated REF2VA adapter."
)


@dataclass(frozen=True, slots=True)
class RouteDecision:
    requested: str
    selected: str
    mode: str
    reference_count: int
    reason: str
    experimental: bool = False

    def as_dict(self) -> dict[str, object]:
        return {
            "requested": self.requested,
            "selected": self.selected,
            "mode": self.mode,
            "reference_count": self.reference_count,
            "reason": self.reason,
            "experimental": self.experimental,
        }

    def summary(self) -> str:
        suffix = " · experimental" if self.experimental else ""
        return f"{self.mode} → {self.selected} · {self.reason}{suffix}"


def _profile_route(sampling_profile: str) -> str | None:
    metadata = SAMPLING_PROFILES.get(str(sampling_profile or ""), {})
    route = str(metadata.get("route") or "").strip().lower()
    return route if route in {ROUTE_FL2VA, ROUTE_REF2VA} else None


def validate_generation_contract(
    mode: str,
    requested_route: str,
    sampling_profile: str,
    reference_count: int,
) -> None:
    """Reject impossible Studio requests before analyzers or models are invoked."""

    if reference_count < 0:
        raise RouteError("Reference count cannot be negative.")
    mode = str(mode or "auto").strip().lower()
    requested_route = str(requested_route or ROUTE_AUTO).strip().lower()
    sampling_profile = str(sampling_profile or "")
    is_pdd = sampling_profile.startswith("pdd_ref2va_")
    profile_route = _profile_route(sampling_profile)
    is_lightx = sampling_profile.startswith("lightx_")
    if mode not in {"auto", MODE_TEXT_TO_IMAGE, MODE_IMAGE_TO_IMAGE, MODE_REFERENCE_EDIT}:
        raise RouteError(f"Unsupported H3 generation mode {mode!r}.")
    if requested_route not in {ROUTE_AUTO, ROUTE_FL2VA, ROUTE_REF2VA}:
        raise RouteError(f"Unknown H3 route {requested_route!r}.")
    if mode == MODE_IMAGE_TO_IMAGE and reference_count == 0:
        raise RouteError("Image-to-image requires at least one enabled reference image.")
    if mode == MODE_REFERENCE_EDIT and reference_count == 0:
        raise RouteError("Reference mix/edit requires at least one enabled reference image.")
    if is_pdd and reference_count == 0:
        raise RouteError("PDD REF2VA requires at least one enabled reference image.")
    if is_pdd and mode in {MODE_TEXT_TO_IMAGE, MODE_IMAGE_TO_IMAGE}:
        raise RouteError("PDD REF2VA supports reference mix/edit; use Auto or Reference mix/edit mode.")
    if is_pdd and requested_route == ROUTE_FL2VA:
        raise RouteError("PDD is trained for REF2VA and cannot run on a forced FL2VA route.")
    # FL2V LightX adapters are officially FL2VA-oriented, but community testing
    # has shown that they can be applied to the REF2VA model as an experimental
    # cross-route acceleration path. Allow that direction and warn below once
    # the effective mode is known. The inverse REF2V-on-FL2VA mismatch remains
    # blocked because it is not part of the supported workaround.
    if is_lightx and profile_route == ROUTE_REF2VA and requested_route == ROUTE_FL2VA:
        raise RouteError("The selected LightX profile is REF2V/REF2VA-only and cannot run on a forced FL2VA route.")

    effective_mode = mode
    if mode == "auto":
        if reference_count == 0:
            effective_mode = MODE_TEXT_TO_IMAGE
        elif reference_count == 1 and not is_pdd:
            effective_mode = MODE_IMAGE_TO_IMAGE
        else:
            effective_mode = MODE_REFERENCE_EDIT
    expected_route = ROUTE_REF2VA if effective_mode == MODE_REFERENCE_EDIT else ROUTE_FL2VA
    if is_lightx and profile_route == ROUTE_FL2VA and expected_route == ROUTE_REF2VA:
        LOGGER.warning("[H3 Studio] %s", EXPERIMENTAL_FL2V_REF2VA_WARNING)
    if is_lightx and profile_route == ROUTE_REF2VA and expected_route != ROUTE_REF2VA:
        raise RouteError(
            "The selected LightX profile uses a REF2V adapter. Use Reference mix/edit with at least one reference "
            "and Auto/REF2VA, or choose an FL2VA profile for text-to-image or single-source edits."
        )
    if requested_route != ROUTE_AUTO and requested_route != expected_route:
        raise RouteError(
            f"Forced {requested_route.upper()} is incompatible with {effective_mode.replace('_', ' ')} mode; use Auto."
        )


def choose_route(requested: str, mode: str, reference_count: int) -> RouteDecision:
    if reference_count < 0:
        raise RouteError("Reference count cannot be negative.")
    requested = str(requested or ROUTE_AUTO).strip().lower()
    if requested not in {ROUTE_AUTO, ROUTE_FL2VA, ROUTE_REF2VA}:
        raise RouteError(f"Unknown H3 route {requested!r}.")
    validate_generation_contract(mode, requested, "", reference_count)

    if requested == ROUTE_AUTO:
        if mode == MODE_TEXT_TO_IMAGE:
            return RouteDecision(requested, ROUTE_FL2VA, mode, reference_count, "native empty/keyframe conditioning")
        if mode == MODE_IMAGE_TO_IMAGE:
            return RouteDecision(
                requested, ROUTE_FL2VA, mode, reference_count, "source image used as first-frame anchor"
            )
        if mode == MODE_REFERENCE_EDIT:
            return RouteDecision(requested, ROUTE_REF2VA, mode, reference_count, "ordered full-reference conditioning")
        raise RouteError(f"Cannot auto-route unsupported mode {mode!r}.")

    return RouteDecision(requested, requested, mode, reference_count, "explicit user selection")
