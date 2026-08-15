"""ComfyUI pre-start hook for H3 Studio compatibility safeguards."""

import sys
from pathlib import Path

root = Path(__file__).resolve().parent
inserted = str(root) not in sys.path
if inserted:
    sys.path.insert(0, str(root))
try:
    from h3studio.startup_compat import quarantine_conflicting_frontends

    quarantine_conflicting_frontends(root)
except Exception as error:
    print(f"[H3 Studio] Pre-start compatibility guard unavailable; standard ComfyUI paths remain active: {error}")
finally:
    if inserted:
        sys.path.remove(str(root))
