import { app } from "../../scripts/app.js";

const SMART = "H3StudioSmartBenchmark";
const LEGACY = "H3StudioABComparison";

function widget(node, name) {
  return node?.widgets?.find((candidate) => candidate.name === name) || null;
}

function graphLink(id) {
  const links = app.graph?.links;
  if (!links || id == null) return null;
  return typeof links.get === "function" ? links.get(id) : links[id];
}

function inputSource(oldNode, inputName) {
  const input = oldNode?.inputs?.find((candidate) => candidate.name === inputName);
  const link = graphLink(input?.link);
  if (!link) return null;
  return {
    node: app.graph?.getNodeById?.(Number(link.origin_id ?? link.originId ?? link.source_id)),
    slot: Number(link.origin_slot ?? link.originSlot ?? link.source_slot ?? 0),
  };
}

function outputTargets(oldNode, outputIndex) {
  return (oldNode?.outputs?.[outputIndex]?.links || []).map((id) => graphLink(id)).filter(Boolean).map((link) => ({
    node: app.graph?.getNodeById?.(Number(link.target_id ?? link.targetId)),
    slot: Number(link.target_slot ?? link.targetSlot ?? 0),
  })).filter((item) => item.node);
}

function inputIndex(node, name) {
  return Math.max(0, (node.inputs || []).findIndex((candidate) => candidate.name === name));
}

function setWidget(node, name, value) {
  const target = widget(node, name);
  if (!target) return;
  target.value = value;
  target.callback?.(value, app.canvas, node, [0, 0], {});
}

function migrate(oldNode) {
  const factory = globalThis.LiteGraph?.createNode;
  if (typeof factory !== "function") return null;
  const bundle = inputSource(oldNode, "h3_bundle");
  const context = inputSource(oldNode, "studio_context");
  const imageTargets = outputTargets(oldNode, 0);
  const reportTargets = outputTargets(oldNode, 1);
  const oldGrid = Number(widget(oldNode, "grid_cell_size")?.value || 576);
  const node = factory.call(globalThis.LiteGraph, SMART);
  if (!node) return null;
  node.pos = Array.isArray(oldNode.pos) ? [...oldNode.pos] : oldNode.pos;
  node.size = [760, Math.max(680, Number(oldNode.size?.[1]) || 680)];
  node.title = "H3 Studio · Smart Benchmark Lab";
  node.properties ||= {};
  node.properties.h3studio_migrated_from_legacy_benchmark = true;
  app.graph.add(node);
  app.graph.remove(oldNode);
  if (bundle?.node) bundle.node.connect?.(bundle.slot, node, inputIndex(node, "h3_bundle"));
  if (context?.node) context.node.connect?.(context.slot, node, inputIndex(node, "studio_context"));
  for (const target of imageTargets) node.connect?.(0, target.node, target.slot);
  for (const target of reportTargets) node.connect?.(1, target.node, target.slot);
  setWidget(node, "scenarios_json", "[]");
  setWidget(node, "max_scenarios", 12);
  setWidget(node, "grid_cell_size", Math.max(320, Math.min(896, oldGrid || 576)));
  console.info("[H3 Studio] Migrated legacy Benchmark Lab to Smart Benchmark Lab.");
  return node;
}

function migrateAll() {
  const legacy = [...(app.graph?._nodes || [])].filter((node) => node?.comfyClass === LEGACY);
  for (const node of legacy) migrate(node);
  if (legacy.length) app.graph?.setDirtyCanvas?.(true, true);
}

app.registerExtension({
  name: "H3Studio.SmartBenchmarkLegacyMigration",
  afterConfigureGraph() {
    setTimeout(migrateAll, 80);
  },
});
