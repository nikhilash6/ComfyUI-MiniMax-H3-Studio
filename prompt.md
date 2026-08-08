# Mission brief

Build `ComfyUI-MiniMax-H3-Studio`, a private-first, production-shaped ComfyUI custom-node package for MiniMax H3 still-image generation.

The package must combine the strongest proven ideas from ComfyUI-MiniMaxH3-Easy, ComfyUI-MiniMax-H3-Image-Studio, and Alier's H3 Unified Image Director while correcting their architectural weaknesses. It must provide a compact, calm Studio controller; ordered reference-image cards; friendly `@Image N` mentions; deterministic compilation to H3-native `<Picture N>` and `<Subject N>` references; optional real VLM prompt enhancement; aspect-ratio and megapixel controls; seed and sampling profiles; explicit T2I/FL2VA/REF2VA routing; still-frame decoding and selection; reusable subgraph blueprints; and a polished full workflow.

H3 Hub, cloud browsing, Drive management, GPU polling, installers, App Mode, audio inputs, `overall_soundscape`, and `non_diegetic_music` are outside this repository.

The runtime source should naturally land around 8,000 or more maintainable lines, with the primary workflow around 2,000 JSON lines. Line count is a scope indicator, not permission to add padding or duplicate code.

Preserve attribution and license notices for inspirations. Keep the implementation modular, documented, testable without H3 weights, and honest about the final Lightning.ai GPU validation boundary.

Use staged commits so every major milestone has a recoverable checkpoint. Create the GitHub repository as private and push only after the local verification sweep succeeds.

Start now. Do not start broad implementation until `plans.md` is coherent.

