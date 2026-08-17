# Third-party notices

ComfyUI-MiniMax-H3-Studio is an independent project inspired by several existing implementations. Unless stated otherwise, third-party custom nodes, Python packages, and model checkpoints described below are not bundled into this repository and remain under their own licenses. H3 Studio's MIT license does not relicense those external works.

## ComfyUI-MiniMaxH3-Easy

The ordered media interaction, virtual media-link behavior, prompt mention editor, inline reference chips, and parts of `web/h3studio_ui.js` are adapted from `nkxx188/ComfyUI-MiniMaxH3-Easy` under the MIT License.

Copyright (c) 2026 nkxx188

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

Source: https://github.com/nkxx188/ComfyUI-MiniMaxH3-Easy

## ComfyUI-MiniMax-H3-Image-Studio

Resolution math, exact-frame decode concepts, still-selection strategies, sampling-profile organization, workflow validation ideas, and `h3studio/nodes/image_runtime.py` are adapted from `astropuzzo/ComfyUI-MiniMax-H3-Image-Studio`, released under the Unlicense/public-domain dedication.

Source: https://github.com/astropuzzo/ComfyUI-MiniMax-H3-Image-Studio

## Qwen3.5 GGUF prompt-prep performance reference

`workordie/ComfyUI-Qwen3.5` demonstrated a practical Qwen3.5 multimodal GGUF workflow using llama.cpp and published the performance comparison that motivated evaluating Qwen3.5-4B Q4_K_XL for H3 Studio prompt preparation. That project is Apache-2.0:
https://github.com/workordie/ComfyUI-Qwen3.5

H3 Studio's implementation is independent and does not bundle or import that custom node. It integrates against llama.cpp's public `llama-server`, `llama-mtmd-cli`, and `llama-cli` interfaces, uses its own lifecycle/cache contracts, and stores the optional model assets in H3 Studio's existing `models/h3studio_vlm` destination.

The optional Qwen3.5-4B GGUF language model and BF16 multimodal projector are distributed separately by Unsloth under the model repository's published terms and are not bundled in H3 Studio:
https://huggingface.co/unsloth/Qwen3.5-4B-GGUF

llama.cpp is a separate optional runtime dependency and remains under its own license:
https://github.com/ggml-org/llama.cpp

## Face Refine optional detector and mask stack

H3 Studio Face Refine contains original orchestration code, crop geometry, H3 FL2VA rerender integration, blending, and fallbacks. It can interoperate with the following external detector/mask components. The Face Refine setup action may clone/install or download these components only after the user explicitly requests setup; they are not included in the H3 Studio source archive.

### ComfyUI Impact Subpack

Face Refine prefers the `UltralyticsDetectorProvider` registered by `ltdrdata/ComfyUI-Impact-Subpack` when that separately installed custom node is available. Impact Subpack is licensed under GNU AGPL-3.0.

Source: https://github.com/ltdrdata/ComfyUI-Impact-Subpack
License: https://github.com/ltdrdata/ComfyUI-Impact-Subpack/blob/main/LICENSE.txt

H3 Studio does not copy Impact Subpack source code. The optional setup helper can clone the upstream repository into ComfyUI's `custom_nodes` directory and install its own published requirements when requested.

### Ultralytics Python package

When Impact Subpack is unavailable, Face Refine can use the separately installed `ultralytics` Python package as a direct local YOLO loader. The upstream Ultralytics project publishes its open-source package under AGPL-3.0 and also offers separate commercial licensing.

Source and license information: https://github.com/ultralytics/ultralytics

H3 Studio does not bundle Ultralytics source code. Its optional setup helper can invoke `pip install ultralytics` when requested. Users are responsible for reviewing the current upstream license terms for their use case.

### Bingsu ADetailer face detector checkpoint

The recommended `face_yolov8m.pt` detector is downloaded, when requested, from `Bingsu/adetailer` on Hugging Face into `models/ultralytics/bbox/`. The model repository currently declares Apache-2.0 in its published metadata.

Source/model card: https://huggingface.co/Bingsu/adetailer

The checkpoint is not committed to or redistributed inside the H3 Studio repository. Users should review the current model-card terms together with any applicable runtime-library terms before redistribution or deployment.

### ComfyUI Impact Pack and Segment Anything

Optional SAM masking uses the `SAMLoader` registered by the separately installed `ltdrdata/ComfyUI-Impact-Pack`. Impact Pack is licensed under GNU GPL-3.0.

Source: https://github.com/ltdrdata/ComfyUI-Impact-Pack
License: https://github.com/ltdrdata/ComfyUI-Impact-Pack/blob/Main/LICENSE.txt

H3 Studio does not copy Impact Pack source code. The optional setup helper can clone the upstream repository into ComfyUI's `custom_nodes` directory and install its published requirements when requested.

The default optional SAM checkpoint `sam_vit_b_01ec64.pth` comes from Meta's Segment Anything project. Segment Anything code and model checkpoints are published under Apache-2.0.

Source: https://github.com/facebookresearch/segment-anything
Checkpoint source: https://dl.fbaipublicfiles.com/segment_anything/sam_vit_b_01ec64.pth

The SAM checkpoint is not committed to H3 Studio; the setup helper downloads it into `models/sams/` only when SAM setup is explicitly requested.

### MediaPipe fallback

If MediaPipe is already installed in the ComfyUI Python environment, Face Refine can use its face detector as a fallback behind YOLO. MediaPipe is an external Apache-2.0 project and is not installed or bundled by H3 Studio.

Source: https://github.com/google-ai-edge/mediapipe

### Bundled OpenCV Haar cascade fallback

`h3studio/face_refine/data/haarcascade_frontalface_default.xml` is bundled as the final zero-extra-model detector fallback. The file carries its own Intel License Agreement for the Open Source Computer Vision Library and copyright notice (`Copyright (C) 2000, Intel Corporation`) directly inside the XML. That embedded notice and license text are retained verbatim.

H3 Studio's original Python wrapper around the cascade remains MIT-licensed; the bundled cascade itself remains under the license embedded in that file.

## Optional TAEH3 preview asset

The optional `taeh3.safetensors` checkpoint is distributed by Kijai under Apache-2.0 and is not bundled in this repository:
https://huggingface.co/Kijai/MiniMax-H3-TAE

The independent tiny-decoder integration uses ComfyUI's public wrapper APIs and the established tiny-autoencoder architecture described by madebyollin's MIT-licensed TAEHV project:
https://github.com/madebyollin/taehv

No ComfyUI-KJNodes source code is copied into this MIT-licensed repository.

## Optional Mamad8 PDD backend

The optional REF2VA PDD profiles interoperate with `mamad8c/ComfyUI-MiniMaxH3-PDD-Mamad8`, distributed under GPL-3.0:
https://github.com/mamad8c/ComfyUI-MiniMaxH3-PDD-Mamad8

H3 Studio does not bundle, copy, modify, or relicense that implementation. Its MIT-licensed adapter only discovers the node IDs registered by the separately installed package and invokes their public execution surface. The external package and its model artifacts remain separate dependencies under their own terms.

## Optional Mamad8 Image VAE

The experimental `minimax_h3_t1_image_vae_step1597.safetensors` image decoder is distributed separately by Mamad8 and is not bundled:
https://huggingface.co/Mamad8/MiniMax-H3-Image-VAE

H3 Studio only exposes an optional loader and identical-latent decoder comparison. The model remains under the terms published with its Hugging Face repository. It is restricted to `T=1` still-image experiments; the original H3 video VAE remains the default and the only supported multi-frame decoder.
