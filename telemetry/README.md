# H3 Studio aggregate counter

H3 Studio includes an optional, privacy-minimal aggregate counter for successful generated images. The deployed Cloudflare Worker accepts only `{ "count": 1..100, "schema": 1 }`, adds that number to one global Durable Object total, and exposes `/v1/count` plus `/badge.svg`.

It does **not** accept or store prompts, images, references, seeds, hardware details, file paths, installation identifiers, or other generation metadata. The Worker source in this directory is included for transparency; users do not need to deploy it themselves.

Telemetry is enabled by default and can be disabled at any time.

### Temporary opt-out

Set the environment variable before starting ComfyUI from the same terminal.

PowerShell:

```powershell
$env:H3STUDIO_TELEMETRY="0"
```

Linux/macOS:

```bash
export H3STUDIO_TELEMETRY=0
```

This lasts only for that terminal session and processes started from it.

### Persistent opt-out

Create an empty file named `.h3studio-telemetry-disabled` in the H3 Studio repository directory. No environment variable is then required.

The client batches counts and sends them asynchronously so telemetry does not block image generation. Network failures are ignored.
