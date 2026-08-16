"""Persistent searchable H3 Studio generation history.

Generated PNG metadata remains the source of truth.  This module only keeps a
small SQLite index in ComfyUI's user directory so history survives browser
profiles and can be searched/favorited without duplicating image files.
"""

from __future__ import annotations

import hashlib
import json
import sqlite3
import threading
import time
from pathlib import Path
from typing import Any
from urllib.parse import urlencode

_LOCK = threading.RLock()
_SCHEMA = """
CREATE TABLE IF NOT EXISTS generations (
    id TEXT PRIMARY KEY,
    url TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    prompt TEXT NOT NULL DEFAULT '',
    seed INTEGER,
    megapixels REAL,
    aspect_ratio TEXT NOT NULL DEFAULT '',
    sampling_profile TEXT NOT NULL DEFAULT '',
    ref_count INTEGER NOT NULL DEFAULT 0,
    favorite INTEGER NOT NULL DEFAULT 0,
    state_json TEXT NOT NULL DEFAULT '{}',
    sampling_seconds REAL,
    total_seconds REAL,
    updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_h3_history_timestamp ON generations(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_h3_history_favorite ON generations(favorite, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_h3_history_sampler ON generations(sampling_profile, timestamp DESC);
"""


def _db_path() -> Path:
    import folder_paths

    get_user_directory = getattr(folder_paths, "get_user_directory", None)
    if callable(get_user_directory):
        root = Path(get_user_directory()).expanduser().resolve()
    else:
        root = Path(folder_paths.get_output_directory()).expanduser().resolve().parent / "user"
    path = root / "h3studio" / "history.sqlite3"
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def _connect() -> sqlite3.Connection:
    connection = sqlite3.connect(_db_path(), timeout=5.0)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA journal_mode=WAL")
    connection.execute("PRAGMA synchronous=NORMAL")
    connection.executescript(_SCHEMA)
    return connection


def _state_fields(state: dict[str, Any]) -> dict[str, Any]:
    generation = state.get("generation") if isinstance(state.get("generation"), dict) else {}
    references = state.get("references") if isinstance(state.get("references"), list) else []
    seed = generation.get("seed")
    try:
        seed = int(seed) if seed is not None else None
    except (TypeError, ValueError):
        seed = None
    megapixels = generation.get("megapixels")
    try:
        megapixels = float(megapixels) if megapixels is not None else None
    except (TypeError, ValueError):
        megapixels = None
    return {
        "prompt": str(state.get("prompt") or ""),
        "seed": seed,
        "megapixels": megapixels,
        "aspect_ratio": str(generation.get("aspect_ratio") or ""),
        "sampling_profile": str(generation.get("sampling_profile") or ""),
        "ref_count": len(references),
    }


def _normalize_item(item: dict[str, Any]) -> dict[str, Any]:
    state = item.get("state") if isinstance(item.get("state"), dict) else {}
    fields = _state_fields(state)
    timestamp = item.get("timestamp")
    try:
        timestamp = int(timestamp)
    except (TypeError, ValueError):
        timestamp = int(time.time() * 1000)
    item_id = str(item.get("id") or "").strip()
    url = str(item.get("url") or item.get("image") or "").strip()
    if not item_id or not url:
        raise ValueError("History item requires id and url.")
    sampling_seconds = item.get("sampling_seconds")
    total_seconds = item.get("total_seconds")
    try:
        sampling_seconds = float(sampling_seconds) if sampling_seconds is not None else None
    except (TypeError, ValueError):
        sampling_seconds = None
    try:
        total_seconds = float(total_seconds) if total_seconds is not None else None
    except (TypeError, ValueError):
        total_seconds = None
    favorite = item.get("favorite")
    favorite = None if favorite is None else int(bool(favorite))
    return {
        "id": item_id[:240],
        "url": url[:2000],
        "timestamp": timestamp,
        "title": str(item.get("title") or "")[:500],
        **fields,
        "favorite": favorite,
        "state_json": json.dumps(state, ensure_ascii=False, separators=(",", ":")),
        "sampling_seconds": sampling_seconds,
        "total_seconds": total_seconds,
        "updated_at": int(time.time() * 1000),
    }


