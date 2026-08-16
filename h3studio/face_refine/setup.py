"""Idempotent installer and readiness verification service for H3 Face Refine."""

from __future__ import annotations

import logging
import os
import subprocess
import sys
import urllib.request
from pathlib import Path
from typing import Any

LOGGER = logging.getLogger(__name__)

IMPACT_SUBPACK_REPO = "https://github.com/ltdrdata/ComfyUI-Impact-Subpack.git"
IMPACT_SUBPACK_DIRNAME = "ComfyUI-Impact-Subpack"
IMPACT_PACK_REPO = "https://github.com/ltdrdata/ComfyUI-Impact-Pack.git"
IMPACT_PACK_DIRNAME = "ComfyUI-Impact-Pack"

YOLO_DOWNLOAD_URL = "https://huggingface.co/Bingsu/adetailer/resolve/main/face_yolov8m.pt"
SAM_DOWNLOAD_URL = "https://dl.fbaipublicfiles.com/segment_anything/sam_vit_b_01ec64.pth"

YOLO_PREFERENCE = (
    "face_yolov8m.pt",
    "face_yolov8s.pt",
    "face_yolov8n.pt",
    "yolov8m-face.pt",
    "yolov8s-face.pt",
    "yolov8n-face.pt",
)


def _run(args: list[str], cwd: Path | None = None, timeout: int = 240) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        args,
        cwd=str(cwd) if cwd else None,
        check=False,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        timeout=timeout,
        env={**os.environ, "GIT_TERMINAL_PROMPT": "0"},
    )


def _comfy_root() -> Path:
    try:
        import folder_paths

        root = getattr(folder_paths, "base_path", None)
        if root:
            return Path(root).resolve()
        models_dir = getattr(folder_paths, "models_dir", None)
        if models_dir:
            return Path(models_dir).resolve().parent
    except Exception:
        pass
    return Path.cwd().resolve()


def _custom_nodes_path() -> Path:
    return _comfy_root() / "custom_nodes"


def _models_path() -> Path:
    try:
        import folder_paths

        models_dir = getattr(folder_paths, "models_dir", None)
        if models_dir:
            return Path(models_dir).resolve()
    except Exception:
        pass
    return _comfy_root() / "models"


def _check_ultralytics_pip() -> bool:
    try:
        import ultralytics  # noqa: F401
        return True
    except ImportError:
        pass
    res = _run([sys.executable, "-c", "import ultralytics; print('ok')"], timeout=10)
    return res.returncode == 0 and "ok" in res.stdout


def _find_yolo_model_path() -> Path | None:
    models_dir = _models_path()
    candidates: list[Path] = []
    try:
        import folder_paths

        if "ultralytics_bbox" in getattr(folder_paths, "folder_names_and_paths", {}):
            for name in folder_paths.get_filename_list("ultralytics_bbox"):
                path = folder_paths.get_full_path("ultralytics_bbox", name)
                if path and os.path.isfile(path):
                    candidates.append(Path(path))
    except Exception:
        pass

    search_dirs = [
        models_dir / "ultralytics" / "bbox",
        models_dir / "ultralytics",
        models_dir / "face_detection",
        models_dir / "bbox",
    ]
    for root in search_dirs:
        for name in YOLO_PREFERENCE:
            cand = root / name
            if cand.is_file() and cand.stat().st_size > 1024 * 1024:
                candidates.append(cand)

    return candidates[0] if candidates else None


def _find_sam_model_path() -> Path | None:
    models_dir = _models_path()
    candidates: list[Path] = []
    try:
        import folder_paths

        if "sams" in getattr(folder_paths, "folder_names_and_paths", {}):
            for name in folder_paths.get_filename_list("sams"):
                path = folder_paths.get_full_path("sams", name)
                if path and os.path.isfile(path):
                    candidates.append(Path(path))
    except Exception:
        pass

    search_dirs = [
        models_dir / "sams",
        models_dir / "sam",
    ]
    sam_names = ("sam_vit_b_01ec64.pth", "sam_vit_l_0b3195.pth", "sam_vit_h_4b8939.pth")
    for root in search_dirs:
        for name in sam_names:
            cand = root / name
            if cand.is_file() and cand.stat().st_size > 1024 * 1024:
                candidates.append(cand)

    return candidates[0] if candidates else None


