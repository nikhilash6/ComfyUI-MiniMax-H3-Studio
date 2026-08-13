"""ComfyUI pre-start hook for the measured Lightning RAM-cache path.

Non-Lightning hosts return immediately and retain normal ComfyUI behavior.
"""

import sys
from pathlib import Path

root = Path(__file__).resolve().parent
inserted = str(root) not in sys.path
if inserted:
    sys.path.insert(0, str(root))
try:
    from h3studio.lightning_ram_cache import run_startup

    run_startup(root)
except Exception as error:
    print(f"[H3 RAM] Startup cache unavailable; standard ComfyUI paths remain active: {error}")
finally:
    if inserted:
        sys.path.remove(str(root))
