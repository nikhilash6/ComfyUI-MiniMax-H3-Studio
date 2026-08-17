from __future__ import annotations

import json
import subprocess
import sys
import threading
from pathlib import Path

from h3studio import telemetry
from h3studio.telemetry import AggregateReporter


def test_default_endpoint_targets_the_deployed_counter() -> None:
    assert telemetry.DEFAULT_ENDPOINT == "https://h3-studio-counter.h3-studio-counter.workers.dev/v1/report"


def test_aggregate_reporter_sends_only_batched_integer_counts() -> None:
    sent: list[int] = []
    delivered = threading.Event()

    def sender(count: int) -> None:
        sent.append(count)
        delivered.set()

    reporter = AggregateReporter(batch_size=3, flush_seconds=60, sender=sender, enabled=lambda: True)
    reporter.record()
    reporter.record(2)
    assert delivered.wait(1)
    assert sent == [3]


def test_aggregate_reporter_opt_out_drops_counts() -> None:
    sent: list[int] = []
    reporter = AggregateReporter(batch_size=1, sender=sent.append, enabled=lambda: False)
    reporter.record(5)
    assert sent == []


def test_aggregate_reporter_network_failure_never_reaches_caller() -> None:
    delivered = threading.Event()

    def failing_sender(_count: int) -> None:
        delivered.set()
        raise OSError("offline")

    reporter = AggregateReporter(batch_size=1, sender=failing_sender, enabled=lambda: True)
    reporter.record()
    assert delivered.wait(1)


def test_network_payload_contains_no_generation_or_installation_data(monkeypatch) -> None:
    captured = {}

    class Response:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return None

        def read(self, _size):
            return b"{}"

    def open_request(request, timeout):
        captured["body"] = json.loads(request.data)
        captured["headers"] = dict(request.header_items())
        captured["timeout"] = timeout
        return Response()

    monkeypatch.setenv("H3STUDIO_TELEMETRY_ENDPOINT", "https://counter.example/v1/report")
    monkeypatch.setattr(telemetry.urllib.request, "urlopen", open_request)
    telemetry._post_count(7)

    assert captured["body"] == {"count": 7, "schema": 1}
    assert captured["timeout"] == 2.5
    assert "Authorization" not in captured["headers"]


def test_cli_disable_creates_persistent_opt_out_and_verifies_state(monkeypatch, tmp_path, capsys) -> None:
    opt_out = tmp_path / ".h3studio-telemetry-disabled"
    monkeypatch.setattr(telemetry, "OPT_OUT_FILE", opt_out)
    monkeypatch.delenv("H3STUDIO_TELEMETRY", raising=False)

    assert telemetry._cli(["disable"]) == 0
    assert opt_out.is_file()
    assert telemetry.telemetry_enabled() is False
    assert capsys.readouterr().out.strip() == "H3 telemetry: DISABLED"


def test_module_disable_command_works_end_to_end() -> None:
    repo_root = Path(__file__).resolve().parents[2]
    opt_out = repo_root / ".h3studio-telemetry-disabled"
    opt_out.unlink(missing_ok=True)
    try:
        result = subprocess.run(
            [sys.executable, "-m", "h3studio.telemetry", "disable"],
            cwd=repo_root,
            capture_output=True,
            text=True,
            check=False,
        )
        assert result.returncode == 0
        assert result.stdout.strip() == "H3 telemetry: DISABLED"
        assert opt_out.is_file()
    finally:
        opt_out.unlink(missing_ok=True)
