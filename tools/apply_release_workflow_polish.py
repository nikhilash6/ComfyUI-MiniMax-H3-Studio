from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GENERATOR = ROOT / "tools" / "generate_workflows.py"
DECODE_UI = ROOT / "web" / "h3_decode_ui.js"
LAYOUT = ROOT / "web" / "js" / "core" / "layout.js"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


POLISH_FUNCTIONS = r'''

def polish_release_workflow(workflow):
    """Apply the maintained release layout after graph construction.

    Keeping the polish in one deterministic pass makes spacing, note copy, and
    group bounds easy to audit without changing execution semantics.
    """
    nodes = {item["id"]: item for item in workflow["nodes"]}
    groups = {item["id"]: item for item in workflow["groups"]}

    def place(node_id, pos, size):
        target = nodes[node_id]
        target["pos"] = list(pos)
        target["size"] = list(size)

    def rewrite_note(node_id, title, text, pos, size):
        target = nodes[node_id]
        target["title"] = title
        target["pos"] = list(pos)
        target["size"] = list(size)
        target["widgets_values"][1] = text

    # Main execution columns. Every group has an explicit gutter and every
    # contained node keeps at least 40 px of breathing room from group chrome.
    place(10, [-1450, 220], [720, 820])
    place(11, [-560, 260], [600, 240])
    place(12, [-560, 580], [600, 170])
    place(16, [180, 260], [700, 620])
    place(13, [180, 940], [700, 480])
    place(14, [1060, 260], [460, 420])
    place(15, [1060, 750], [460, 190])
    place(30, [1060, 1010], [460, 420])
    place(17, [-560, 1960], [820, 540])
    place(19, [340, 1960], [440, 190])

    rewrite_note(
        20,
        "START HERE · quick setup",
        "# Start here\n\n> **Fast path:** describe the final image, add only references that have a specific job, then queue.\n\n## Make an image\n\n1. Write naturally in the **Director**.\n2. Add references only when needed. They become ordered `@Image1`, `@Image2`, and so on.\n3. Choose role, retention, aspect ratio, resolution, and seed.\n4. Queue the workflow.\n\n*No references* uses FL2VA text-to-image. **Multiple references** use REF2VA.",
        [-1450, -190],
        [500, 350],
    )
    rewrite_note(
        21,
        "Prompt enhancement",
        "# Prompt enhancement\n\n> *Two separate Qwen stages are used only when you enable them.*\n\n## Image analysis\n\n- **Analyze image pixels:** Qwen3-VL creates factual source descriptions and can repair automatic roles.\n\n## Prompt writing\n\n- **Prompt enhancement:** a compact text-only pass turns the request plus reference facts into a production prompt.\n\n**Same as image analyzer** lets one loaded checkpoint perform both jobs. Choose a separate writer only when you intentionally want to stage another model.",
        [-910, -190],
        [520, 350],
    )
    rewrite_note(
        22,
        "Routing",
        "# Routing\n\n> **Auto is the recommended default.**\n\n- **0 references:** FL2VA text-to-image\n- **1 anchor:** FL2VA image editing when requested\n- **Multiple references:** REF2VA\n\n*Forced routes are diagnostic controls.* Invalid reference and route combinations are rejected before model work starts.",
        [-370, -190],
        [520, 350],
    )
    rewrite_note(
        24,
        "Why the Director stays visible",
        "# Why the Director stays visible\n\n> The **Director** owns rich Studio state, reference cards, and `@Image` editing.\n\nThe reusable sampling graph only owns ordinary typed sampling and decode sockets. Keeping that boundary visible avoids fragile promoted DOM widgets and keeps the main path readable.\n\n**UI state stays here.** *Sampling stays reusable.*",
        [170, -190],
        [520, 350],
    )
    rewrite_note(
        25,
        "Reference semantics",
        "# Reference semantics\n\n> **Explicit card metadata always wins** over automatic inference.\n\n## Common roles\n\n- **identity / character** + `fully_preserved`: keep the person or design\n- **style** + `attribute_transfer`: borrow rendering language, not content\n- **composition / layout:** borrow placement and hierarchy\n- **outfit, pose, typography, lighting, texture, object, environment:** narrow transfers\n\n*Give each reference one clear visual job whenever possible.*",
        [1700, 260],
        [500, 430],
    )
    rewrite_note(
        26,
        "Sampling profiles",
        "# Sampling profiles\n\n> Choose the profile in the **Director**. The sampling graph follows it automatically.\n\n- **Base Quality / Balanced:** native H3 with no acceleration file\n- **LightX v0.1:** four-step accelerated recipe\n- **PDD 600 / 900:** four-step REF2VA students and requires the PDD node package\n\n## Frame extraction\n\nThe temporal quality setting controls the H3 frame packet. The selector then returns the recommended still.\n\n*Decode tuning is documented beside the decode controls.*",
        [1700, 750],
        [500, 380],
    )
    rewrite_note(
        27,
        "Benchmark Lab",
        "# Benchmark Lab\n\n> **Optional:** use this only when comparing quality or speed.\n\n1. Enter sampling profiles and resolution targets.\n2. Check the exact generation count on the node.\n3. Turn **Benchmark ON** in the purple Run mode switch.\n\n**Same seed** is the fairest comparison. *New seeds* are better for diversity sweeps. Disable live cells when you only care about throughput.",
        [840, 1920],
        [500, 420],
    )
    rewrite_note(
        28,
        "Model downloads",
        "# Recommended model set\n\n> **Core setup:** download files directly into the shown `ComfyUI/models/` folders. H3 Studio never downloads model weights automatically.\n\n## Core\n\n- [Kijai FL2VA pruned W4A8](https://huggingface.co/Kijai/MiniMax-H3-experimental/resolve/main/minimax_h3_fl2va_pruned_w4a8_mixed.safetensors?download=true) → `diffusion_models/`\n- [Kijai REF2VA pruned W4A8](https://huggingface.co/Kijai/MiniMax-H3-experimental/resolve/main/minimax_h3_ref2va_pruned_w4a8_mixed.safetensors?download=true) → `diffusion_models/`\n- [H3 Qwen3-VL 32B NVFP4](https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors?download=true) → `text_encoders/`\n- [Original H3 Video VAE FP16](https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/vae/minimax_h3_video_vae_fp16.safetensors?download=true) → `vae/`\n- [Qwen3-VL 4B analyzer + writer](https://huggingface.co/Comfy-Org/Qwen3-VL/resolve/main/text_encoders/qwen3vl_4b_fp8_scaled.safetensors?download=true) → `text_encoders/`\n\n## Optional\n\n- [TAEH3 live preview](https://huggingface.co/Kijai/MiniMax-H3-TAE/resolve/main/vae_approx/taeh3.safetensors?download=true) → `vae_approx/`\n- [LightX resized rank-21](https://huggingface.co/Kijai/MiniMax-H3_comfy/resolve/main/loras/minimax_h3_fl2v_lightx2v_turbo_4step_v0.1_comfy_resized_avg_rank_21_bf16.safetensors?download=true) → `loras/`\n- [Experimental T=1 Image VAE](https://huggingface.co/Mamad8/MiniMax-H3-Image-VAE/resolve/main/minimax_h3_t1_image_vae_step1597.safetensors?download=true) → `vae/`\n- [Qwen3-VL 8B writer](https://huggingface.co/Comfy-Org/Qwen3-VL/resolve/main/text_encoders/qwen3vl_8b_fp8_scaled.safetensors?download=true) → `text_encoders/`\n\n## Optional PDD\n\nChoose either the **600** or **900** LoRA + heads pair and install [Mamad8's PDD custom node](https://github.com/mamad8c/ComfyUI-MiniMaxH3-PDD-Mamad8).",
        [1700, 1190],
        [500, 760],
    )
    rewrite_note(
        29,
        "Upscaling / outpainting / inpainting",
        "# Post-processing\n\n- **Upscaling:** run a normal ComfyUI image upscaler after the selected H3 still.\n- **Outpainting:** increase the target aspect ratio and explicitly place the original reference inside the new frame.\n- **Inpainting:** exact mask-conditioned H3 inpainting is **not implemented** here.\n\n> *Semantic reference editing is not pixel-locked inpainting, and H3 Studio does not present it as one.*",
        [1700, 2010],
        [500, 390],
    )

    decode_note = note(
        31,
        "Native H3 VAE decode",
        "models",
        "# Native H3 VAE decode\n\n> **Start with Auto.** It keeps the proven native `256 / 64` geometry and chooses tile batching from available VRAM.\n\n## Manual controls\n\n- **Tile size:** `256`, `320`, `384`, `512`\n- **Overlap:** `64`, `96`, `128`\n- **Tile batch:** `Auto`, `1`, `2`, `4`\n\n**Larger tiles** use more VRAM but reduce tile count. *Smaller tiles* are safer when memory is tight.\n\n> Change Manual values only when tuning or benchmarking. **Auto** is the compatibility default.",
        [180, 1480],
        [700, 320],
        20,
    )
    if 31 not in nodes:
        workflow["nodes"].append(decode_note)
        nodes[31] = decode_note

    groups[1]["bounding"] = [-1500, 160, 860, 1020]
    groups[2]["bounding"] = [-620, 190, 720, 660]
    groups[3]["bounding"] = [120, 190, 820, 1640]
    groups[4]["bounding"] = [1000, 190, 580, 1320]
    groups[5]["bounding"] = [1640, 190, 620, 2260]
    groups[6]["bounding"] = [-1500, -250, 2750, 410]
    groups[7]["bounding"] = [-620, 1880, 1980, 700]

    workflow["last_node_id"] = max(item["id"] for item in workflow["nodes"])
    workflow["extra"]["h3studio"]["template_version"] = "1.7.0"
    workflow["extra"]["h3studio"]["design_source"] = "H3 Studio release column layout with guarded gutters"
    return workflow


def polish_native_fast_workflow(workflow):
    nodes = {item["id"]: item for item in workflow["nodes"]}
    notes = {
        100: (
            "START HERE · native fast path",
            "# Native fast path\n\n> **First test:** keep `0.40 MP`, 5 frames, and the wired LightX ER-SDE four-step recipe.\n\n1. Edit the prompt in **Text conditioning**.\n2. Queue once.\n3. Queue the identical prompt again to verify ComfyUI's node cache.\n\n**This graph is intentionally minimal.** *No Director, benchmark branch, analyzer, or live-video preview is scheduled here.*",
            [60, 850],
            [820, 310],
        ),
        101: (
            "Why this graph is different",
            "# Independent native stages\n\n> The encoder, FL2VA transformer, LightX adapter, and video VAE remain separate ComfyUI stages.\n\n**Text conditioning does not depend on the VAE.** The VAE is first needed after sampling, so ComfyUI can cache and release the heavyweight stages normally.\n\n*Nothing is hidden inside a combined model bundle.*",
            [960, 820],
            [820, 250],
        ),
    }
    for node_id, (title, text, pos, size) in notes.items():
        target = nodes[node_id]
        target["title"] = title
        target["widgets_values"][1] = text
        target["pos"] = list(pos)
        target["size"] = list(size)
    workflow["extra"]["h3studio"]["template_version"] = "native-fast-t2i-2"
    return workflow
'''


