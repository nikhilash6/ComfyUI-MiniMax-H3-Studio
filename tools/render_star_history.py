#!/usr/bin/env python3
"""Render H3 Studio's README star-history chart from authenticated GitHub data."""

from __future__ import annotations

import json
import math
import os
import urllib.request
from collections import Counter
from datetime import UTC, datetime, timedelta
from pathlib import Path
from xml.sax.saxutils import escape

API_VERSION = "2026-03-10"
WIDTH = 720
HEIGHT = 360
MARGIN_LEFT = 58
MARGIN_RIGHT = 28
MARGIN_TOP = 54
MARGIN_BOTTOM = 48

README_PREFIX = (
    "## Star history\n\n"
    "If H3 Studio makes H3 less painful to use, leave a star.\n\n"
)
README_BLOCK = """<!-- STAR_HISTORY_CHART_START -->
<div align="center">
  <a href="https://github.com/thaakeno/ComfyUI-MiniMax-H3-Studio/stargazers">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="docs/assets/star-history-dark.svg">
      <source media="(prefers-color-scheme: light)" srcset="docs/assets/star-history-light.svg">
      <img alt="MiniMax H3 Studio star history" src="docs/assets/star-history-light.svg" width="720">
    </picture>
  </a>
</div>
<!-- STAR_HISTORY_CHART_END -->"""


def github_json(url: str, token: str) -> tuple[list[dict], dict[str, str]]:
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "application/vnd.github.star+json",
            "Authorization": f"Bearer {token}",
            "X-GitHub-Api-Version": API_VERSION,
            "User-Agent": "h3-studio-star-history/1.0",
        },
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.load(response), dict(response.headers.items())


def fetch_stars(repository: str, token: str) -> list[datetime]:
    stars: list[datetime] = []
    page = 1
    while True:
        url = f"https://api.github.com/repos/{repository}/stargazers?per_page=100&page={page}"
        payload, _headers = github_json(url, token)
        if not payload:
            break
        for item in payload:
            raw = item.get("starred_at")
            if not raw:
                raise RuntimeError(
                    "GitHub did not return stargazer timestamps. "
                    "The workflow token must have access to this repository's stargazer listing."
                )
            stars.append(datetime.fromisoformat(raw.replace("Z", "+00:00")).astimezone(UTC))
        if len(payload) < 100:
            break
        page += 1
        if page > 100:
            raise RuntimeError("Refusing to paginate more than 10,000 stargazers.")
    return sorted(stars)


def nice_ceiling(value: int) -> int:
    if value <= 5:
        return 5
    magnitude = 10 ** math.floor(math.log10(value))
    normalized = value / magnitude
    for candidate in (1, 2, 5, 10):
        if normalized <= candidate:
            return candidate * magnitude
    return 10 * magnitude


def timeline(stars: list[datetime]) -> tuple[datetime, datetime, list[tuple[datetime, int]]]:
    now = datetime.now(UTC)
    if stars:
        start = stars[0].replace(hour=0, minute=0, second=0, microsecond=0)
    else:
        start = now - timedelta(days=1)
    if now <= start:
        now = start + timedelta(days=1)

    by_day = Counter(star.date() for star in stars)
    points: list[tuple[datetime, int]] = [(start, 0)]
    running = 0
    current = start
    end_day = now.replace(hour=0, minute=0, second=0, microsecond=0)
    while current <= end_day:
        running += by_day.get(current.date(), 0)
        day_end = min(current + timedelta(hours=23, minutes=59), now)
        points.append((day_end, running))
        current += timedelta(days=1)
    if points[-1][0] < now:
        points.append((now, len(stars)))
    else:
        points[-1] = (now, len(stars))
    return start, now, points


