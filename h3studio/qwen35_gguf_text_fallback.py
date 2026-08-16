"""Text-only fallback for the stage-scoped Qwen3.5 GGUF helper.

llama-mtmd-cli's current non-interactive single-turn path requires an image, so
it is not a valid fallback for H3 Studio's optional text-only prompt writer.
Keep llama-server as the preferred shared analyzer/writer backend and use
llama-cli only when the server path fails for a text-only request.

Vision and text readiness are intentionally independent: a mtmd-only install is
still a perfectly valid fast GGUF image analyzer. In that case only the writer
falls back to native Qwen3.5; do not throw away the working GGUF vision backend.
"""

from __future__ import annotations

import logging
import os
import shutil
import subprocess
import time
from pathlib import Path

from . import qwen35_gguf as gguf

LOGGER = logging.getLogger(__name__)


def _executable(value: str | Path) -> str | None:
    path = Path(value).expanduser()
    if path.is_file() and os.access(path, os.X_OK):
        return str(path)
    return None


def _llama_cli() -> str | None:
    configured = gguf._normalize(os.environ.get("H3STUDIO_LLAMA_CLI"))
    if configured:
        return _executable(configured)
    direct = shutil.which("llama-cli") or shutil.which("llama-cli.exe")
    if direct:
        return direct
    for root in gguf._search_roots():
        for candidate in (
            root / "llama.cpp" / "build" / "bin" / "llama-cli",
            root / "llama.cpp" / "build" / "bin" / "Release" / "llama-cli.exe",
        ):
            resolved = _executable(candidate)
            if resolved:
                return resolved
    return None


def _complete_text_cli(text: str, max_tokens: int) -> str:
    cli = _llama_cli()
    if not cli:
        raise RuntimeError("llama-cli is unavailable for the text-only Qwen3.5 GGUF fallback")
    model = gguf.model_path()
    if not model.is_file():
        raise FileNotFoundError(f"Missing Qwen3.5 GGUF language model: {model}")
    gguf._prepare_vram()
    command = [
        cli,
        "-m", str(model),
        "-n", str(max(32, min(768, int(max_tokens)))),
        "--temp", "0",
        "--top-p", "1",
        "--top-k", "1",
        "--repeat-penalty", "1.0",
        "-ngl", "99",
        "-c", "4096",
        "--seed", "1",
        "--log-disable",
        "-p", "/no_think\n" + str(text),
    ]
    result = subprocess.run(
        command,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=180,
    )
    if result.returncode != 0:
        message = (result.stderr or result.stdout or "unknown error").strip()
        raise RuntimeError(f"llama-cli failed ({result.returncode}): {message[-800:]}")
    return str(result.stdout).strip()


