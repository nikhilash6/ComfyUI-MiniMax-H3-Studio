import { app } from "../../scripts/app.js";

const WORKFLOW_ID = "51ffc0bb-1b7a-4a1c-a183-1ce99edb4e5e";
const PREVIEW_CLASS = "H3StudioTAEH3Preview";
const NOTE_CLASS = "H3StudioWorkflowNote";
const DIRECTOR_CLASS = "H3StudioDirector";
const FINAL_SWITCH_CLASS = "H3StudioLazyImageSwitch";
const COMPARISON_CLASS = "H3StudioComparisonView";

const DOWNLOAD_NOTE = `# Recommended model set

> **Install manually:** place each file in the shown \`ComfyUI/models/\` folder. H3 Studio never downloads model weights automatically. Acceleration profiles load the exact matching LoRA by filename, so do **not** add these profile LoRAs again as custom LoRAs.

## Core models

- **FL2VA base** · [Kijai pruned W4A8](https://huggingface.co/Kijai/MiniMax-H3-experimental/resolve/main/minimax_h3_fl2va_pruned_w4a8_mixed.safetensors?download=true) → \`diffusion_models/\`
- **REF2VA base** · [Kijai pruned W4A8](https://huggingface.co/Kijai/MiniMax-H3-experimental/resolve/main/minimax_h3_ref2va_pruned_w4a8_mixed.safetensors?download=true) → \`diffusion_models/\`
- **H3 text encoder** · [Qwen3-VL 32B NVFP4](https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors?download=true) → \`text_encoders/\`
- **Original final VAE** · [H3 Video VAE FP16](https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/vae/minimax_h3_video_vae_fp16.safetensors?download=true) → \`vae/\`
- **Prompt analyzer / writer** · [Qwen3-VL 4B](https://huggingface.co/Comfy-Org/Qwen3-VL/resolve/main/text_encoders/qwen3vl_4b_fp8_scaled.safetensors?download=true) → \`text_encoders/\`

## Recommended acceleration profiles

> **FL2VA only.** Use these for text-to-image or a single-source FL2VA edit.

- **LightX v1.0 · 8-step · official full** · [\`minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors\`](https://huggingface.co/lightx2v/Minimax-h3-Turbo/resolve/main/minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors?download=true) → \`loras/\`
- **LightX v1.0 · 8-step · Kijai pruned rank-24** · [smaller equivalent](https://huggingface.co/Kijai/MiniMax-H3_comfy/resolve/main/loras/minimax_h3_fl2v_lightx2v_turbo_8step_v1.0_resized_avg_rank_24_bf16.safetensors?download=true) → \`loras/\`
- **LightX v1.0 · 4-step 768p · Kijai pruned rank-31** · [speed profile](https://huggingface.co/Kijai/MiniMax-H3_comfy/resolve/main/loras/minimax_h3_fl2v_lightx2v_turbo_4step_v1.0_768p_resized_avg_rank_31_bf16.safetensors?download=true) → \`loras/\`

## Alternative / pruned acceleration models

- **FL2VA · LightX v0.1 · 4-step · Kijai pruned rank-21** · [ER-SDE / SA-Solver profile artifact](https://huggingface.co/Kijai/MiniMax-H3_comfy/resolve/main/loras/minimax_h3_fl2v_lightx2v_turbo_4step_v0.1_comfy_resized_avg_rank_21_bf16.safetensors?download=true) → \`loras/\`
- **REF2VA · LightX v0.1 · 4-step · Kijai pruned rank-20** · [reference-generation artifact](https://huggingface.co/Kijai/MiniMax-H3_comfy/resolve/main/loras/minimax_h3_ref2v_lightx2v_turbo_4step_v0.1_resized_avg_rank_20_bf16.safetensors?download=true) → \`loras/\`

> The REF2V profile is rejected on FL2VA routes. Switch **Mode** to Reference mix/edit and use Auto/REF2VA. FL2V profiles are likewise rejected on REF2VA.

## Preview / VAE extras

- **TAEH3 live preview** · [\`taeh3.safetensors\`](https://huggingface.co/Kijai/MiniMax-H3-TAE/resolve/main/vae_approx/taeh3.safetensors?download=true) → \`vae_approx/\`
- **Experimental T=1 Image VAE** · [\`minimax_h3_t1_image_vae_step1597.safetensors\`](https://huggingface.co/Mamad8/MiniMax-H3-Image-VAE/resolve/main/minimax_h3_t1_image_vae_step1597.safetensors?download=true) → \`vae/\`
- **Optional Qwen3-VL 8B writer** · [\`qwen3vl_8b_fp8_scaled.safetensors\`](https://huggingface.co/Comfy-Org/Qwen3-VL/resolve/main/text_encoders/qwen3vl_8b_fp8_scaled.safetensors?download=true) → \`text_encoders/\`

## PDD · optional REF2VA acceleration

Choose either the **600** or **900** LoRA + heads pair and install [Mamad8's PDD custom node](https://github.com/mamad8c/ComfyUI-MiniMaxH3-PDD-Mamad8). PDD is REF2VA-only.`;

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
  return nodes.some((node) => String(node?.type || "") === DIRECTOR_CLASS)
    && nodes.some((node) => Number(node?.id) === 28 && String(node?.type || "") === NOTE_CLASS);
}

