"""ComfyUI entry point for MiniMax H3 Studio."""

# Pytest imports a repository-level ``__init__.py`` as a standalone collection
# module. ComfyUI imports it as a real package, where relative imports are valid.
if __package__:
    from .h3studio.extension import NODE_CLASS_MAPPINGS, NODE_DISPLAY_NAME_MAPPINGS
    from .h3studio.smart_benchmark_compat import install as install_smart_benchmark_compat

    # Install after extension.py so this final guard wraps the restored unified
    # Smart Benchmark schema and accepts stale alpha workflow values before
    # ComfyUI prompt validation rejects them.
    install_smart_benchmark_compat()
else:  # pragma: no cover - collection shim, not the ComfyUI execution path
    NODE_CLASS_MAPPINGS = {}
    NODE_DISPLAY_NAME_MAPPINGS = {}

WEB_DIRECTORY = "./web"

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