def install() -> None:
    if bool(getattr(gguf, "__h3studio_text_fallback_installed__", False)):
        return
    gguf.__h3studio_text_fallback_installed__ = True
    original_generate = gguf.Qwen35GGUFClipProxy.generate
    original_status = gguf.status

    def status():
        result = dict(original_status())
        cli = _llama_cli()
        result["llama_cli_available"] = bool(cli)
        result["llama_cli"] = cli or ""
        # Vision may use server OR mtmd-cli. Text generation intentionally uses
        # server OR llama-cli because mtmd-cli's single-turn path requires media.
        result["vision_ready"] = bool(result.get("ready"))
        result["text_ready"] = bool(
            result.get("model_present") and (result.get("server_available") or cli)
        )
        return result

    def generate(self, tokens, *args, **kwargs):
        images = list(tokens.get("images") or [])
        if images:
            return original_generate(self, tokens, *args, **kwargs)

        text = str(tokens.get("text") or "")
        requested = int(kwargs.get("max_length") or 192)
        max_tokens = max(32, min(768, requested))
        started = time.perf_counter()
        server_error = ""
        if gguf._server_command():
            try:
                output = gguf._SERVER.complete(text, [], max_tokens)
                self._used_server = True
                LOGGER.info(
                    "[H3 Studio - GGUF] Text-only writer complete via llama-server | %.2fs",
                    time.perf_counter() - started,
                )
                return output
            except Exception as error:
                server_error = f"{type(error).__name__}: {error}"
                gguf._SERVER.stop()
                LOGGER.warning(
                    "[H3 Studio - GGUF] Text-only llama-server path failed; trying llama-cli | %s",
                    server_error,
                )

        if _llama_cli():
            output = _complete_text_cli(text, max_tokens)
            LOGGER.info(
                "[H3 Studio - GGUF] Text-only writer complete via llama-cli | %.2fs%s",
                time.perf_counter() - started,
                f" | server fallback={server_error}" if server_error else "",
            )
            return output

        raise RuntimeError(
            "Qwen3.5 GGUF text writer needs llama-server or llama-cli. "
            + (f"llama-server failed: {server_error}. " if server_error else "")
            + "H3 Studio deliberately does not call llama-mtmd-cli for text-only requests because its current single-turn path requires an image."
        )

    gguf.Qwen35GGUFClipProxy.generate = generate
    gguf._llama_cli = _llama_cli
    gguf.status = status

    # The GGUF resolver was installed just before this module. Split analyzer
    # and writer capability decisions: mtmd-only is enough for image analysis,
    # while text writing still needs llama-server or llama-cli.
    from . import analyzer_stack
    from .nodes import loader

    original_resolve_analyzer = loader._resolve_analyzer
    original_resolve_writer = loader._resolve_prompt_writer

    def resolve_analyzer(value: str | None) -> str | None:
        normalized = gguf._normalize(value)
        analyzer_status = status()
        explicit_gguf = normalized == gguf.FASTEST_QWEN35_4B_GGUF
        auto_values = {
            getattr(analyzer_stack, "AUTO_QWEN35_4B", "Auto · Qwen3.5 4B"),
            getattr(analyzer_stack, "OLD_AUTO_ANALYZER", "Auto · Qwen3-VL 4B"),
        }
        wants_gguf = explicit_gguf or normalized in auto_values
        if wants_gguf and analyzer_status.get("vision_ready"):
            if not analyzer_status.get("text_ready"):
                LOGGER.info(
                    "[H3 Studio - GGUF] Using working GGUF vision backend; text runtime is unavailable and only the writer will fall back."
                )
            return gguf.FASTEST_QWEN35_4B_GGUF
        return original_resolve_analyzer(value)

    def resolve_writer(value: str | None, analyzer_name: str | None) -> str | None:
        normalized = gguf._normalize(value)
        writer_status = status()
        same_as = normalized == "Same as image analyzer"
        explicit_gguf = normalized == gguf.FASTEST_QWEN35_4B_GGUF_WRITER
        auto_values = {
            getattr(analyzer_stack, "AUTO_WRITER_QWEN35_4B", "Auto · Qwen3.5 4B writer"),
            getattr(analyzer_stack, "OLD_AUTO_WRITER_4B", "Auto · Qwen3-VL 4B writer"),
            getattr(analyzer_stack, "OLD_AUTO_WRITER_8B", "Auto · Qwen3-VL 8B writer"),
        }
        would_use_gguf = explicit_gguf or normalized in auto_values or (
            same_as and gguf._is_gguf_choice(analyzer_name)
        )
        if would_use_gguf and not writer_status.get("text_ready"):
            fallback = analyzer_stack.preferred_qwen35("4b")
            if fallback:
                LOGGER.warning(
                    "[H3 Studio - GGUF] Vision backend is ready but text runtime is not; prompt writer falls back to native %s",
                    fallback,
                )
                return fallback
            if same_as:
                return None
        return original_resolve_writer(value, analyzer_name)

    loader._resolve_analyzer = resolve_analyzer
    loader._resolve_prompt_writer = resolve_writer
    analyzer_stack.qwen35_gguf_status = status


__all__ = ["_complete_text_cli", "_llama_cli", "install"]