function appendOriginLink(node, slot, linkId) {
  const output = node?.outputs?.[slot];
  if (!output) return false;
  const links = Array.isArray(output.links) ? [...output.links] : [];
  if (!links.includes(linkId)) links.push(linkId);
  output.links = links;
  return true;
}

function ensureComparisonNode(graphData) {
  const nodes = graphData?.nodes || [];
  if (nodes.some((node) => String(node?.type || "") === COMPARISON_CLASS)) return;
  const director = nodes.find((node) => String(node?.type || "") === DIRECTOR_CLASS);
  const finalSwitch = nodes.find((node) => String(node?.type || "") === FINAL_SWITCH_CLASS);
  if (!director?.outputs?.[0] || !finalSwitch?.outputs?.[0]) return;

  const nodeId = Math.max(Number(graphData.last_node_id) || 0, ...nodes.map((node) => Number(node?.id) || 0)) + 1;
  const existingLinks = Array.isArray(graphData.links) ? graphData.links : [];
  let linkId = Math.max(Number(graphData.last_link_id) || 0, ...existingLinks.map((link) => Number(link?.[0]) || 0));
  const imageLink = ++linkId;
  const contextLink = ++linkId;
  const order = Math.max(0, ...nodes.map((node) => Number(node?.order) || 0)) + 1;

  appendOriginLink(finalSwitch, 0, imageLink);
  appendOriginLink(director, 0, contextLink);
  existingLinks.push(
    [imageLink, Number(finalSwitch.id), 0, nodeId, 0, "IMAGE"],
    [contextLink, Number(director.id), 0, nodeId, 1, "H3_STUDIO_CONTEXT"],
  );
  graphData.links = existingLinks;
  graphData.nodes.push({
    id: nodeId,
    type: COMPARISON_CLASS,
    pos: [1060, 1010],
    size: [460, 420],
    flags: {},
    order,
    mode: 0,
    inputs: [
      { name: "images", type: "IMAGE", link: imageLink },
      { name: "studio_context", type: "H3_STUDIO_CONTEXT", link: contextLink },
    ],
    outputs: [],
    title: "Reference comparison · optional",
    properties: { "Node name for S&R": COMPARISON_CLASS },
    widgets_values: [],
    color: "#3c514c",
    bgcolor: "#24312f",
  });
  graphData.last_node_id = nodeId;
  graphData.last_link_id = linkId;
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

function patchWorkflowLayout(_graphData) {
  // Respect user-saved node positions and group bounds on canvas reload.
}

function constrainNumericCombo(node, name, definition) {
  const target = (node?.widgets || []).find((candidate) => candidate?.name === name);
  if (!target) return;
  const numeric = Number(target.value);
  const next = definition.values.includes(numeric) ? numeric : definition.fallback;
  target.value = next;
  if (target._state) target._state.value = next;
  target.label = definition.label;
  try { target.type = "combo"; } catch {}
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
