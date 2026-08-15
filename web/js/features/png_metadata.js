const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const utf8 = new TextDecoder("utf-8");
const latin1 = new TextDecoder("latin1");

function uint32(view, offset) {
  return view.getUint32(offset, false);
}

function bytesEqual(bytes, offset, expected) {
  if (offset + expected.length > bytes.length) return false;
  return expected.every((value, index) => bytes[offset + index] === value);
}

function splitNull(bytes, start, decoder = latin1) {
  let end = start;
  while (end < bytes.length && bytes[end] !== 0) end += 1;
  return [decoder.decode(bytes.subarray(start, end)), Math.min(bytes.length, end + 1)];
}

async function inflate(data) {
  if (typeof DecompressionStream !== "function") {
    throw new Error("This browser cannot decompress PNG zTXt/iTXt metadata.");
  }
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function decodeTextChunk(type, data) {
  if (type === "tEXt") {
    const [keyword, next] = splitNull(data, 0, latin1);
    return [keyword, latin1.decode(data.subarray(next))];
  }

  if (type === "zTXt") {
    const [keyword, next] = splitNull(data, 0, latin1);
    if (next >= data.length) return [keyword, ""];
    const compressionMethod = data[next];
    if (compressionMethod !== 0) throw new Error(`Unsupported PNG zTXt compression method ${compressionMethod}.`);
    const decompressed = await inflate(data.subarray(next + 1));
    return [keyword, latin1.decode(decompressed)];
  }

  if (type === "iTXt") {
    let cursor = 0;
    const [keyword, afterKeyword] = splitNull(data, cursor, latin1);
    cursor = afterKeyword;
    const compressed = data[cursor] === 1;
    cursor += 1;
    const compressionMethod = data[cursor] ?? 0;
    cursor += 1;
    const [, afterLanguage] = splitNull(data, cursor, utf8);
    cursor = afterLanguage;
    const [, afterTranslated] = splitNull(data, cursor, utf8);
    cursor = afterTranslated;
    let textBytes = data.subarray(cursor);
    if (compressed) {
      if (compressionMethod !== 0) throw new Error(`Unsupported PNG iTXt compression method ${compressionMethod}.`);
      textBytes = await inflate(textBytes);
    }
    return [keyword, utf8.decode(textBytes)];
  }

  return null;
}

export async function readPngTextChunks(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  if (!bytesEqual(bytes, 0, PNG_SIGNATURE)) throw new Error("The demo metadata source is not a PNG file.");
  const view = new DataView(arrayBuffer);
  const result = {};
  let offset = PNG_SIGNATURE.length;

  while (offset + 12 <= bytes.length) {
    const length = uint32(view, offset);
    const typeStart = offset + 4;
    const type = String.fromCharCode(...bytes.subarray(typeStart, typeStart + 4));
    const dataStart = typeStart + 4;
    const dataEnd = dataStart + length;
    const next = dataEnd + 4; // CRC
    if (dataEnd > bytes.length || next > bytes.length) throw new Error(`Corrupt PNG chunk ${type}.`);

    if (type === "tEXt" || type === "zTXt" || type === "iTXt") {
      const decoded = await decodeTextChunk(type, bytes.subarray(dataStart, dataEnd));
      if (decoded?.[0]) result[decoded[0]] = decoded[1];
    }
    offset = next;
    if (type === "IEND") break;
  }
  return result;
}

function json(value) {
  if (value == null || value === "") return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return null;
  }
}

function stateCandidate(value) {
  const decoded = json(value);
  return decoded && typeof decoded === "object" && !Array.isArray(decoded) ? decoded : null;
}

function findDirectorStateInWorkflow(workflow) {
  if (!workflow || typeof workflow !== "object") return null;
  const queue = [workflow];
  const seen = new Set();
  while (queue.length) {
    const graph = queue.shift();
    if (!graph || typeof graph !== "object" || seen.has(graph)) continue;
    seen.add(graph);
    for (const node of Array.isArray(graph.nodes) ? graph.nodes : []) {
      if (String(node?.type || node?.comfyClass || "") === "H3StudioDirector") {
        const property = node?.properties?.h3studio_state;
        const decoded = stateCandidate(property);
        if (decoded) return decoded;
      }
    }
    for (const subgraph of graph?.definitions?.subgraphs || []) queue.push(subgraph);
  }
  return null;
}

function findDirectorStateInPrompt(prompt) {
  if (!prompt || typeof prompt !== "object") return null;
  for (const node of Object.values(prompt)) {
    if (String(node?.class_type || "") !== "H3StudioDirector") continue;
    const decoded = stateCandidate(node?.inputs?.studio_state);
    if (decoded) return decoded;
  }
  return null;
}

function clone(value) {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

export function studioMetadataFromChunks(chunks) {
  const h3studio = json(chunks?.h3studio);
  const workflow = json(chunks?.workflow);
  const prompt = json(chunks?.prompt);
  const direct = h3studio?.state && typeof h3studio.state === "object" ? h3studio.state : null;
  const state = direct || findDirectorStateInWorkflow(workflow) || findDirectorStateInPrompt(prompt);
  if (!state) {
    throw new Error("PNG is valid, but it does not contain restorable H3 Studio Director state.");
  }
  return {
    state: clone(state),
    h3studio: h3studio && typeof h3studio === "object" ? h3studio : {},
    workflow,
    prompt,
    chunks,
  };
}

export async function fetchStudioPngMetadata(url) {
  const response = await fetch(url, { cache: "no-cache" });
  if (!response.ok) {
    if (response.status === 404) throw new Error("Original metadata PNG is not installed.");
    throw new Error(`Could not read demo PNG metadata (HTTP ${response.status}).`);
  }
  const chunks = await readPngTextChunks(await response.arrayBuffer());
  return studioMetadataFromChunks(chunks);
}

export function generationBadge(metadata) {
  const state = metadata?.state || {};
  const generation = state.generation || {};
  const exactWidth = Number(metadata?.h3studio?.width);
  const exactHeight = Number(metadata?.h3studio?.height);
  const aspect = String(generation.aspect_ratio || "custom");
  const profile = String(metadata?.h3studio?.sampling_profile || generation.sampling_profile || "unknown");
  const seed = Number(metadata?.h3studio?.seed ?? generation.seed);
  const resolution = exactWidth > 0 && exactHeight > 0
    ? `${Math.round(exactWidth)}×${Math.round(exactHeight)}`
    : `${Number(generation.megapixels || 0).toFixed(2)} MP`;
  return {
    aspect,
    resolution,
    profile,
    seed: Number.isSafeInteger(seed) && seed >= 0 ? seed : null,
    route: String(metadata?.h3studio?.resolved_route || generation.route || "auto"),
  };
}

export function shortSamplingLabel(profile) {
  const value = String(profile || "");
  if (value === "lightx_v1_fl2v_8") return "LightX 8";
  if (value.includes("lightx") && value.includes("8")) return "LightX 8";
  if (value.includes("lightx") && value.includes("4")) return "LightX 4";
  if (value.includes("pdd") && value.includes("900")) return "PDD 900";
  if (value.includes("pdd") && value.includes("600")) return "PDD 600";
  if (value.includes("quality_20")) return "Base 20";
  if (value.includes("balanced_12")) return "Base 12";
  return value || "Unknown";
}
