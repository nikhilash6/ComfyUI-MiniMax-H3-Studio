from __future__ import annotations

from types import SimpleNamespace

from h3studio.reference_integrity_fixes import (
    _ensure_ordered_mentions,
    _ordered_contract,
    _suspicious_duplicate_ordinals,
)


def _ref(
    ordinal: int,
    description: str,
    fingerprint: str,
    *,
    role: str = "reference",
    description_auto: bool = True,
):
    return SimpleNamespace(
        ordinal=ordinal,
        role=role,
        effective_role=role,
        retention="reference_only",
        description=description,
        fingerprint=fingerprint,
        description_auto=description_auto,
        tags=("visually_analyzed",) if description_auto else (),
    )


def test_duplicate_auto_descriptions_across_different_pixels_are_invalidated() -> None:
    copied = "Orange-haired subject wearing a black and white outfit while kneeling outdoors."
    refs = (
        _ref(1, copied, "pixels-a"),
        _ref(2, copied, "pixels-b"),
    )
    assert _suspicious_duplicate_ordinals(refs) == {1, 2}


def test_manual_duplicate_descriptions_are_not_treated_as_stale() -> None:
    copied = "User deliberately assigned the same description to both cards."
    refs = (
        _ref(1, copied, "pixels-a", description_auto=False),
        _ref(2, copied, "pixels-b", description_auto=False),
    )
    assert _suspicious_duplicate_ordinals(refs) == set()


def test_ordered_contract_keeps_each_description_on_its_own_ordinal() -> None:
    refs = (
        _ref(1, "Orange-haired woman holding a katana in an urban scene.", "pixels-a"),
        _ref(2, "Blue-haired woman seated indoors with her hands in her lap.", "pixels-b"),
    )
    contract = _ordered_contract(refs)
    assert "@Image1 = reference: Orange-haired woman" in contract
    assert "@Image2 = reference: Blue-haired woman" in contract
    assert contract.index("@Image1") < contract.index("@Image2")


def test_enhanced_prompt_always_contains_all_active_image_tags() -> None:
    refs = (
        _ref(1, "Orange-haired woman.", "pixels-a"),
        _ref(2, "Blue-haired woman.", "pixels-b"),
    )
    result = _ensure_ordered_mentions("Place both subjects in a park.", refs)
    assert result.startswith("Reference mapping: @Image1")
    assert "@Image2" in result
    assert result.endswith("Place both subjects in a park.")
