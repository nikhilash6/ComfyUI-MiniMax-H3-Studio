<div align="center">

# MiniMax H3 Studio

### Turn MiniMax H3 into an actual image workflow for ComfyUI.

Text-to-image, image editing, multi-reference generation, LightX acceleration, smart prompt prep, Face Refine, previews and benchmarking — without building the whole H3 graph yourself.

<p>
  <a href="https://github.com/thaakeno/ComfyUI-MiniMax-H3-Studio/stargazers"><img alt="Star H3 Studio" src="https://img.shields.io/badge/%E2%98%85%20Star-H3%20Studio-34D3B5?style=for-the-badge&logo=github&logoColor=white&labelColor=171B1F"></a>
  <img alt="ComfyUI custom nodes" src="https://img.shields.io/badge/ComfyUI-Custom%20Nodes-0EA5E9?style=for-the-badge&labelColor=171B1F">
  <img alt="H3 profiles" src="https://img.shields.io/badge/H3-Base%20%C2%B7%20LightX%20%C2%B7%20PDD-A855F7?style=for-the-badge&labelColor=171B1F">
  <img alt="Status alpha" src="https://img.shields.io/badge/Status-Alpha-F59E0B?style=for-the-badge&labelColor=171B1F">
  <img alt="Images generated" src="https://h3-studio-counter.h3-studio-counter.workers.dev/badge.svg">
</p>

**One maintained workflow. H3 underneath. Far less wiring.**

</div>

<img width="3264" height="1408" alt="H3 Studio" src="https://github.com/user-attachments/assets/91b541b9-98a4-4d14-8b6a-5916b02baa9d" />

> [!IMPORTANT]
> H3 Studio is still alpha. MiniMax H3 is an audio-video model being pushed into image-generation workflows here, so some paths are experimental and can change as ComfyUI and H3 support evolve.

> [!WARNING]
> H3 Studio currently targets classic ComfyUI Nodes 1.0. Nodes 2.0 UI support is still being worked on.

## Why H3 Studio

Running H3 for images is possible in normal ComfyUI, but a serious setup quickly turns into model routing, reference conditioning, sampler profiles, frame selection, VAE handling, prompt tooling and a pile of utility nodes.

H3 Studio keeps that machinery behind a smaller image-focused interface while still using the real H3 FL2VA and REF2VA paths underneath.

## What it does

<table>
<tr>
<td width="50%" valign="top">

### One Image Director

Text-to-image, image-to-image and reference editing live in the same interface.

Choose the aspect ratio or exact output size, sampling profile, seed, runtime behavior and frame strategy without rebuilding the workflow.

</td>
<td width="50%" valign="top">

### Multi-reference H3

Add up to nine ordered references and address them directly as <code>@Image1</code> through <code>@Image9</code>.

Each image can own a different part of the result: identity, pose, outfit, style, composition, lighting, environment and more.

</td>
</tr>

<tr>
<td width="50%" valign="top">

### Fast H3 paths

Use native Base sampling or accelerated LightX/PDD profiles.

The current main fast path is **LightX v1.0 FL2VA 8-step**, with Kijai's reduced variants and older experimental profiles also available.

</td>
<td width="50%" valign="top">

### Face Refine

Small and distant faces can be detected after the final H3 still is selected and rerendered through H3 at a larger crop.

YOLOv8-Face is the recommended detector. SAM is optional and only improves the blend mask.

</td>
</tr>

<tr>
<td width="50%" valign="top">

### Smarter prompt prep

Optional vision models can inspect references and help turn a rough request into a cleaner H3 instruction.

Qwen3-VL is supported, alongside the lighter Qwen3.5 4B GGUF + llama.cpp path for much faster prompt preparation.

</td>
<td width="50%" valign="top">

### Demos, history and benchmarks

The Director includes restorable demo generations and local generation history.

Benchmark Lab can compare sampling profiles, resolutions and repeated seeds without maintaining separate workflows.

</td>
</tr>
</table>

## Three generation paths

