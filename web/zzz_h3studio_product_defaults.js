import { app } from "../../scripts/app.js";

const TARGET = "H3StudioDirector";
const STATE_PROPERTY = "h3studio_state";
const DEFAULT_MEGAPIXELS = 1.5;
const DEFAULT_SAMPLING_PROFILE = "lightx_v1_fl2v_8";

function widget(node, name) {
  return node?.widgets?.find((candidate) => candidate?.name === name) || null;
}

function seedNewDirectorDefaults(node) {
  if (!node || node.comfyClass !== TARGET) return;
  node.properties ||= {};
  const stateWidget = widget(node, "studio_state");
  const existing = String(stateWidget?.value || node.properties?.[STATE_PROPERTY] || "").trim();
  if (existing) return;

  const state = {
    schema_version: 10,
    generation: {
      megapixels: DEFAULT_MEGAPIXELS,
      sampling_profile: DEFAULT_SAMPLING_PROFILE,
    },
  };
  const serialized = JSON.stringify(state);

  const megapixels = widget(node, "megapixels");
  if (megapixels) megapixels.value = DEFAULT_MEGAPIXELS;
  const sampling = widget(node, "sampling_profile");
  if (sampling) sampling.value = DEFAULT_SAMPLING_PROFILE;
  if (stateWidget) stateWidget.value = serialized;
  node.properties[STATE_PROPERTY] = serialized;
}

app.registerExtension({
  name: "H3Studio.ProductDefaultsV1",
  beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== TARGET) return;
    const created = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function h3studioProductDefaultsCreated() {
      const result = created?.apply(this, arguments);
      seedNewDirectorDefaults(this);
      return result;
    };
  },
});