def render_svg(repository: str, stars: list[datetime], *, dark: bool) -> str:
    start, end, points = timeline(stars)
    plot_w = WIDTH - MARGIN_LEFT - MARGIN_RIGHT
    plot_h = HEIGHT - MARGIN_TOP - MARGIN_BOTTOM
    y_max = nice_ceiling(max(1, len(stars)))
    seconds = max(1.0, (end - start).total_seconds())

    def x(dt: datetime) -> float:
        return MARGIN_LEFT + ((dt - start).total_seconds() / seconds) * plot_w

    def y(count: int) -> float:
        return MARGIN_TOP + plot_h - (count / y_max) * plot_h

    path = " ".join(
        ("M" if index == 0 else "L") + f" {x(dt):.2f} {y(count):.2f}"
        for index, (dt, count) in enumerate(points)
    )
    area = (
        f"M {MARGIN_LEFT:.2f} {MARGIN_TOP + plot_h:.2f} "
        + " ".join(f"L {x(dt):.2f} {y(count):.2f}" for dt, count in points)
        + f" L {x(end):.2f} {MARGIN_TOP + plot_h:.2f} Z"
    )

    colors = {
        "bg": "#0d1117" if dark else "#ffffff",
        "text": "#e6edf3" if dark else "#24292f",
        "muted": "#8b949e" if dark else "#57606a",
        "grid": "#30363d" if dark else "#d8dee4",
        "line": "#34d3b5" if dark else "#0b9f87",
        "fill": "#34d3b5" if dark else "#0b9f87",
        "border": "#30363d" if dark else "#d0d7de",
    }

    y_lines: list[str] = []
    for index in range(5):
        value = round(y_max * index / 4)
        yy = y(value)
        y_lines.append(
            f'<line x1="{MARGIN_LEFT}" y1="{yy:.2f}" x2="{WIDTH - MARGIN_RIGHT}" y2="{yy:.2f}" class="grid"/>'
            f'<text x="{MARGIN_LEFT - 10}" y="{yy + 4:.2f}" text-anchor="end" class="tick">{value}</text>'
        )

    span = end - start
    x_lines: list[str] = []
    for index in range(5):
        fraction = index / 4
        dt = start + span * fraction
        xx = x(dt)
        if span < timedelta(days=3):
            label = dt.strftime("%b %d %H:%M")
        elif span < timedelta(days=180):
            label = dt.strftime("%b %d")
        else:
            label = dt.strftime("%b %Y")
        x_lines.append(
            f'<line x1="{xx:.2f}" y1="{MARGIN_TOP}" x2="{xx:.2f}" y2="{MARGIN_TOP + plot_h}" class="grid vertical"/>'
            f'<text x="{xx:.2f}" y="{HEIGHT - 18}" text-anchor="middle" class="tick">{escape(label)}</text>'
        )

    current_x = x(points[-1][0])
    current_y = y(points[-1][1])
    title = escape(repository)
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{WIDTH}" height="{HEIGHT}" viewBox="0 0 {WIDTH} {HEIGHT}" role="img" aria-labelledby="title desc">
<title id="title">{title} star history</title>
<desc id="desc">Cumulative GitHub stars over time. Current stars: {len(stars)}.</desc>
<style>
  text{{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Arial,sans-serif}}
  .title{{font-size:16px;font-weight:700;fill:{colors['text']}}}
  .count{{font-size:13px;font-weight:700;fill:{colors['line']}}}
  .tick{{font-size:11px;fill:{colors['muted']}}}
  .grid{{stroke:{colors['grid']};stroke-width:1;opacity:.65}}
  .vertical{{opacity:.28}}
</style>
<rect x="0.5" y="0.5" width="{WIDTH - 1}" height="{HEIGHT - 1}" rx="10" fill="{colors['bg']}" stroke="{colors['border']}"/>
<text x="{MARGIN_LEFT}" y="30" class="title">H3 Studio · Star history</text>
<text x="{WIDTH - MARGIN_RIGHT}" y="30" text-anchor="end" class="count">★ {len(stars)} stars</text>
{''.join(y_lines)}
{''.join(x_lines)}
<path d="{area}" fill="{colors['fill']}" opacity=".10"/>
<path d="{path}" fill="none" stroke="{colors['line']}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
<circle cx="{current_x:.2f}" cy="{current_y:.2f}" r="4" fill="{colors['line']}" stroke="{colors['bg']}" stroke-width="2"/>
</svg>'''


def update_readme(path: Path) -> None:
    text = path.read_text(encoding="utf-8")
    if README_PREFIX not in text:
        raise RuntimeError("README Star history heading/call-to-action changed; refusing a blind rewrite.")
    start = text.index(README_PREFIX) + len(README_PREFIX)
    note = "\n\n> [!NOTE]"
    end = text.index(note, start)
    text = text[:start] + README_BLOCK + text[end:]
    path.write_text(text, encoding="utf-8")


def main() -> None:
    repository = os.environ.get("GITHUB_REPOSITORY", "thaakeno/ComfyUI-MiniMax-H3-Studio")
    token = os.environ.get("GITHUB_TOKEN", "").strip()
    if not token:
        raise SystemExit("GITHUB_TOKEN is required")

    stars = fetch_stars(repository, token)
    assets = Path("docs/assets")
    assets.mkdir(parents=True, exist_ok=True)
    (assets / "star-history-light.svg").write_text(render_svg(repository, stars, dark=False), encoding="utf-8")
    (assets / "star-history-dark.svg").write_text(render_svg(repository, stars, dark=True), encoding="utf-8")
    update_readme(Path("README.md"))
    print(f"Rendered {len(stars)} stargazers for {repository}.")


if __name__ == "__main__":
    main()
