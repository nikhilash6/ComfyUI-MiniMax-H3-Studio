"""ComfyUI registration surface."""

from __future__ import annotations

from .nodes.director import H3StudioCondition, H3StudioContextInspector, H3StudioDirector, H3StudioOutput
from .nodes.image_runtime import NODE_CLASS_MAPPINGS as IMAGE_NODE_CLASS_MAPPINGS
from .nodes.image_runtime import NODE_DISPLAY_NAME_MAPPINGS as IMAGE_NODE_DISPLAY_NAME_MAPPINGS
from .nodes.loader import H3StudioLoader

NODE_CLASS_MAPPINGS = {
    "H3StudioLoader": H3StudioLoader,
    "H3StudioDirector": H3StudioDirector,
    "H3StudioCondition": H3StudioCondition,
    "H3StudioOutput": H3StudioOutput,
    "H3StudioContextInspector": H3StudioContextInspector,
    **IMAGE_NODE_CLASS_MAPPINGS,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "H3StudioLoader": "H3 Studio · Model Loader",
    "H3StudioDirector": "H3 Studio · Image Director",
    "H3StudioCondition": "H3 Studio · Condition & Route",
    "H3StudioOutput": "H3 Studio · Unpack Generation",
    "H3StudioContextInspector": "H3 Studio · Context Inspector",
    **IMAGE_NODE_DISPLAY_NAME_MAPPINGS,
}

