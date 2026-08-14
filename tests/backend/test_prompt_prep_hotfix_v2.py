from __future__ import annotations

import pytest

from h3studio.prompt_prep_hotfix_v2 import _trim_words, _validated_records_compact


def test_verbose_valid_analyzer_record_is_compacted_not_rejected():
    description = " ".join(f"fact{i}" for i in range(131))
    records = _validated_records_compact(
        {"references": [{"ordinal": 1, "role": "character", "description": description}]},
        {1},
    )
    assert len(records[1]["description"].split()) == 90
    assert records[1]["description"].startswith("fact0 fact1")


def test_short_nonempty_analyzer_record_is_valid_structure():
    records = _validated_records_compact(
        {"references": [{"ordinal": 1, "role": "object", "description": "small red object on a table"}]},
        {1},
    )
    assert records[1]["description"] == "small red object on a table"


def test_analyzer_retry_is_reserved_for_real_contract_failure():
    with pytest.raises(ValueError, match="omitted"):
        _validated_records_compact({"references": []}, {1})
    with pytest.raises(ValueError, match="empty description"):
        _validated_records_compact({"references": [{"ordinal": 1, "description": ""}]}, {1})


def test_trim_words_is_deterministic_and_bounded():
    source = " ".join(str(index) for index in range(150))
    first = _trim_words(source, 90)
    second = _trim_words(source, 90)
    assert first == second
    assert len(first.split()) == 90
