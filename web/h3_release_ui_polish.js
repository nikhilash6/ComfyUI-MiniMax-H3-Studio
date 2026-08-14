import { app } from "../../scripts/app.js";

const WORKFLOW_ID = "51ffc0bb-1b7a-4a1c-a183-1ce99edb4e5e";
const PREVIEW_CLASS = "H3StudioTAEH3Preview";
const NOTE_CLASS = "H3StudioWorkflowNote";

const DOWNLOAD_NOTE = `# Recommended model set

> **Core setup:** download files directly into the shown \`ComfyUI/models/\` folders. H3 Studio never downloads model weights automatically.

## Core

- [Kijai FL2VA pruned W4A8](https://huggingface.co/Kijai/MiniMax-H3-experimental/resolve/main/minimax_h3_fl2va_pruned_w4a8_mixed.safetensors?download=true) → \`diffusion_models/\`
- [Kijai REF2VA pruned W4A8](https://huggingface.co/Kijai/MiniMax-H3-experimental/resolve/main/minimax_h3_ref2va_pruned_w4a8_mixed.safetensors?download=true) → \`diffusion_models/\`
- [H3 Qwen3-VL 32B NVFP4](https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors?download=true) → \`text_encoders/\`
- [Original H3 Video VAE FP16](https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/vae/minimax_h3_video_vae_fp16.safetensors?download=true) → \`vae/\`
- [Qwen3-VL 4B analyzer + writer](https://huggingface.co/Comfy-Org/Qwen3-VL/resolve/main/text_encoders/qwen3vl_4b_fp8_scaled.safetensors?download=true) → \`text_encoders/\`

## Optional

- [TAEH3 live preview](https://huggingface.co/Kijai/MiniMax-H3-TAE/resolve/main/vae_approx/taeh3.safetensors?download=true) → \`vae_approx/\`
- [LightX 4-step resized rank-21](https://huggingface.co/Kijai/MiniMax-H3_comfy/resolve/main/loras/minimax_h3_fl2v_lightx2v_turbo_4step_v0.1_comfy_resized_avg_rank_21_bf16.safetensors?download=true) → \`loras/\`
- [Official LightX 8-step v1.0](https://huggingface.co/lightx2v/Minimax-h3-Turbo/resolve/main/minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors?download=true) → \`loras/\`
- [Experimental T=1 Image VAE](https://huggingface.co/Mamad8/MiniMax-H3-Image-VAE/resolve/main/minimax_h3_t1_image_vae_step1597.safetensors?download=true) → \`vae/\`
- [Qwen3-VL 8B writer](https://huggingface.co/Comfy-Org/Qwen3-VL/resolve/main/text_encoders/qwen3vl_8b_fp8_scaled.safetensors?download=true) → \`text_encoders/\`

## Optional PDD

Choose either the **600** or **900** LoRA + heads pair and install [Mamad8's PDD custom node](https://github.com/mamad8c/ComfyUI-MiniMaxH3-PDD-Mamad8).`;

const DECODE_NOTE = `# Native H3 VAE decode

> **Start with Auto.** It keeps the proven native \`256 / 64\` geometry and chooses tile batching from available VRAM.

## Manual controls

- **Tile size:** \`256\`, \`320\`, \`384\`, \`512\`
- **Overlap:** \`64\`, \`96\`, \`128\`
- **Tile batch:** \`Auto\`, \`1\`, \`2\`, \`4\`

**Larger tiles** use more VRAM but reduce tile count. *Smaller tiles* are safer when memory is tight.

> **Quality warning:** Manual tile geometry changes the VAE's spatial context. Too little overlap, especially with larger tiles such as \`512 / 64\`, can cause visible degradation, softer detail, texture loss, or tile boundaries. If you increase tile size, increase overlap as well. For example, prefer \`512 / 128\` over \`512 / 64\`.

> Change Manual values only when tuning or benchmarking. **Auto** is the compatibility default.`;

const NODE_LAYOUT = new Map([
  [10, { pos: [-1450, 220], size: [720, 820] }],
  [11, { pos: [-560, 260], size: [600, 240] }],
  [12, { pos: [-560, 580], size: [600, 170] }],
  [16, { pos: [180, 260], size: [700, 620] }],
  [13, { pos: [180, 940], size: [700, 480] }],
  [14, { pos: [1060, 260], size: [460, 420] }],
  [15, { pos: [1060, 750], size: [460, 190] }],
  [30, { pos: [1060, 1010], size: [460, 420] }],
  [31, { pos: [180, 1480], size: [700, 360] }],
  [17, { pos: [-560, 1960], size: [820, 540] }],
  [19, { pos: [340, 1960], size: [440, 190] }],
  [20, { pos: [-1450, -190], size: [500, 350] }],
  [21, { pos: [-910, -190], size: [520, 350] }],
  [22, { pos: [-370, -190], size: [520, 350] }],
  [24, { pos: [170, -190], size: [520, 350] }],
  [25, { pos: [1700, 260], size: [500, 430] }],
  [26, { pos: [1700, 750], size: [500, 380] }],
  [28, { pos: [1700, 1190], size: [500, 800] }],
  [29, { pos: [1700, 2050], size: [500, 390] }],
  [27, { pos: [840, 1920], size: [500, 420] }],
]);

