"""The Python parser must give the same results as the prototype's JavaScript parser.

Expected results come from legacy/parser.js via parser_cases/generate_expected.mjs.
"""

import json
from pathlib import Path

import pytest

from prepflip.services.parser import parse_text
from prepflip.services.sets import to_questions
from prepflip.services.validator import question_issues

CASES_DIR = Path(__file__).parent / "parser_cases"
CASES: dict[str, str] = json.loads((CASES_DIR / "cases.json").read_text(encoding="utf-8"))
EXPECTED: dict[str, list[dict]] = json.loads((CASES_DIR / "expected_from_js.json").read_text(encoding="utf-8"))

# Where the Python parser deliberately differs from the prototype, with the reason.
INTENTIONAL_DIFFERENCES: dict[str, tuple[str, list[dict]]] = {
    "answer_word_after_a_question": (
        'The prototype read "Answer all questions…" as "answer A" and overwrote Q1\'s answer.',
        [
            {"text": "First", "options": ["a", "b"], "answer_index": 1, "codes": [], "notes": 0},
            {"text": "Second", "options": ["a", "b"], "answer_index": 0, "codes": [], "notes": 0},
        ],
    ),
}


def python_result(text: str) -> list[dict]:
    extracted = parse_text(text)
    return [
        {
            "text": q.text,
            "options": q.options,
            "answer_index": q.answer_index,
            "codes": sorted({i.code for i in question_issues(q)}),
            "notes": len(e.notes),
        }
        for e, q in zip(extracted, to_questions(extracted))
    ]


def test_every_case_has_expected_output() -> None:
    assert set(CASES) == set(EXPECTED), "Re-run: node backend/tests/parser_cases/generate_expected.mjs"


@pytest.mark.parametrize("name", sorted(CASES))
def test_matches_prototype_parser(name: str) -> None:
    if name in INTENTIONAL_DIFFERENCES:
        _, expected = INTENTIONAL_DIFFERENCES[name]
    else:
        expected = EXPECTED[name]
    assert python_result(CASES[name]) == expected


@pytest.mark.parametrize("name", sorted(INTENTIONAL_DIFFERENCES))
def test_intentional_differences_are_real(name: str) -> None:
    """If the prototype output ever matches, the entry is stale and should be removed."""
    assert EXPECTED[name] != INTENTIONAL_DIFFERENCES[name][1]
