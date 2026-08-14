from h3studio.runtime_optimization import (
    ATTENTION_CK,
    ATTENTION_OG,
    ATTENTION_PYTORCH,
    ATTENTION_SAGE,
    RuntimeCapabilities,
    RuntimeWorkload,
    resolve_runtime,
)


def caps(vram, *, free=4.0, windows=False, ck=True, sage=True, low=True, ffn=True):
    return RuntimeCapabilities(
        os_name="Windows" if windows else "Linux",
        gpu_name=f"Test GPU {vram}GB",
        total_vram_gb=float(vram),
        free_vram_gb=float(free),
        compute_capability="sm89",
        ck_attention=ck,
        sage_mem_eff=sage,
        low_vram_attention=low,
        ffn_chunking=ffn,
    )


def work(*, route="fl2va", refs=0, frames=5, mp=1.0, seq=8000):
    return RuntimeWorkload(
        route=route,
        mode="reference_edit" if route == "ref2va" else "text_to_image",
        reference_count=refs,
        frames=frames,
        width=1024,
        height=1024,
        megapixels=float(mp),
        sequence_length=int(seq),
        sequence_breakdown=f"total={seq}",
    )


def test_auto_8gb_short_still_uses_sage_with_two_head_groups():
    decision = resolve_runtime("auto", caps(8, windows=True), work(mp=1.0, seq=8000))
    assert decision.attention_backend == ATTENTION_SAGE
    assert decision.head_chunks == 2
    assert decision.ffn_chunks == 0
    assert "short H3 still packet" in decision.reason


def test_auto_8gb_tiny_still_avoids_unnecessary_chunk_overhead():
    decision = resolve_runtime("auto", caps(8, windows=True), work(mp=0.6, seq=6000))
    assert decision.attention_backend == ATTENTION_SAGE
    assert decision.head_chunks == 1


def test_auto_8gb_extreme_ref_pressure_can_escalate_to_eight_groups():
    decision = resolve_runtime(
        "auto",
        caps(8, windows=True),
        work(route="ref2va", refs=3, frames=20, mp=1.6, seq=26000),
    )
    assert decision.attention_backend == ATTENTION_SAGE
    assert decision.head_chunks == 8
    assert any("REF2VA" in warning for warning in decision.warnings)


def test_auto_16gb_compact_workload_prefers_ck():
    decision = resolve_runtime("auto", caps(16, free=5.0), work(mp=1.0, seq=8000))
    assert decision.resolved == "fast"
    assert decision.attention_backend == ATTENTION_CK
    assert decision.head_chunks == 1


def test_auto_16gb_heavy_workload_prefers_low_memory_path():
    decision = resolve_runtime("auto", caps(16, free=3.0), work(route="ref2va", refs=2, frames=13, mp=1.6, seq=18000))
    assert decision.resolved == "low_vram"
    assert decision.attention_backend == ATTENTION_SAGE
    assert decision.head_chunks == 2


def test_auto_24gb_prefers_ck_without_chunking():
    decision = resolve_runtime("auto", caps(24, free=10.0), work(route="ref2va", refs=2, frames=20, mp=2.0, seq=22000))
    assert decision.resolved == "fast"
    assert decision.attention_backend == ATTENTION_CK
    assert decision.head_chunks == 1


def test_og_current_never_adds_runtime_patch():
    decision = resolve_runtime("og_current", caps(24), work())
    assert decision.resolved == "og_current"
    assert decision.attention_backend == ATTENTION_OG
    assert decision.head_chunks == 1
    assert decision.ffn_chunks == 0


def test_quality_forces_pytorch_without_chunking():
    decision = resolve_runtime("quality", caps(24), work())
    assert decision.attention_backend == ATTENTION_PYTORCH
    assert decision.head_chunks == 1


def test_auto_never_enables_ffn_chunking():
    for vram in (8, 12, 16, 20, 24, 32):
        decision = resolve_runtime("auto", caps(vram), work(seq=24000, frames=20, mp=2.0))
        assert decision.ffn_chunks == 0


def test_ffn_chunking_requires_explicit_advanced_override():
    decision = resolve_runtime(
        "auto",
        caps(16),
        work(),
        {"ffn_chunks": 8, "ffn_sequence_threshold": 8192},
    )
    assert decision.ffn_chunks == 8
    assert decision.ffn_sequence_threshold == 8192
    assert any("experimental" in warning.lower() for warning in decision.warnings)


def test_missing_accelerated_backends_fall_back_to_pytorch():
    decision = resolve_runtime("fast", caps(24, ck=False, sage=False, low=False), work())
    assert decision.attention_backend == ATTENTION_PYTORCH
    assert decision.fallbacks
