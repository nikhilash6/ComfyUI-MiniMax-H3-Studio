# H3 Studio demo shelf assets

The shelf has two separate asset roles on purpose:

- `*.webp` files are lightweight display thumbnails only.
- The matching `*.png` named by `metadata_file` in `manifest.json` is the authoritative generation source. It must be the original H3 Studio output PNG with its `h3studio`, `workflow`, and/or `prompt` text chunks intact.

`manifest.json` is catalog metadata only: id, category, title, subtitle, thumbnail, and metadata filename. Do **not** copy prompts, seeds, resolution, route, sampling profile, or Director state into the manifest. The browser reads those values directly from the PNG when the card is inspected/applied.

If a metadata PNG is absent or its H3 Studio state cannot be decoded, the card remains visible as a preview but is deliberately non-restorable. The shelf must never silently fall back to a hand-authored or truncated prompt.

When adding a demo, keep the original PNG byte-for-byte if possible so its metadata remains provenance for the result. A derived WebP can then be added beside it for fast shelf rendering.
