"""Keep the complete TAEH3 step history for short H3 sampling runs.

The original async preview worker intentionally kept a queue of one item and
replaced stale jobs.  That is great for a single live thumbnail, but the Studio
frontend now exposes step pagination, so an 8-step run could finish with only
three or four decoded pages.  Keep a bounded history queue, include the final
step, and drain it before the wrapper releases the run id.
"""

from __future__ import annotations

import logging
import queue
import time
from contextlib import suppress

LOGGER = logging.getLogger(__name__)
_MAX_PENDING_PREVIEWS = 40
_DRAIN_SECONDS = 12.0
_INSTALLED = False


def install() -> None:
    global _INSTALLED
    if _INSTALLED:
        return
    _INSTALLED = True

    from .nodes import preview as module

    cls = module._PreviewWrapper
    if getattr(cls, "__h3studio_complete_history__", False):
        return

    def _ensure_worker(self):
        with self._worker_lock:
            if self._worker is not None and self._worker.is_alive():
                return
            self._jobs = queue.Queue(maxsize=_MAX_PENDING_PREVIEWS)
            self._worker = module.threading.Thread(
                target=self._worker_main,
                name=f"H3StudioTAEH3-{self.node_id or 'preview'}",
                daemon=True,
            )
            self._worker.start()

    def _enqueue(self, job):
        self._ensure_worker()
        try:
            self._jobs.put_nowait(job)
        except queue.Full:
            # Forty pending frames is already beyond H3 Studio's normal still
            # profiles.  Drop only the oldest item instead of constantly
            # replacing every intermediate step as the old queue-of-one did.
            try:
                self._jobs.get_nowait()
                self._jobs.task_done()
            except queue.Empty:
                pass
            with suppress(queue.Full):
                self._jobs.put_nowait(job)

    def _finish_run(self, run_id: str) -> None:
        if self._jobs is None:
            if self.active_run_id == run_id:
                self.active_run_id = ""
            return
        deadline = time.monotonic() + _DRAIN_SECONDS
        while time.monotonic() < deadline:
            if int(getattr(self._jobs, "unfinished_tasks", 0)) <= 0:
                break
            time.sleep(0.01)
        if int(getattr(self._jobs, "unfinished_tasks", 0)) > 0:
            LOGGER.warning(
                "H3 Studio TAEH3 history drain exceeded %.1fs; dropping only the remaining preview pages.",
                _DRAIN_SECONDS,
            )
            self._discard_pending()
            self._idle.wait(timeout=1.0)
        if self.active_run_id == run_id:
            self.active_run_id = ""

    def __call__(
        self,
        executor,
        noise,
        latent_image,
        sampler,
        sigmas,
        denoise_mask,
        callback,
        disable_pbar,
        seed,
        latent_shapes,
    ):
        import torch

        from .runtime_trace import emit as trace

        self.run_serial += 1
        self.first_frame_reported = False
        run_id = f"{self.node_id}:{self.run_serial}"
        self.active_run_id = run_id
        self._discard_pending()
        total_steps = max(0, len(sigmas) - 1) if sigmas is not None and hasattr(sigmas, "__len__") else 0
        sampling_started = time.perf_counter()
        trace_started = time.monotonic()
        LOGGER.info(
            "[H3 Studio] TAEH3 sampler wrapper entered | node=%s | steps=%d | latent_shapes=%s | decoder=cpu | history=complete",
            self.node_id,
            total_steps,
            latent_shapes,
        )
        trace(
            "sampling.begin",
            state=True,
            seed=seed,
            steps=total_steps,
            preview="cpu",
            preview_node=self.node_id,
        )
        try:
            self._reset_frontend(total_steps, run_id)
        except Exception as error:
            LOGGER.debug("H3 Studio preview reset event skipped: %s", error)

        def preview_callback(step, x0, x, callback_total_steps):
            # Pagination means each requested preview step is now useful.  The
            # previous implementation omitted the final denoising step and a
            # queue-of-one discarded intermediate pages before the UI saw them.
            if int(step) % self.every == 0:
                try:
                    elapsed_seconds = time.perf_counter() - sampling_started
                    completed_steps = max(1, int(step) + 1)
                    latent = module._first_h3_latent(torch, x0, latent_shapes)
                    snapshot = latent.detach().to(device="cpu", dtype=torch.float32, copy=True)
                    self._enqueue(
                        module._PreviewJob(
                            latent=snapshot,
                            step=int(step),
                            total_steps=int(callback_total_steps),
                            run_id=run_id,
                            elapsed_seconds=elapsed_seconds,
                            average_step_seconds=elapsed_seconds / completed_steps,
                        )
                    )
                except Exception as error:
                    LOGGER.warning("H3 Studio TAEH3 preview snapshot skipped: %s", error)
                    self._report_error(error, run_id)
            if callback is not None:
                callback(step, x0, x, callback_total_steps)

        try:
            result = executor(
                noise,
                latent_image,
                sampler,
                sigmas,
                denoise_mask,
                preview_callback,
                disable_pbar,
                seed,
                latent_shapes=latent_shapes,
            )
        except Exception as error:
            trace(
                "sampling.error",
                state=True,
                seed=seed,
                steps=total_steps,
                elapsed_s=time.monotonic() - trace_started,
                error_type=type(error).__name__,
                error=str(error),
            )
            raise
        finally:
            self._finish_run(run_id)
        trace(
            "sampling.end",
            state=True,
            seed=seed,
            steps=total_steps,
            elapsed_s=time.monotonic() - trace_started,
        )
        return result

    cls._ensure_worker = _ensure_worker
    cls._enqueue = _enqueue
    cls._finish_run = _finish_run
    cls.__call__ = __call__
    cls.__h3studio_complete_history__ = True