def _upsert_items(items: list[dict[str, Any]]) -> int:
    normalized = []
    for item in items:
        if not isinstance(item, dict):
            continue
        try:
            normalized.append(_normalize_item(item))
        except ValueError:
            continue
    if not normalized:
        return 0
    with _LOCK, _connect() as connection:
        for item in normalized:
            if item["favorite"] is None:
                row = connection.execute("SELECT favorite FROM generations WHERE id = ?", (item["id"],)).fetchone()
                item["favorite"] = int(row[0]) if row is not None else 0
            connection.execute(
                """
                INSERT INTO generations (
                    id, url, timestamp, title, prompt, seed, megapixels, aspect_ratio,
                    sampling_profile, ref_count, favorite, state_json, sampling_seconds,
                    total_seconds, updated_at
                ) VALUES (
                    :id, :url, :timestamp, :title, :prompt, :seed, :megapixels, :aspect_ratio,
                    :sampling_profile, :ref_count, :favorite, :state_json, :sampling_seconds,
                    :total_seconds, :updated_at
                )
                ON CONFLICT(id) DO UPDATE SET
                    url=excluded.url,
                    timestamp=excluded.timestamp,
                    title=excluded.title,
                    prompt=excluded.prompt,
                    seed=excluded.seed,
                    megapixels=excluded.megapixels,
                    aspect_ratio=excluded.aspect_ratio,
                    sampling_profile=excluded.sampling_profile,
                    ref_count=excluded.ref_count,
                    favorite=excluded.favorite,
                    state_json=excluded.state_json,
                    sampling_seconds=COALESCE(excluded.sampling_seconds, generations.sampling_seconds),
                    total_seconds=COALESCE(excluded.total_seconds, generations.total_seconds),
                    updated_at=excluded.updated_at
                """,
                item,
            )
        connection.commit()
    return len(normalized)


def _row_payload(row: sqlite3.Row) -> dict[str, Any]:
    try:
        state = json.loads(row["state_json"] or "{}")
    except json.JSONDecodeError:
        state = {}
    return {
        "id": row["id"],
        "url": row["url"],
        "timestamp": row["timestamp"],
        "title": row["title"],
        "state": state,
        "favorite": bool(row["favorite"]),
        "sampling_seconds": row["sampling_seconds"],
        "total_seconds": row["total_seconds"],
        "megapixels": row["megapixels"],
        "aspect_ratio": row["aspect_ratio"],
        "sampling_profile": row["sampling_profile"],
        "ref_count": row["ref_count"],
    }


def _query_items(query: str, favorite_only: bool, sampler: str, sort: str, limit: int) -> list[dict[str, Any]]:
    where: list[str] = []
    params: list[Any] = []
    text = str(query or "").strip()
    if text:
        like = f"%{text}%"
        where.append("(prompt LIKE ? OR title LIKE ? OR state_json LIKE ? OR CAST(seed AS TEXT) LIKE ?)")
        params.extend((like, like, like, like))
    if favorite_only:
        where.append("favorite = 1")
    if sampler:
        where.append("sampling_profile = ?")
        params.append(str(sampler))
    order = {
        "oldest": "timestamp ASC",
        "favorites": "favorite DESC, timestamp DESC",
        "largest": "COALESCE(megapixels, 0) DESC, timestamp DESC",
        "fastest": "CASE WHEN total_seconds IS NULL THEN 1 ELSE 0 END, total_seconds ASC, timestamp DESC",
    }.get(sort, "timestamp DESC")
    sql = "SELECT * FROM generations"
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += f" ORDER BY {order} LIMIT ?"
    params.append(max(1, min(5000, int(limit))))
    with _LOCK, _connect() as connection:
        rows = connection.execute(sql, params).fetchall()
    return [_row_payload(row) for row in rows]


