from h3studio.seed_safety import MAX_SAFE_COMFY_SEED, clamp_seed


def test_seed_ceiling_is_strictly_below_comfyui_boundary() -> None:
    assert MAX_SAFE_COMFY_SEED == (1 << 50) - 1
    assert clamp_seed(1 << 50) == (1 << 50) - 1
    assert clamp_seed((1 << 63) - 1) == (1 << 50) - 1


def test_seed_clamp_preserves_valid_values() -> None:
    assert clamp_seed(0) == 0
    assert clamp_seed(42) == 42
    assert clamp_seed(MAX_SAFE_COMFY_SEED) == MAX_SAFE_COMFY_SEED
    assert clamp_seed(-5) == 0