const GROUP_LAYOUT = new Map([
  [1, [-1490, 170, 800, 920]],
  [2, [-600, 210, 680, 590]],
  [3, [140, 210, 780, 1670]],
  [4, [1020, 210, 540, 1260]],
  [5, [1660, 210, 580, 2270]],
  [6, [-1490, -240, 2220, 420]],
  [7, [-600, 1880, 1980, 660]],
]);

const PREVIEW_CHOICES = {
  max_resolution: { values: [512, 768, 1024], fallback: 768, label: "Preview resolution" },
  jpeg_quality: { values: [70, 80, 90, 95], fallback: 90, label: "Preview quality" },
  preview_every_n_steps: { values: [1, 2, 4, 8], fallback: 1, label: "Preview every N steps" },
};

function nodeClass(node) {
  return String(node?.comfyClass || node?.type || "");
}

function serializedNodeById(graphData, id) {
  return (graphData?.nodes || []).find((node) => Number(node?.id) === Number(id)) || null;
}

function isMaintainedUnifiedWorkflow(graphData) {
  if (String(graphData?.id || "") === WORKFLOW_ID) return true;
  const nodes = graphData?.nodes || [];
  return nodes.some((node) => String(node?.type || "") === "H3StudioDirector")
    && nodes.some((node) => Number(node?.id) === 28 && String(node?.type || "") === NOTE_CLASS);
}

function patchNote(graphData, id, title, markdown) {
  const target = serializedNodeById(graphData, id);
  if (!target || String(target.type || "") !== NOTE_CLASS) return;
  target.title = title;
  const values = Array.isArray(target.widgets_values) ? [...target.widgets_values] : ["models", ""];
  while (values.length < 2) values.push("");
  values[1] = markdown;
  target.widgets_values = values;
}

function patchWorkflowLayout(graphData) {
  if (!isMaintainedUnifiedWorkflow(graphData)) return;

  for (const [id, layout] of NODE_LAYOUT) {
    const target = serializedNodeById(graphData, id);
    if (!target) continue;
    target.pos = [...layout.pos];
    target.size = [...layout.size];
  }

  for (const group of graphData.groups || []) {
    const bounding = GROUP_LAYOUT.get(Number(group?.id));
    if (bounding) group.bounding = [...bounding];
  }

  patchNote(graphData, 28, "Model downloads", DOWNLOAD_NOTE);
  patchNote(graphData, 31, "Native H3 VAE decode", DECODE_NOTE);

  graphData.extra ||= {};
  graphData.extra.h3studio ||= {};
  graphData.extra.h3studio.design_source = "H3 Studio release layout with tight group bounds";
}

function constrainNumericCombo(node, name, definition) {
  const target = (node?.widgets || []).find((candidate) => candidate?.name === name);
  if (!target) return;
  const numeric = Number(target.value);
  const next = definition.values.includes(numeric) ? numeric : definition.fallback;
  target.value = next;
  if (target._state) target._state.value = next;
  target.label = definition.label;
  target.type = "combo";
  target.options ||= {};
  target.options.values = [...definition.values];
}

function polishPreviewControls(node) {
  if (nodeClass(node) !== PREVIEW_CLASS) return;
  for (const [name, definition] of Object.entries(PREVIEW_CHOICES)) {
    constrainNumericCombo(node, name, definition);
  }
  const width = Math.max(Number(node?.size?.[0]) || 0, 700);
  const height = Math.max(Number(node?.size?.[1]) || 0, 620);
  if (Array.isArray(node.size)) {
    node.size[0] = width;
    node.size[1] = height;
  } else {
    node.size = [width, height];
  }
  node.setDirtyCanvas?.(true, true);
}

app.registerExtension({
  name: "H3Studio.ReleaseUIPolish",

  beforeConfigureGraph(graphData) {
    patchWorkflowLayout(graphData);
  },

  nodeCreated(node) {
    queueMicrotask(() => polishPreviewControls(node));
  },

  loadedGraphNode(node) {
    queueMicrotask(() => polishPreviewControls(node));
  },

  afterConfigureGraph() {
    for (const node of app.graph?._nodes || []) polishPreviewControls(node);
  },
});
