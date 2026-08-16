"""Fast single-record lookup for History restore.

The searchable history library already stores the complete Director state in
SQLite. Restoring a card should read that tiny JSON record instead of fetching
and parsing the full generated PNG on every click.
"""

from __future__ import annotations

from .history_library import _LOCK, _canonical_url, _connect, _row_payload


def register_fast_history_restore_route() -> None:
    try:
        from aiohttp import web
        from server import PromptServer
    except ImportError:
        return

    server = getattr(PromptServer, "instance", None)
    if server is None or getattr(server, "_h3studio_fast_history_restore_registered", False):
        return
    server._h3studio_fast_history_restore_registered = True

    @server.routes.get("/h3studio/history/item")
    async def h3studio_history_item(request):
        query = request.rel_url.query
        item_id = str(query.get("id", "")).strip()
        url = _canonical_url(query.get("url", ""))
        if not item_id and not url:
            return web.json_response({"ok": False, "error": "Missing history id or url."}, status=400)

        with _LOCK, _connect() as connection:
            row = None
            if url:
                row = connection.execute(
                    "SELECT * FROM generations WHERE url = ? LIMIT 1",
                    (url,),
                ).fetchone()
            if row is None and item_id:
                row = connection.execute(
                    "SELECT * FROM generations WHERE id = ? LIMIT 1",
                    (item_id,),
                ).fetchone()

        if row is None:
            return web.json_response({"ok": False, "error": "History item not found."}, status=404)
        return web.json_response({"ok": True, "item": _row_payload(row)})


__all__ = ["register_fast_history_restore_route"]
