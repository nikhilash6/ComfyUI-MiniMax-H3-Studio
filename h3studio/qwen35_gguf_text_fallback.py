"""Robust text writing for the stage-scoped Qwen3.5 GGUF helper.

Prefer llama-server because it can stay warm across analyzer + writer.  Use
llama-cli for a true text-only one-shot fallback.  Some installs expose only
llama-mtmd-cli; that executable insists on media even for a text task, so H3
Studio supplies a tiny neutral placeholder image and explicitly tells the model
to ignore it.  This keeps prompt writing on the same fast Q4_K_XL checkpoint
instead of loading the much larger native BF16 helper just because one llama.cpp
binary is missing.

Vision and text readiness are intentionally independent.  A working mtmd-only
runtime remains a valid fast image analyzer and, through the neutral-placeholder
adapter below, a valid deterministic prompt writer too.
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


def _complete_text_mtmd(text: str, max_tokens: int) -> str:
    """Run a text task through mtmd without letting the placeholder affect prose."""

    if not gguf._mtmd_cli():
        raise RuntimeError("llama-mtmd-cli is unavailable")
    if not gguf.mmproj_path().is_file():
        raise FileNotFoundError(f"Missing Qwen3.5 GGUF mmproj: {gguf.mmproj_path()}")

    # mtmd currently rejects a non-interactive turn with zero media.  A tiny
    # flat mid-gray image is deliberately information-free and only satisfies
    # the CLI contract.  The instruction makes its non-semantic role explicit.
    import numpy as np

    neutral = np.full((16, 16, 3), 127, dtype=np.uint8)
    adapted = (
        "TEXT-ONLY TASK. The attached flat gray placeholder contains no source information; "
        "ignore it completely and answer only from the text below.\n\n" + str(text)
    )
    return gguf._complete_cli(adapted, [neutral], max_tokens)


def install() -> None:
    if bool(getattr(gguf, "__h3studio_text_fallback_installed__", False)):
        return
    gguf.__h3studio_text_fallback_installed__ = True
    original_generate = gguf.Qwen35GGUFClipProxy.generate
    original_status = gguf.status

    def status():
        result = dict(original_status())
        cli = _llama_cli()
        mtmd = bool(result.get("mtmd_cli_available"))
        result["llama_cli_available"] = bool(cli)
        result["llama_cli"] = cli or ""
        result["vision_ready"] = bool(result.get("ready"))
        result["text_ready"] = bool(
            result.get("model_present")
            and (
                result.get("server_available")
                or cli
                or (mtmd and result.get("mmproj_present"))
            )
        )
        if result.get("server_available"):
            result["text_backend"] = "llama-server"
        elif cli:
            result["text_backend"] = "llama-cli"
        elif mtmd and result.get("mmproj_present"):
            result["text_backend"] = "llama-mtmd-cli neutral-placeholder adapter"
        else:
            result["text_backend"] = "unavailable"
        return result

    def generate(self, tokens, *args, **kwargs):
        images = list(tokens.get("images") or [])
        if images:
            return original_generate(self, tokens, *args, **kwargs)

        text = str(tokens.get("text") or "")
        requested = int(kwargs.get("max_length") or 192)
        max_tokens = max(32, min(768, requested))
        started = time.perf_counter()
        failures: list[str] = []

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
                failures.append(f"llama-server={type(error).__name__}: {error}")
                gguf._SERVER.stop()
                LOGGER.warning(
                    "[H3 Studio - GGUF] Text-only llama-server path failed; trying one-shot fallback | %s",
                    failures[-1],
                )

        if _llama_cli():
            try:
                output = _complete_text_cli(text, max_tokens)
                LOGGER.info(
                    "[H3 Studio - GGUF] Text-only writer complete via llama-cli | %.2fs%s",
                    time.perf_counter() - started,
                    f" | fallback={'; '.join(failures)}" if failures else "",
                )
                return output
            except Exception as error:
                failures.append(f"llama-cli={type(error).__name__}: {error}")
                LOGGER.warning(
                    "[H3 Studio - GGUF] llama-cli text path failed; trying mtmd adapter | %s",
                    failures[-1],
                )

        if gguf._mtmd_cli() and gguf.mmproj_path().is_file():
            try:
                output = _complete_text_mtmd(text, max_tokens)
                LOGGER.info(
                    "[H3 Studio - GGUF] Text-only writer complete via mtmd neutral-placeholder adapter | %.2fs%s",
                    time.perf_counter() - started,
                    f" | fallback={'; '.join(failures)}" if failures else "",
                )
                return output
            except Exception as error:
                failures.append(f"llama-mtmd-cli={type(error).__name__}: {error}")

        details = "; ".join(failures) if failures else "no compatible llama.cpp text executable found"
        raise RuntimeError(f"Qwen3.5 GGUF text writer unavailable: {details}")

    gguf.Qwen35GGUFClipProxy.generate = generate
    gguf._llama_cli = _llama_cli
    gguf._complete_text_mtmd = _complete_text_mtmd
    gguf.status = status

    # The GGUF resolver was installed just before this module. Split analyzer
    # and writer capability decisions: a working vision path must never be
    # discarded merely because the preferred text executable differs.
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
        if would_use_gguf and writer_status.get("text_ready"):
            LOGGER.info(
                "[H3 Studio - GGUF] Prompt writer stays on Qwen3.5-4B Q4_K_XL | backend=%s",
                writer_status.get("text_backend"),
            )
            return gguf.FASTEST_QWEN35_4B_GGUF
        if would_use_gguf:
            fallback = analyzer_stack.preferred_qwen35("4b")
            if fallback:
                LOGGER.warning(
                    "[H3 Studio - GGUF] GGUF text runtime is genuinely unavailable; prompt writer falls back to native %s",
                    fallback,
                )
                return fallback
            if same_as:
                return None
        return original_resolve_writer(value, analyzer_name)

    loader._resolve_analyzer = resolve_analyzer
    loader._resolve_prompt_writer = resolve_writer
    analyzer_stack.qwen35_gguf_status = status


__all__ = ["_complete_text_cli", "_complete_text_mtmd", "_llama_cli", "install"]
