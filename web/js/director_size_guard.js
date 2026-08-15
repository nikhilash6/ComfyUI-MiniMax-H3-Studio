import { app } from "../../../scripts/app.js";

import { clampStudioNodeSize } from "./core/layout.js";

const TARGET = "H3StudioDirector";

function clampDirectorSize(node) {
  if (!node) return;
  const [width, height] = clampStudioNodeSize(node.size);
  if (!Array.isArray(node.size)) node.size = [width, height];
  else {
    node.size[0] = width;
    node.size[1] = height;
  }

  for (const target of node.widgets || []) {
    if (target?.__h3studioHidden) target.computeSize = () => [0, 0];
  }
}

function installSizeGuard(node) {
  if (!node || node.__h3studioSizeGuardInstalled) return;
  node.__h3studioSizeGuardInstalled = true;
  node.__h3studioPreferredSize = clampStudioNodeSize(node.size);

  const originalResize = node.onResize;
  node.onResize = function h3studioGuardedResize(size) {
    const incoming = Array.isArray(size) ? size : this.size;
    // Modern ComfyUI doesn't consistently expose resizing_node while DOM widgets
    // are active. If onResize hands us a real size, accept it as the user's size
    // and only clamp to the global safety bounds; never treat the previous size
    // as a minimum.
    if (Array.isArray(incoming) && Number.isFinite(Number(incoming[0])) && Number.isFinite(Number(incoming[1]))) {
      this.__h3studioPreferredSize = clampStudioNodeSize(incoming);
    }
    const result = originalResize?.apply(this, arguments);
    clampDirectorSize(this);
    return result;
  };

  const originalDrawForeground = node.onDrawForeground;
  node.onDrawForeground = function h3studioGuardedDrawForeground() {
    const result = originalDrawForeground?.apply(this, arguments);
    // Draw-time protection only fixes impossible/runaway values. It does not
    // snap back to an old preferred height, so vertical resizing remains free.
    clampDirectorSize(this);
    return result;
  };

  clampDirectorSize(node);
}

app.registerExtension({
  name: "H3Studio.DirectorSizeGuard",
  beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== TARGET) return;
    const originalCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function h3studioSizeGuardCreated() {
      const result = originalCreated?.apply(this, arguments);
      setTimeout(() => installSizeGuard(this), 0);
      return result;
    };
  },
});