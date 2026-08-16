"""ComfyUI entry point for MiniMax H3 Studio."""

# Pytest imports a repository-level ``__init__.py`` as a standalone collection
# module. ComfyUI imports it as a real package, where relative imports are valid.
if __package__:
    from .h3studio.extension import NODE_CLASS_MAPPINGS, NODE_DISPLAY_NAME_MAPPINGS
    # Install after extension registration so this final runtime policy can see
    # the completed analyzer/writer wrapper chain. The external Qwen3.5 GGUF
    # helper then stays warm across one Director pass without globally evicting
    # H3, and is released exactly once before downstream conditioning.
    from .h3studio.prompt_prep_residency_fast import install as install_prompt_prep_residency_fast

    install_prompt_prep_residency_fast()
else:  # pragma: no cover - collection shim, not the ComfyUI execution path
    NODE_CLASS_MAPPINGS = {}
    NODE_DISPLAY_NAME_MAPPINGS = {}

WEB_DIRECTORY = "./web"

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
