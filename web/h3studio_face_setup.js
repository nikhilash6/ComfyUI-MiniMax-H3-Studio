import { app } from "../../scripts/app.js";

const TARGET = "H3StudioModelSetup";
const IMPACT_SUBPACK_REPO = "https://github.com/ltdrdata/ComfyUI-Impact-Subpack.git";
const IMPACT_PACK_REPO = "https://github.com/ltdrdata/ComfyUI-Impact-Pack.git";

const FACE_ASSETS = {
  yolo: {
    id: "h3_face_yolov8m",
    provider: "huggingface",
    filename: "face_yolov8m.pt",
    destination: "ultralytics/bbox",
    download_url: "https://huggingface.co/Bingsu/adetailer/resolve/main/face_yolov8m.pt?download=true",
    source_url: "https://huggingface.co/Bingsu/adetailer/blob/main/face_yolov8m.pt",
  },
  sam: {
    id: "h3_sam_vit_b",
    provider: "meta",
    filename: "sam_vit_b_01ec64.pth",
    destination: "sams",
    download_url: "https://dl.fbaipublicfiles.com/segment_anything/sam_vit_b_01ec64.pth",
    source_url: "https://github.com/facebookresearch/segment-anything#model-checkpoints",
  },
};

function jsonFetch(path, options = {}) {
  return fetch(path, options).then(async (response) => {
    let data = null;
    try { data = await response.json(); } catch { data = null; }
    if (!response.ok || data?.ok === false) {
      throw Object.assign(new Error(data?.error || `HTTP ${response.status}`), { status: response.status });
    }
    return data;
  });
}

