from __future__ import annotations

import pytest

from h3studio.acceleration import (
    LIGHTX_PROFILES,
    LIGHTX_V01_REF2V_4_PRUNED_FILENAME,
    LIGHTX_V1_FL2V_4_PRUNED_FILENAME,
    LIGHTX_V1_FL2V_8_PRUNED_FILENAME,
)
from h3studio.errors import RouteError
from h3studio.routing import validate_generation_contract


def test_new_kijai_pruned_lightx_artifacts_are_first_class_profiles() -> None:
    four = LIGHTX_PROFILES["lightx_v1_fl2v_4_pruned"]
    eight = LIGHTX_PROFILES["lightx_v1_fl2v_8_pruned"]
    ref_er = LIGHTX_PROFILES["lightx_v01_ref2v_er_sde_4_pruned"]
    ref_sa = LIGHTX_PROFILES["lightx_v01_ref2v_sa_solver_4_pruned"]

    assert four.lora_filename == LIGHTX_V1_FL2V_4_PRUNED_FILENAME
    assert four.route == "fl2va"
    assert (four.sampler, four.scheduler, four.steps) == ("euler", "simple", 4)
    assert (four.shift_video, four.shift_audio, four.lora_strength) == (6.0, 3.0, 1.0)

    assert eight.lora_filename == LIGHTX_V1_FL2V_8_PRUNED_FILENAME
    assert eight.route == "fl2va"
    assert (eight.sampler, eight.scheduler, eight.steps) == ("euler", "simple", 8)
    assert (eight.shift_video, eight.shift_audio, eight.lora_strength) == (6.0, 3.0, 1.0)

    for profile in (ref_er, ref_sa):
        assert profile.lora_filename == LIGHTX_V01_REF2V_4_PRUNED_FILENAME
        assert profile.route == "ref2va"
        assert profile.steps == 4
        assert profile.lora_strength == 0.75
        assert profile.runtime_profile in {
            "LightX v0.1 | ER-SDE 4 steps",
            "LightX v0.1 | SA-Solver 4 steps",
        }


def test_lightx_profile_routes_reject_wrong_model_family() -> None:
    validate_generation_contract("text_to_image", "auto", "lightx_v1_fl2v_4_pruned", 0)
    validate_generation_contract("reference_edit", "auto", "lightx_v01_ref2v_er_sde_4_pruned", 1)

    with pytest.raises(RouteError, match="FL2V/FL2VA-only"):
        validate_generation_contract("text_to_image", "ref2va", "lightx_v1_fl2v_8_pruned", 0)

    with pytest.raises(RouteError, match="REF2V/REF2VA-only"):
        validate_generation_contract("reference_edit", "fl2va", "lightx_v01_ref2v_er_sde_4_pruned", 1)

    with pytest.raises(RouteError, match="uses a REF2V adapter"):
        validate_generation_contract("auto", "auto", "lightx_v01_ref2v_er_sde_4_pruned", 1)
