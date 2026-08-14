export function forEachQueueNode(rootGraph, callback) {
  const pendingGraphs = rootGraph ? [rootGraph] : [];
  const seenGraphs = new Set();
  const seenNodes = new Set();

  while (pendingGraphs.length) {
    const graph = pendingGraphs.pop();
    if (!graph || seenGraphs.has(graph)) continue;
    seenGraphs.add(graph);

    for (const node of graph._nodes || []) {
      if (!node || seenNodes.has(node)) continue;
      seenNodes.add(node);
      callback(node);
      if (node.subgraph) pendingGraphs.push(node.subgraph);
    }

    const subgraphs = graph.subgraphs;
    if (typeof subgraphs?.values === "function") {
      for (const subgraph of subgraphs.values()) pendingGraphs.push(subgraph);
    }
  }
}