def patch_generator() -> None:
    text = GENERATOR.read_text(encoding="utf-8")
    anchor = "\n\ndef encoded(value):\n"
    if "def polish_release_workflow(workflow):" not in text:
        text = replace_once(text, anchor, POLISH_FUNCTIONS + anchor, "insert workflow polish")
    text = replace_once(
        text,
        "    workflow_text = encoded(build_workflow())\n",
        "    workflow_text = encoded(polish_release_workflow(build_workflow()))\n",
        "polish unified workflow",
    )
    text = replace_once(
        text,
        "    native_fast_t2i_text = encoded(build_native_fast_t2i())\n",
        "    native_fast_t2i_text = encoded(polish_native_fast_workflow(build_native_fast_t2i()))\n",
        "polish native workflow",
    )
    GENERATOR.write_text(text, encoding="utf-8", newline="\n")


def patch_decode_ui() -> None:
    text = DECODE_UI.read_text(encoding="utf-8")
    text = replace_once(
        text,
        'const PROMOTED_DEFAULTS = ["Auto", 256, 64, "Auto"];\n',
        'const PROMOTED_DEFAULTS = ["Auto", 256, 64, "Auto"];\nconst CONTROL_LABELS = {\n    tiling_mode: "Tiling mode",\n    tile_size: "Tile size",\n    tile_overlap: "Tile overlap",\n    tile_batch: "Tile batch",\n};\n',
        "decode control labels",
    )
    text = replace_once(
        text,
        '    if (!target) return;\n    const next = numeric\n',
        '    if (!target) return;\n    target.label = CONTROL_LABELS[name] || target.label;\n    const next = numeric\n',
        "friendly decode labels",
    )
    size_helper = r'''
function ensureDecodeNodeSize(node) {
    const kind = nodeClass(node);
    const minimumWidth = kind === SUBGRAPH_CLASS ? 700 : 440;
    const minimumHeight = kind === SUBGRAPH_CLASS ? 480 : 260;
    const width = Math.max(Number(node?.size?.[0]) || 0, minimumWidth);
    const height = Math.max(Number(node?.size?.[1]) || 0, minimumHeight);
    if (!Array.isArray(node.size)) node.size = [width, height];
    else {
        node.size[0] = width;
        node.size[1] = height;
    }
}

'''
    text = replace_once(
        text,
        "function sanitizeRuntimeNode(node) {\n",
        size_helper + "function sanitizeRuntimeNode(node) {\n",
        "decode size guard helper",
    )
    text = replace_once(
        text,
        "    if (kind !== NODE_CLASS && kind !== SUBGRAPH_CLASS) return;\n    sanitizeControlWidgets(node);\n",
        "    if (kind !== NODE_CLASS && kind !== SUBGRAPH_CLASS) return;\n    ensureDecodeNodeSize(node);\n    sanitizeControlWidgets(node);\n",
        "apply decode size guard",
    )
    text = text.replace("            const minimumWidth = 390;\n            const minimumHeight = 220;", "            const minimumWidth = 440;\n            const minimumHeight = 260;")
    DECODE_UI.write_text(text, encoding="utf-8", newline="\n")


def patch_director_layout() -> None:
    text = LAYOUT.read_text(encoding="utf-8")
    text = replace_once(text, "export const STUDIO_PANEL_HEIGHT = 530;", "export const STUDIO_PANEL_HEIGHT = 570;", "Director panel height")
    text = replace_once(text, "export const STUDIO_NODE_WIDTH = 520;", "export const STUDIO_NODE_WIDTH = 680;", "Director minimum width")
    text = replace_once(text, "export const STUDIO_NODE_HEIGHT = 780;", "export const STUDIO_NODE_HEIGHT = 820;", "Director minimum height")
    LAYOUT.write_text(text, encoding="utf-8", newline="\n")


def main() -> None:
    patch_generator()
    patch_decode_ui()
    patch_director_layout()
    print("Applied release workflow polish source changes.")


if __name__ == "__main__":
    main()
