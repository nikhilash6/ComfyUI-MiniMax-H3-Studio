"""ComfyUI core/companion-package compatibility diagnostics for H3 Studio."""

from __future__ import annotations

from importlib import metadata
from pathlib import Path
from typing import Any

WATCHED_PACKAGES = (
    "comfyui-frontend-package",
    "comfyui-workflow-templates",
    "comfy-kitchen",
)


def _comfy_root() -> Path:
    try:
        import folder_paths

        root = getattr(folder_paths, "base_path", None)
        if root:
            return Path(root).resolve()
        return Path(folder_paths.__file__).resolve().parent
    except Exception:
        return Path.cwd()


def _required_specs() -> dict[str, str]:
    requirements = _comfy_root() / "requirements.txt"
    if not requirements.is_file():
        return {}
    wanted = {name.casefold(): name for name in WATCHED_PACKAGES}
    result: dict[str, str] = {}
    for raw in requirements.read_text(encoding="utf-8", errors="replace").splitlines():
        line = raw.split("#", 1)[0].strip()
        if not line:
            continue
        try:
            from packaging.requirements import Requirement

            requirement = Requirement(line)
        except Exception:
            continue
        key = requirement.name.casefold()
        canonical = wanted.get(key)
        if canonical:
            result[canonical] = str(requirement.specifier)
    return result


def _exact_required_version(required: str):
    """Return Version for a simple exact == pin, otherwise None."""

    if not required:
        return None
    try:
        from packaging.specifiers import SpecifierSet
        from packaging.version import Version

        specifiers = list(SpecifierSet(required))
        if len(specifiers) != 1:
            return None
        specifier = specifiers[0]
        if specifier.operator not in {"==", "==="} or "*" in specifier.version:
            return None
        return Version(specifier.version)
    except Exception:
        return None


def _package_status(name: str, required: str) -> dict[str, Any]:
    installed = ""
    try:
        installed = metadata.version(name)
    except metadata.PackageNotFoundError:
        pass

    ok = bool(installed)
    relation = "match" if installed else "missing"
    if installed and required:
        try:
            from packaging.specifiers import SpecifierSet
            from packaging.version import Version

            installed_version = Version(installed)
            ok = installed_version in SpecifierSet(required)
            if ok:
                relation = "match"
            else:
                exact = _exact_required_version(required)
                if exact is not None:
                    relation = "ahead" if installed_version > exact else "behind"
                else:
                    relation = "mismatch"
        except Exception:
            ok = False
            relation = "mismatch"

    return {
        "name": name,
        "installed": installed or None,
        "required": required or None,
        "ok": bool(ok),
        "relation": relation,
        "importance": (
            "runtime" if name == "comfy-kitchen"
            else "frontend" if name == "comfyui-frontend-package"
            else "workflow"
        ),
    }


def compatibility_status() -> dict[str, Any]:
    specs = _required_specs()
    packages = [
        _package_status(name, specs.get(name, ""))
        for name in WATCHED_PACKAGES
    ]

    core_version = "unknown"
    try:
        import comfyui_version

        core_version = str(comfyui_version.__version__)
    except Exception:
        pass

    issues = [item for item in packages if not item["ok"]]
    critical = [item for item in issues if item["importance"] in {"runtime", "frontend"}]
    relations = {str(item.get("relation") or "mismatch") for item in issues}
    if not issues:
        diagnosis = "aligned"
    elif relations == {"ahead"}:
        diagnosis = "companions_ahead"
    elif relations <= {"behind", "missing"}:
        diagnosis = "companions_behind"
    else:
        diagnosis = "mixed_mismatch"

    return {
        "ok": not issues,
        "core_version": core_version,
        "requirements_file": str(_comfy_root() / "requirements.txt"),
        "packages": packages,
        "issues": issues,
        "critical": bool(critical),
        "diagnosis": diagnosis,
    }


def register_routes() -> None:
    try:
        from aiohttp import web
        from server import PromptServer
    except ImportError:
        return

    server = getattr(PromptServer, "instance", None)
    if server is None or getattr(server, "_h3studio_comfy_compat_routes_registered", False):
        return
    server._h3studio_comfy_compat_routes_registered = True

    @server.routes.get("/h3studio/comfy-compat")
    async def h3studio_comfy_compat(_request):
        try:
            return web.json_response(compatibility_status(), headers={"Cache-Control": "no-store"})
        except Exception as exc:
            return web.json_response(
                {"ok": False, "critical": True, "error": f"{type(exc).__name__}: {exc}"},
                status=500,
                headers={"Cache-Control": "no-store"},
            )


__all__ = ["WATCHED_PACKAGES", "compatibility_status", "register_routes"]
