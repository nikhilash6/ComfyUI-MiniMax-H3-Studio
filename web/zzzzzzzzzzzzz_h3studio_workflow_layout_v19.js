import { app } from "../../scripts/app.js";


if (!globalThis.__H3_STUDIO_CANONICAL_UI__) {
const WORKFLOW_ID = "51ffc0bb-1b7a-4a1c-a183-1ce99edb4e5e";

const NODE_LAYOUT = new Map([
  [10, { pos: [-1450, 220], size: [720, 900] }],
  [11, { pos: [-560, 260], size: [600, 240] }],
  [12, { pos: [-560, 580], size: [600, 170] }],
  [16, { pos: [180, 260], size: [700, 620] }],
  [13, { pos: [180, 940], size: [700, 480] }],
  [31, { pos: [180, 1480], size: [700, 360] }],
  [14, { pos: [1060, 260], size: [460, 420] }],
  [15, { pos: [1060, 750], size: [460, 190] }],
  [30, { pos: [1060, 1010], size: [460, 420] }],
  [20, { pos: [-1450, -190], size: [500, 350] }],
  [21, { pos: [-910, -190], size: [520, 350] }],
  [22, { pos: [-370, -190], size: [520, 350] }],
  [24, { pos: [170, -190], size: [520, 350] }],
  [25, { pos: [1700, 260], size: [500, 430] }],
  [26, { pos: [1700, 750], size: [500, 380] }],
  [28, { pos: [1700, 1190], size: [500, 800] }],
  [29, { pos: [1700, 2050], size: [500, 390] }],
  [17, { pos: [-560, 1980], size: [900, 620] }],
  [19, { pos: [400, 1980], size: [440, 190] }],
  [27, { pos: [400, 2230], size: [500, 370] }],
]);

const GROUP_LAYOUT = new Map([
  [1, { title: "01 · Director", bounding: [-1490, 170, 800, 1010] }],
  [2, { title: "02 · Models + conditioning", bounding: [-600, 210, 680, 590] }],
  [3, { title: "03 · Preview + sampling", bounding: [140, 210, 780, 1670] }],
  [4, { title: "04 · Final output", bounding: [1020, 210, 540, 1260] }],
  [5, { title: "05 · Reference + setup notes", bounding: [1660, 210, 580, 2270] }],
  [6, { title: "START · H3 Studio guide", bounding: [-1490, -240, 2220, 420] }],
  [7, { title: "OPTIONAL · Benchmark lab", bounding: [-600, 1900, 1540, 750] }],
]);

function isUnifiedWorkflow(graphData) {
  if (String(graphData?.id || "") === WORKFLOW_ID) return true;
  const nodes = graphData?.nodes || [];
  return nodes.some((node) => Number(node?.id) === 10 && String(node?.type || "") === "H3StudioDirector")
    && nodes.some((node) => Number(node?.id) === 28 && String(node?.type || "") === "H3StudioWorkflowNote");
}

function applyLayout(_graphData) {
  // Respect user-saved node positions and group bounds on canvas reload.
}

app.registerExtension({
  name: "H3Studio.WorkflowLayoutV19",
  beforeConfigureGraph(graphData) {
    applyLayout(graphData);
  },
});

}
