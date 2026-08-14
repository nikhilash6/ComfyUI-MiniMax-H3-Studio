import { app } from "../../scripts/app.js";

const SMART = "H3StudioSmartBenchmark";
const LEGACY = "H3StudioABComparison";

function widget(node, name) { return node?.widgets?.find((candidate) => candidate.name === name) || null; }
function graphLink(id) {
  const links = app.graph?.links;
  if (!links || id == null) return null;
  return typeof links.get === "function" ? links.get(id) : links[id];
}
function inputSource(node, inputName) {
  const input = node?.inputs?.find((candidate) => candidate.name === inputName);
  const link = graphLink(input?.link);
  if (!link) return null;
  return {
    node: app.graph?.getNodeById?.(Number(link.origin_id ?? link.originId ?? link.source_id)),
    slot: Number(link.origin_slot ?? link.originSlot ?? link.source_slot ?? 0),
  };
}
function outputTargets(node, outputIndex) {
  return (node?.outputs?.[outputIndex]?.links || []).map((id) => graphLink(id)).filter(Boolean).map((link) => ({
    node: app.graph?.getNodeById?.(Number(link.target_id ?? link.targetId)),
    slot: Number(link.target_slot ?? link.targetSlot ?? 0),
  })).filter((item) => item.node);
}
function inputIndex(node, name) { return Math.max(0, (node.inputs || []).findIndex((candidate) => candidate.name === name)); }
function setWidget(node, name, value) {
  const target = widget(node, name);
  if (!target) return;
  target.value = value;
  target.callback?.(value, app.canvas, node, [0, 0], {});
}
function ensureInput(source, target, inputName) {
  if (!source?.node || !target) return;
  const index = inputIndex(target, inputName);
  if (target.inputs?.[index]?.link != null) return;
  source.node.connect?.(source.slot, target, index);
}
function ensureOutputs(target, outputIndex, destinations) {
  for (const destination of destinations) {
    const already = (target.outputs?.[outputIndex]?.links || []).map((id) => graphLink(id)).some((link) =>
      Number(link?.target_id ?? link?.targetId) === Number(destination.node.id)
      && Number(link?.target_slot ?? link?.targetSlot ?? 0) === Number(destination.slot)
    );
    if (!already) target.connect?.(outputIndex, destination.node, destination.slot);
  }
}

function migrate(oldNode, existingSmart = null) {
  const bundle = inputSource(oldNode, "h3_bundle");
  const context = inputSource(oldNode, "studio_context");
  const imageTargets = outputTargets(oldNode, 0);
  const reportTargets = outputTargets(oldNode, 1);
  const oldGrid = Number(widget(oldNode, "grid_cell_size")?.value || 576);
  let node = existingSmart;

  if (!node) {
    const factory = globalThis.LiteGraph?.createNode;
    if (typeof factory !== "function") return null;
    node = factory.call(globalThis.LiteGraph, SMART);
    if (!node) return null;
    node.pos = Array.isArray(oldNode.pos) ? [...oldNode.pos] : oldNode.pos;
    node.size = [760, Math.max(620, Number(oldNode.size?.[1]) || 680)];
    node.title = "H3 Studio · Smart Benchmark";
    node.properties ||= {};
    node.properties.h3studio_migrated_from_legacy_benchmark = true;
    app.graph.add(node);
    setWidget(node, "scenarios_json", "[]");
    setWidget(node, "max_scenarios", 12);
    setWidget(node, "grid_cell_size", Math.max(320, Math.min(896, oldGrid || 576)));
  } else {
    console.info("[H3 Studio] Existing Smart Benchmark found; absorbing legacy Benchmark Lab instead of creating a duplicate.");
  }

  ensureInput(bundle, node, "h3_bundle");
  ensureInput(context, node, "studio_context");
  ensureOutputs(node, 0, imageTargets);
  ensureOutputs(node, 1, reportTargets);
  app.graph.remove(oldNode);
  return node;
}

function migrateAll() {
  const legacy = [...(app.graph?._nodes || [])].filter((node) => node?.comfyClass === LEGACY);
  if (!legacy.length) return;
  let smart = (app.graph?._nodes || []).find((node) => node?.comfyClass === SMART) || null;
  for (const node of legacy) smart = migrate(node, smart) || smart;
  app.graph?.setDirtyCanvas?.(true, true);
  console.info(`[H3 Studio] Legacy benchmark migration complete · ${legacy.length} old node(s) removed · one Smart Benchmark retained.`);
}

app.registerExtension({
  name: "H3Studio.SmartBenchmarkLegacyMigrationV4",
  afterConfigureGraph() { setTimeout(migrateAll, 80); },
});