def get_face_refine_readiness() -> dict[str, Any]:
    custom_nodes = _custom_nodes_path()
    subpack_dir = custom_nodes / IMPACT_SUBPACK_DIRNAME
    pack_dir = custom_nodes / IMPACT_PACK_DIRNAME

    impact_subpack_installed = subpack_dir.is_dir()
    impact_pack_installed = pack_dir.is_dir()
    ultralytics_pip_installed = _check_ultralytics_pip()

    yolo_model_path = _find_yolo_model_path()
    sam_model_path = _find_sam_model_path()

    yolo_backend_available = impact_subpack_installed or ultralytics_pip_installed
    yolo_model_available = yolo_model_path is not None
    yolo_ready = yolo_backend_available and yolo_model_available

    sam_backend_available = impact_pack_installed
    sam_model_available = sam_model_path is not None
    sam_ready = sam_backend_available and sam_model_available

    return {
        "ok": True,
        "yolo_backend": {
            "impact_subpack": impact_subpack_installed,
            "ultralytics_pip": ultralytics_pip_installed,
            "available": yolo_backend_available,
            "detail": (
                "Impact Subpack + python ultralytics ready"
                if (impact_subpack_installed and ultralytics_pip_installed)
                else "Impact Subpack installed"
                if impact_subpack_installed
                else "python ultralytics installed"
                if ultralytics_pip_installed
                else "No YOLO detector backend (needs Impact Subpack or python ultralytics)"
            ),
        },
        "yolo_model": {
            "installed": yolo_model_available,
            "path": str(yolo_model_path) if yolo_model_path else None,
            "filename": "face_yolov8m.pt",
            "destination": "models/ultralytics/bbox",
        },
        "yolo_ready": yolo_ready,
        "sam_backend": {
            "impact_pack": impact_pack_installed,
            "available": sam_backend_available,
            "detail": "Impact Pack installed" if impact_pack_installed else "Impact Pack not installed (SAM is optional)",
        },
        "sam_model": {
            "installed": sam_model_available,
            "path": str(sam_model_path) if sam_model_path else None,
            "filename": "sam_vit_b_01ec64.pth",
            "destination": "models/sams",
        },
        "sam_ready": sam_ready,
        "overall_ready": yolo_ready,
    }


def _download_file(url: str, dest_path: Path, label: str) -> None:
    dest_path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = dest_path.with_name(f"{dest_path.name}.tmp_{os.getpid()}")
    try:
        LOGGER.info("[H3 Studio FaceSetup] Downloading %s from %s to %s", label, url, dest_path)
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) ComfyUI-MiniMax-H3-Studio"},
        )
        with urllib.request.urlopen(req, timeout=300) as response, open(temp_path, "wb") as out_file:
            while True:
                chunk = response.read(1024 * 1024)
                if not chunk:
                    break
                out_file.write(chunk)
        if temp_path.stat().st_size < 1024 * 10:
            raise RuntimeError(f"Downloaded file {label} is too small; download may have failed.")
        temp_path.replace(dest_path)
        LOGGER.info('[H3 Studio FaceSetup] Successfully downloaded %s', dest_path)
    except Exception:
        if temp_path.exists():
            temp_path.unlink(missing_ok=True)
        raise


def _install_git_custom_node(repo_url: str, dirname: str, actions: list[str]) -> bool:
    custom_nodes = _custom_nodes_path()
    custom_nodes.mkdir(parents=True, exist_ok=True)
    target = custom_nodes / dirname

    if target.exists():
        if not (target / ".git").exists():
            actions.append(f"{dirname} exists (skipped git update: not a git repo).")
            return False
        fetch = _run(["git", "fetch", "origin"], target, timeout=60)
        if fetch.returncode == 0:
            pull = _run(["git", "merge", "--ff-only"], target, timeout=60)
            if pull.returncode == 0 and "Already up to date" not in pull.stdout:
                actions.append(f"Updated {dirname} to latest commit.")
                return True
            actions.append(f"{dirname} already up to date.")
            return False
        actions.append(f"{dirname} already installed.")
        return False

    actions.append(f"Cloning {dirname} from {repo_url}…")
    clone = _run(["git", "clone", "--filter=blob:none", repo_url, str(target)], custom_nodes, timeout=180)
    if clone.returncode != 0:
        raise RuntimeError(f"Failed to clone {dirname}: {clone.stdout.strip()}")
    actions.append(f"Successfully installed {dirname}.")
    return True


