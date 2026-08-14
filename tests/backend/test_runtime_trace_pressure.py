from __future__ import annotations

import logging

import h3studio.runtime_trace as runtime_trace


def test_stage_delta_names_report_swap_major_fault_and_io_changes() -> None:
    before = {
        "vm_pgmajfault": 10,
        "vm_pswpin": 20,
        "vm_pswpout": 30,
        "vm_pgscan_total": 40,
        "vm_pgsteal_total": 50,
        "io_read_gib": 1.0,
        "io_write_gib": 2.0,
        "page_fault_major": 3,
    }
    after = {
        "vm_pgmajfault": 14,
        "vm_pswpin": 27,
        "vm_pswpout": 35,
        "vm_pgscan_total": 55,
        "vm_pgsteal_total": 60,
        "io_read_gib": 2.5,
        "io_write_gib": 2.25,
        "page_fault_major": 5,
    }

    deltas = runtime_trace._stage_deltas(before, after)

    assert deltas["delta_pgmajfault"] == 4
    assert deltas["delta_pswpin"] == 7
    assert deltas["delta_pswpout"] == 5
    assert deltas["delta_pgscan"] == 15
    assert deltas["delta_pgsteal"] == 10
    assert deltas["delta_io_read_gib"] == 1.5
    assert deltas["delta_io_write_gib"] == 0.25
    assert deltas["delta_process_major_faults"] == 2


def test_span_emits_begin_and_end_snapshots_with_deltas(monkeypatch, caplog) -> None:
    states = iter([
        {"vm_pgmajfault": 100, "vm_pswpin": 5, "io_read_gib": 1.0},
        {"vm_pgmajfault": 103, "vm_pswpin": 9, "io_read_gib": 2.0},
    ])
    monkeypatch.setattr(runtime_trace, "snapshot", lambda: next(states))
    monkeypatch.setenv("H3STUDIO_RUNTIME_TRACE", "1")

    with caplog.at_level(logging.INFO, logger=runtime_trace.__name__), runtime_trace.span(
        "conditioning.test", state=True
    ):
        pass

    assert "event=conditioning.test.begin" in caplog.text
    assert "event=conditioning.test.end" in caplog.text
    assert "delta_pgmajfault=3" in caplog.text
    assert "delta_pswpin=4" in caplog.text
    assert "delta_io_read_gib=1.0000" in caplog.text
