import { app } from "../../scripts/app.js";

const NOTE = "H3StudioWorkflowNote";
const className = (node) => String(node?.comfyClass || node?.type || "");

const PROMPT_NOTE = `## Modern prompt preparation\n\n- **Recommended:** Qwen3.5-4B analyzes reference pixels and writes the production brief with one shared loaded model.\n- **Fast:** Qwen3.5-2B analyzes pixels; Qwen3.5-4B remains the writer.\n- **Fastest Vision:** MiniCPM-V 4.6 GGUF + mmproj handles factual vision through llama.cpp; Qwen3.5-4B writes.\n- **Legacy:** Qwen3-VL 4B/8B stay selectable for compatibility.\n\nFactual descriptions are cached by image fingerprint, deterministic, and targeted at roughly 35-70 dense words. The writer is a separate text-only validated pass with thinking disabled.`;

function modernize(text) {
  let value = String(text || "");
  if (/## Two deliberate Qwen stages/i.test(value)) value = PROMPT_NOTE;
  value = value.replace(
    /- \[Qwen3-VL 4B analyzer \+ writer[^\n]*/gi,
    "- **Recommended prompt prep:** Qwen3.5-4B shared analyzer + writer → `text_encoders/`\n- **Fast:** Qwen3.5-2B analyzer + Qwen3.5-4B writer → `text_encoders/`\n- **Fastest vision:** MiniCPM-V 4.6 GGUF + `mmproj-model-f16.gguf` → `h3studio_vlm/`, with Qwen3.5-4B writer\n- **Legacy:** Qwen3-VL 4B / 8B remain compatible",
  );
  return value;
}

function patchNotes() {
  for (const node of app.graph?._nodes || []) {
    if (className(node) !== NOTE) continue;
    const widget = node.widgets?.find((candidate) => candidate.name === "text");
    if (!widget || typeof widget.value !== "string") continue;
    const next = modernize(widget.value);
    if (next === widget.value) continue;
    widget.value = next;
    widget.callback?.(next, app.canvas, node, [0, 0], {});
  }
}

app.registerExtension({
  name: "H3Studio.AnalyzerNotesMigration",
  afterConfigureGraph() {
    patchNotes();
  },
});