function postJson(path, payload) {
  return jsonFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

function pluginFlags(payload) {
  const text = JSON.stringify(payload || {}).toLowerCase();
  return {
    impactSubpack: text.includes("comfyui-impact-subpack") || text.includes("impact-subpack"),
    impactPack: text.includes("comfyui-impact-pack") || text.includes("impact-pack"),
  };
}

async function installedPlugins() {
  try {
    const response = await fetch("/customnode/installed?mode=default");
    if (!response.ok) return { manager: false, impactSubpack: false, impactPack: false };
    const data = await response.json();
    return { manager: true, ...pluginFlags(data) };
  } catch {
    return { manager: false, impactSubpack: false, impactPack: false };
  }
}

async function uadStatus() {
  try {
    return await jsonFetch("/uad/status");
  } catch {
    return null;
  }
}

async function analyzeYolo() {
  try {
    const result = await postJson("/uad/analyze-fast", { url: FACE_ASSETS.yolo.download_url });
    const found = (result.assets || []).find((item) => item.filename === FACE_ASSETS.yolo.filename) || (result.assets || [])[0];
    return found ? { ...found, ...FACE_ASSETS.yolo, provider: "huggingface" } : { ...FACE_ASSETS.yolo };
  } catch {
    return { ...FACE_ASSETS.yolo };
  }
}

async function verifyAssets() {
  const yolo = await analyzeYolo();
  const items = [yolo, FACE_ASSETS.sam];
  const result = await postJson("/uad/verify-fast", { items });
  return {
    yolo: result.results?.[0] || null,
    sam: result.results?.[1] || null,
  };
}

async function managerInstall(url, label) {
  if (!window.confirm(`Install ${label} with ComfyUI-Manager? ComfyUI must be restarted afterward.`)) return false;
  const response = await fetch("/customnode/install/git_url", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: url,
  });
  const text = await response.text();
  if (!response.ok) {
    const error = new Error(text || `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return true;
}

function statusWord(check) {
  if (!check) return "not checked";
  if (check.ok) return "installed";
  if (check.status === "missing") return "missing";
  return check.status || "attention";
}

function statusClass(check) {
  if (check?.ok) return "ok";
  if (!check || check?.status === "missing") return "wait";
  return "bad";
}

function assetRow(asset, check, { optional = false } = {}) {
  const row = document.createElement("div");
  row.className = "h3ms-row";
  row.style.gridTemplateColumns = "minmax(0,1fr) auto";
  const copy = document.createElement("div");
  const name = document.createElement("a");
  name.className = "h3ms-name";
  name.href = asset.source_url;
  name.target = "_blank";
  name.rel = "noopener noreferrer";
  name.textContent = `${asset.filename} ↗`;
  const meta = document.createElement("div");
  meta.className = "h3ms-meta";
  meta.innerHTML = `<span class="h3ms-chip">models/${asset.destination}</span><span class="h3ms-chip ${optional ? "" : "recommended"}">${optional ? "optional" : "recommended"}</span>`;
  copy.append(name, meta);
  if (check?.path) {
    const path = document.createElement("div");
    path.className = "h3ms-path";
    path.textContent = check.path;
    copy.append(path);
  }
  const status = document.createElement("div");
  status.className = `h3ms-status ${statusClass(check)}`;
  status.textContent = statusWord(check);
  row.append(copy, status);
  return row;
}

async function installAsset(node, key, log) {
  const asset = key === "yolo" ? await analyzeYolo() : { ...FACE_ASSETS.sam };
  log.textContent = `Installing ${asset.filename} atomically through UAD…`;
  try {
    await postJson("/uad/install", {
      items: [asset],
      node_id: String(node.id),
      force: false,
    });
    log.textContent = `${asset.filename} installed. Rechecking Face Refine setup…`;
    return true;
  } catch (error) {
    if (/unsupported destination|provider 'meta'|provider meta/i.test(String(error.message || error))) {
      throw new Error("Your UAD build is too old for Face Refine assets. Update Universal Asset Downloader, restart ComfyUI, then retry.");
    }
    throw error;
  }
}

async function buildCard(node) {
  const card = document.createElement("section");
  card.className = "h3ms-group recommended h3ms-face-refine-card";
  card.dataset.faceSetup = "1";
  card.innerHTML = `
    <div class="h3ms-group-head">
      <div>
        <div class="h3ms-group-title">Face Refine · small & distant faces</div>
        <div class="h3ms-group-sub">YOLOv8-Face is the recommended detector. SAM is optional: Auto works without it and falls back to a detector-anchored feather mask.</div>
      </div>
      <div class="h3ms-group-count" data-face-summary>checking…</div>
    </div>
    <div data-face-assets></div>
    <div class="h3ms-card" style="margin:8px 0 0">
      <b>How it works</b>
      <div class="h3ms-note">Default path: YOLO detects tiny faces → H3 rerenders only the selected final still at a larger crop → source-latent low-denoise img2img → feathered blend. Optional SAM replaces the feather mask with a true face-shaped segmentation mask when Impact Pack + a SAM checkpoint are available.</div>
      <div class="h3ms-actions" style="margin-top:8px" data-face-actions></div>
      <div class="h3ms-note" data-face-plugin-status></div>
      <div class="h3ms-log" style="min-height:28px;margin-top:7px" data-face-log>Checking detector and mask assets…</div>
    </div>`;

  const assetsRoot = card.querySelector("[data-face-assets]");
  const actions = card.querySelector("[data-face-actions]");
  const pluginStatus = card.querySelector("[data-face-plugin-status]");
  const summary = card.querySelector("[data-face-summary]");
  const log = card.querySelector("[data-face-log]");

  async function refresh() {
    const [uad, plugins] = await Promise.all([uadStatus(), installedPlugins()]);
    let checks = { yolo: null, sam: null };
    if (uad?.capabilities?.verify_fast) {
      try {
        checks = await verifyAssets();
      } catch (error) {
        log.textContent = /unsupported destination/i.test(String(error.message || error))
          ? "UAD is connected but needs an update before it can manage Face Refine model folders."
          : `Face asset verification failed: ${error.message || error}`;
      }
    }

    assetsRoot.replaceChildren(
      assetRow(FACE_ASSETS.yolo, checks.yolo, { optional: false }),
      assetRow(FACE_ASSETS.sam, checks.sam, { optional: true }),
    );
    actions.replaceChildren();

    const button = (text, handler, disabled = false) => {
      const el = document.createElement("button");
      el.className = "h3ms-btn";
      el.type = "button";
      el.textContent = text;
      el.disabled = disabled;
      el.addEventListener("click", handler);
      return el;
    };

    actions.append(
      button(checks.yolo?.ok ? "YOLO installed ✓" : "Install YOLO model", async () => {
        try { await installAsset(node, "yolo", log); await refresh(); }
        catch (error) { log.textContent = `YOLO install failed: ${error.message || error}`; }
      }, !uad?.capabilities?.install || checks.yolo?.ok),
      button(checks.sam?.ok ? "SAM model installed ✓" : "Install SAM model · optional", async () => {
        try { await installAsset(node, "sam", log); await refresh(); }
        catch (error) { log.textContent = `SAM install failed: ${error.message || error}`; }
      }, !uad?.capabilities?.install || checks.sam?.ok),
    );

    if (plugins.manager) {
      actions.append(
        button(plugins.impactSubpack ? "Impact Subpack installed ✓" : "Install Impact Subpack", async () => {
          try {
            if (await managerInstall(IMPACT_SUBPACK_REPO, "Impact Subpack")) log.textContent = "Impact Subpack installed. Restart ComfyUI before using the YOLO provider.";
          } catch (error) {
            log.textContent = error.status === 403 ? "Manager security policy blocked automatic plugin installation. Install Impact Subpack from Manager manually." : `Impact Subpack install failed: ${error.message || error}`;
          }
        }, plugins.impactSubpack),
        button(plugins.impactPack ? "Impact Pack installed ✓" : "Install Impact Pack · SAM only", async () => {
          try {
            if (await managerInstall(IMPACT_PACK_REPO, "Impact Pack")) log.textContent = "Impact Pack installed. Restart ComfyUI before enabling SAM masks.";
          } catch (error) {
            log.textContent = error.status === 403 ? "Manager security policy blocked automatic plugin installation. Install Impact Pack from Manager manually." : `Impact Pack install failed: ${error.message || error}`;
          }
        }, plugins.impactPack),
      );
    }

    const yoloReady = Boolean(checks.yolo?.ok);
    const samReady = Boolean(checks.sam?.ok && plugins.impactPack);
    summary.textContent = samReady ? "YOLO + SAM ready" : yoloReady ? "YOLO ready · SAM optional" : "detector setup needed";
    pluginStatus.textContent = `Detector backend: ${plugins.impactSubpack ? "Impact Subpack YOLO ready after restart" : "Impact Subpack not detected; H3 Studio can still use a local ultralytics install if present"}. SAM backend: ${plugins.impactPack ? "Impact Pack detected" : "Impact Pack not detected"}.`;
    if (!uad?.capabilities?.install) {
      log.textContent = "UAD is required for one-click model installs. Face Refine itself still works with already-installed assets.";
    } else if (!log.textContent || log.textContent.startsWith("Checking")) {
      log.textContent = yoloReady
        ? (samReady ? "Face Refine quality path is fully ready." : "Face Refine is ready. SAM is optional; the default feather mask is already usable.")
        : "Install face_yolov8m.pt for the best distant-face detector. SAM can be added later if you want segmented masks.";
    }
  }

  await refresh();
  return card;
}

function watchNode(node) {
  if (!node || node.__h3studioFaceSetupWatcher) return;
  node.__h3studioFaceSetupWatcher = true;

  const attach = async () => {
    const setup = node.__h3ModelSetup;
    const root = setup?.root;
    if (!root?.isConnected) {
      setTimeout(attach, 100);
      return;
    }
    if (!root.querySelector(".h3ms-face-refine-card")) {
      root.append(await buildCard(node));
    }
    if (!node.__h3studioFaceSetupObserver) {
      const observer = new MutationObserver(() => {
        if (!root.querySelector(".h3ms-face-refine-card")) {
          queueMicrotask(async () => {
            if (!root.querySelector(".h3ms-face-refine-card")) root.append(await buildCard(node));
          });
        }
      });
      observer.observe(root, { childList: true });
      node.__h3studioFaceSetupObserver = observer;
    }
  };
  setTimeout(attach, 0);
}

app.registerExtension({
  name: "H3Studio.FaceRefineSetup",
  async nodeCreated(node) {
    if (String(node?.comfyClass || node?.type || "") === TARGET) watchNode(node);
  },
});

export { FACE_ASSETS, pluginFlags, statusWord };