def _pip_install_ultralytics(actions: list[str]) -> bool:
    if _check_ultralytics_pip():
        actions.append("ultralytics python package is already installed and importable.")
        return False
    actions.append("Installing ultralytics into ComfyUI python environment via pip…")
    res = _run([sys.executable, "-m", "pip", "install", "ultralytics"], timeout=300)
    if res.returncode != 0:
        raise RuntimeError(f"pip install ultralytics failed: {res.stdout.strip()}")
    if not _check_ultralytics_pip():
        raise RuntimeError("pip install ultralytics completed but 'import ultralytics' still fails.")
    actions.append("Successfully installed and verified ultralytics python package.")
    return True


def install_face_refine(
    *,
    install_yolo: bool = True,
    install_subpack: bool = True,
    install_pip_ultralytics: bool = True,
    install_sam: bool = False,
) -> dict[str, Any]:
    actions: list[str] = []
    restart_required = False
    models_dir = _models_path()

    if install_yolo:
        yolo_path = _find_yolo_model_path()
        if yolo_path:
            actions.append(f"YOLO face model already present: {yolo_path.name} in {yolo_path.parent.name}")
        else:
            dest = models_dir / "ultralytics" / "bbox" / "face_yolov8m.pt"
            actions.append("Downloading face_yolov8m.pt (49.6 MB) into models/ultralytics/bbox/…")
            _download_file(YOLO_DOWNLOAD_URL, dest, "face_yolov8m.pt")
            actions.append("Successfully downloaded face_yolov8m.pt.")

        if install_subpack:
            try:
                if _install_git_custom_node(IMPACT_SUBPACK_REPO, IMPACT_SUBPACK_DIRNAME, actions):
                    restart_required = True
            except Exception as exc:
                actions.append(f"Warning: Impact Subpack git clone failed ({exc}). Falling back to python ultralytics.")

        if install_pip_ultralytics:
            try:
                _pip_install_ultralytics(actions)
            except Exception as exc:
                actions.append(f"Warning: pip install ultralytics failed ({exc}).")

    if install_sam:
        sam_path = _find_sam_model_path()
        if sam_path:
            actions.append(f"SAM model already present: {sam_path.name}")
        else:
            dest = models_dir / "sams" / "sam_vit_b_01ec64.pth"
            actions.append("Downloading sam_vit_b_01ec64.pth (375 MB) into models/sams/…")
            _download_file(SAM_DOWNLOAD_URL, dest, "sam_vit_b_01ec64.pth")
            actions.append("Successfully downloaded sam_vit_b_01ec64.pth.")

        try:
            if _install_git_custom_node(IMPACT_PACK_REPO, IMPACT_PACK_DIRNAME, actions):
                restart_required = True
        except Exception as exc:
            actions.append(f"Warning: Impact Pack git clone failed ({exc}).")

    readiness = get_face_refine_readiness()
    return {
        "ok": True,
        "actions": actions,
        "readiness": readiness,
        "restart_required": restart_required,
    }


def register_face_setup_routes() -> None:
    try:
        from aiohttp import web
        from server import PromptServer
    except ImportError:
        return
    server = getattr(PromptServer, "instance", None)
    if server is None or getattr(server, "_h3studio_face_setup_routes_registered", False):
        return
    server._h3studio_face_setup_routes_registered = True

    routes = getattr(server, "routes", None)
    if routes is None:
        return

    @routes.get("/h3studio/face-refine/status")
    async def handle_status(_request: web.Request) -> web.Response:
        try:
            status = get_face_refine_readiness()
            return web.json_response(status)
        except Exception as exc:
            LOGGER.warning("[H3 Studio FaceSetup] Status check failed: %s", exc)
            return web.json_response({"ok": False, "error": str(exc)}, status=500)

    @routes.post("/h3studio/face-refine/install")
    async def handle_install(request: web.Request) -> web.Response:
        try:
            payload = await request.json() if request.can_read_body else {}
        except Exception:
            payload = {}
        try:
            install_yolo = bool(payload.get("install_yolo", True))
            install_subpack = bool(payload.get("install_subpack", True))
            install_pip_ultralytics = bool(payload.get("install_pip_ultralytics", True))
            install_sam = bool(payload.get("install_sam", False))
            result = install_face_refine(
                install_yolo=install_yolo,
                install_subpack=install_subpack,
                install_pip_ultralytics=install_pip_ultralytics,
                install_sam=install_sam,
            )
            return web.json_response(result)
        except Exception as exc:
            LOGGER.error("[H3 Studio FaceSetup] Installation failed: %s", exc, exc_info=True)
            return web.json_response({"ok": False, "error": str(exc)}, status=500)