def _decode_json(value: Any) -> dict[str, Any] | None:
    if isinstance(value, dict):
        return value
    if not value:
        return None
    try:
        parsed = json.loads(str(value))
    except (TypeError, json.JSONDecodeError):
        return None
    return parsed if isinstance(parsed, dict) else None


def _state_from_png(path: Path) -> dict[str, Any] | None:
    from PIL import Image

    try:
        with Image.open(path) as image:
            h3studio = _decode_json(image.info.get("h3studio"))
            if isinstance(h3studio?.get("state") if h3studio else None, dict):
                return h3studio["state"]
    except (OSError, ValueError):
        return None
    return None


def _rebuild_from_outputs() -> int:
    import folder_paths

    root = Path(folder_paths.get_output_directory()).resolve()
    items: list[dict[str, Any]] = []
    for path in root.rglob("*.png"):
        state = _state_from_png(path)
        if not state:
            continue
        relative = path.relative_to(root)
        subfolder = "" if relative.parent == Path(".") else relative.parent.as_posix()
        item_id = "png_" + hashlib.sha1(relative.as_posix().encode("utf-8")).hexdigest()[:20]
        items.append(
            {
                "id": item_id,
                "url": "/view?" + urlencode({"filename": relative.name, "subfolder": subfolder, "type": "output"}),
                "timestamp": int(path.stat().st_mtime * 1000),
                "title": path.stem,
                "state": state,
            }
        )
    return _upsert_items(items)


def register_history_routes() -> None:
    try:
        from aiohttp import web
        from server import PromptServer
    except ImportError:
        return
    server = getattr(PromptServer, "instance", None)
    if server is None or getattr(server, "_h3studio_history_routes_registered", False):
        return
    server._h3studio_history_routes_registered = True

    @server.routes.get("/h3studio/history/library")
    async def h3studio_history_library(request):
        try:
            query = request.rel_url.query
            items = _query_items(
                query.get("q", ""),
                query.get("favorite", "") in {"1", "true", "yes"},
                query.get("sampler", ""),
                query.get("sort", "newest"),
                int(query.get("limit", "2000")),
            )
            with _LOCK, _connect() as connection:
                total = int(connection.execute("SELECT COUNT(*) FROM generations").fetchone()[0])
                samplers = [row[0] for row in connection.execute(
                    "SELECT DISTINCT sampling_profile FROM generations WHERE sampling_profile <> '' ORDER BY sampling_profile"
                ).fetchall()]
            return web.json_response({"items": items, "count": len(items), "total": total, "samplers": samplers})
        except Exception as exc:
            return web.json_response({"items": [], "count": 0, "total": 0, "error": str(exc)}, status=500)

    @server.routes.post("/h3studio/history/upsert")
    async def h3studio_history_upsert(request):
        payload = await request.json()
        items = payload.get("items") if isinstance(payload, dict) else None
        if not isinstance(items, list):
            items = [payload] if isinstance(payload, dict) else []
        count = _upsert_items(items)
        return web.json_response({"ok": True, "count": count})

    @server.routes.post("/h3studio/history/favorite")
    async def h3studio_history_favorite(request):
        payload = await request.json()
        item_id = str(payload.get("id") or "").strip()
        if not item_id:
            return web.json_response({"ok": False, "error": "Missing history id."}, status=400)
        favorite = int(bool(payload.get("favorite")))
        with _LOCK, _connect() as connection:
            cursor = connection.execute(
                "UPDATE generations SET favorite = ?, updated_at = ? WHERE id = ?",
                (favorite, int(time.time() * 1000), item_id),
            )
            connection.commit()
        return web.json_response({"ok": cursor.rowcount > 0, "favorite": bool(favorite)})

    @server.routes.post("/h3studio/history/rebuild")
    async def h3studio_history_rebuild(_request):
        count = _rebuild_from_outputs()
        return web.json_response({"ok": True, "indexed": count})