| Mode | H3 path | Use |
| --- | --- | --- |
| **Text to image** | FL2VA | Prompt-only generation |
| **Image to image** | FL2VA | Edit an input image with an independently chosen output size |
| **Reference edit** | REF2VA | Generate from one or more ordered reference images |

Auto routing picks the valid path for the current request instead of silently feeding references into the wrong mode.

<img width="1600" height="1000" alt="H3 Studio comparison" src="https://github.com/user-attachments/assets/9e68b1dc-e7d1-4a4e-8c1c-d4379fa081c5" />

## Face Refine

H3 can make a great wide composition while leaving a 40 px background face looking rough.

Face Refine targets that specific problem.

The final still is selected first. YOLO then finds the faces worth touching, H3 rerenders those crops through a low-denoise FL2VA source-latent pass, and the result is blended back into the original image.

The Director shows what happened after the run — detector, detected/selected/refined counts and a before/after inspection image — so it is not an invisible post-process.

Default setup:

```text
face_yolov8m.pt
models/ultralytics/bbox/
```

Recommended detector backend:

[ComfyUI-Impact-Subpack](https://github.com/ltdrdata/ComfyUI-Impact-Subpack)

SAM + [Impact Pack](https://github.com/ltdrdata/ComfyUI-Impact-Pack) are optional.

## Sampling

H3 Studio keeps the actual recipe visible.

| Profile | Route | Steps |
| --- | --- | ---: |
| Base Quality | FL2VA / REF2VA | 20 |
| Base Balanced | FL2VA / REF2VA | 12 |
| **LightX v1.0 official** | FL2VA | **8** |
| LightX v1.0 pruned | FL2VA | 8 / 4 |
| LightX v0.1 | FL2VA / REF2VA | 4 |
| Mamad8 PDD | REF2VA | 4 |

Runtime presets are separate from sampling. Choosing **Auto**, **Fast**, **Quality** or **Low VRAM** changes how H3 is executed, not which sampling recipe you selected.

## Resolution and decoding

H3 Studio supports normal aspect presets, custom width/height and roughly **0.2–8.5 MP** direct generation.

Higher resolution is experimental. H3 is not a super-resolution model, so doubling the pixels does not automatically double the detail.

The normal H3 video VAE remains the default. H3 Studio also supports temporal frame selection, native chunked H3 VAE handling, configurable VAE tiling and the optional experimental T=1 image VAE.

TAEH3 can provide lightweight live previews while H3 is sampling.

## Demos

The Director ships with a small gallery of cinematic and anime generations.

The demo image itself stores the original H3 Studio generation metadata, so applying a demo restores the actual prompt and Director state instead of loading a separately hand-written approximation.

History works the same way for your own recent generations.

## Quick start

1. Open [`example_workflows/H3_Studio_Unified_Image.json`](example_workflows/H3_Studio_Unified_Image.json).
2. Select your H3 FL2VA / REF2VA models, 32B text encoder and H3 VAE.
3. Write a prompt in **H3 Studio Director**.
4. Add references only when you need them.
5. Pick a sampling profile and queue.

For multi-reference generation, be explicit:

```text
Keep the identity and pose from @Image1.
Transfer only the jacket from @Image2.
Use the lighting from @Image3.
```

## Install

Clone into `ComfyUI/custom_nodes`:

```bash
cd /path/to/ComfyUI/custom_nodes
git clone https://github.com/thaakeno/ComfyUI-MiniMax-H3-Studio.git
cd ComfyUI-MiniMax-H3-Studio
python -m pip install -r requirements.txt
```

Restart ComfyUI and open the maintained workflow.

For the latest development build:

```bash
git clone --branch dev https://github.com/thaakeno/ComfyUI-MiniMax-H3-Studio.git
```

## Models

| Model | Folder |
| --- | --- |
| H3 FL2VA / REF2VA | `models/diffusion_models/` |
| H3 32B text encoder | `models/text_encoders/` |
| H3 video VAE | `models/vae/` |
| LightX LoRAs | `models/loras/` |
| TAEH3 | `models/vae_approx/` |
| Qwen3.5 GGUF helper | `models/h3studio_vlm/` |
| YOLO Face | `models/ultralytics/bbox/` |
| SAM, optional | `models/sams/` |

Recommended H3 model source:

[Kijai/MiniMax-H3-experimental](https://huggingface.co/Kijai/MiniMax-H3-experimental)

Official H3 encoder / VAE:

[Comfy-Org/MiniMax-H3](https://huggingface.co/Comfy-Org/MiniMax-H3)

LightX assets:

[LightX2V/Minimax-h3-Turbo](https://huggingface.co/lightx2v/Minimax-h3-Turbo) · [Kijai/MiniMax-H3_comfy](https://huggingface.co/Kijai/MiniMax-H3_comfy)

Optional PDD:

[Mamad8/MiniMaxH3_R2V-PDD-Turbo-LoRA-Mamad8](https://huggingface.co/Mamad8/MiniMaxH3_R2V-PDD-Turbo-LoRA-Mamad8)

## Model Setup

H3 Studio includes a setup panel that checks the assets used by the workflow.

With [Universal Asset Downloader](https://github.com/thaakeno/comfyui-universal-asset-downloader) installed, supported assets can also be verified and installed directly from the UI.

Face Refine setup checks both sides separately: having `face_yolov8m.pt` is not enough if there is no detector backend capable of running it.

## Image examples

<img width="3264" height="1408" alt="H3 Studio example" src="https://github.com/user-attachments/assets/160a2623-34a2-48ea-9d4b-1b3fc9699970" />

<img width="1920" height="1088" alt="H3 Studio example" src="https://github.com/user-attachments/assets/8054886b-49b9-4642-a97e-59c59a2fcf02" />

<img width="3264" height="1824" alt="H3 Studio example" src="https://github.com/user-attachments/assets/1a2133f0-a95d-4680-9baf-4dc64575f5e6" />

## Credits

H3 Studio is its own project, but some parts started from or were informed by good work already happening around H3.

[ComfyUI-MiniMaxH3-Easy](https://github.com/nkxx188/ComfyUI-MiniMaxH3-Easy) provided foundations for the ordered media / mention interaction.

[ComfyUI-MiniMax-H3-Image-Studio](https://github.com/astropuzzo/ComfyUI-MiniMax-H3-Image-Studio) provided earlier image-oriented H3 resolution, decode and workflow ideas.

[ComfyUI-H3-FaceRefine](https://github.com/Carasibana/ComfyUI-H3-FaceRefine) was a useful reference for crop-based H3 face refinement and source-latent injection.

Kijai, Mamad8, LightX2V, Comfy-Org, Impact Pack/Subpack, Unsloth and llama.cpp provide external models, runtimes or optional integrations used around the project.

See [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) for the exact code and licensing boundaries.

H3 Studio is not endorsed by MiniMax, ComfyUI or any of the referenced projects.

## Project status

H3 Studio is actively developed and still alpha.

The core image workflow is working, but H3 itself was not released as a dedicated image model and some high-resolution, acceleration, UI and post-processing paths are intentionally experimental.

If something breaks, open an [issue](https://github.com/thaakeno/ComfyUI-MiniMax-H3-Studio/issues) with the traceback, GPU, ComfyUI version, selected model files and workflow when possible.

## Star history

If H3 Studio makes H3 less painful to use, leave a star.

<div align="center">
  <a href="https://www.star-history.com/#thaakeno/ComfyUI-MiniMax-H3-Studio&Date">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=thaakeno/ComfyUI-MiniMax-H3-Studio&type=Date&theme=dark">
      <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=thaakeno/ComfyUI-MiniMax-H3-Studio&type=Date">
      <img alt="MiniMax H3 Studio star history" src="https://api.star-history.com/svg?repos=thaakeno/ComfyUI-MiniMax-H3-Studio&type=Date" width="720">
    </picture>
  </a>
</div>

> [!NOTE]
> The GENERATED badge sends only a batched successful-image count. It never sends prompts, images, references, seeds, paths or hardware information. Set `H3STUDIO_TELEMETRY=0` to disable it.

## License

H3 Studio is available under the [MIT License](LICENSE).

External models and optional custom nodes remain under their own licenses.
