import pytest

from prepflip.models import Question
from prepflip.services.answer_key import apply_answer_key, parse_answer_key


@pytest.mark.parametrize(
    "text",
    [
        "1-3, 2-1, 3-4",
        "1-3 2-1 3-4",
        "1.(3) 2.(1) 3.(4)",
        "1 (3)\n2 (1)\n3 (4)",
        "1(3) 2(1) 3(4)",
        "1: C  2: A  3: D",
        "1. c 2. a 3. d",
        "1) 3, 2) 1, 3) 4",
        "Q1-3, Q2-1, Q3-4",
        "1 3 2 1 3 4",
        "1=C 2=A 3=D",
    ],
)
def test_common_answer_key_formats(text: str) -> None:
    assert {n: idx for n, (idx, _) in parse_answer_key(text).items()} == {1: 2, 2: 0, 3: 3}


def test_numbers_are_not_split_or_confused() -> None:
    assert {n: idx for n, (idx, _) in parse_answer_key("10-2, 11-4, 120-1").items()} == {10: 1, 11: 3, 120: 0}
    assert parse_answer_key("NEET 2024 Answer Key") == {}


def make(number: int | None, options: int = 4) -> Question:
    return Question(id=f"q{number}", printed_number=number, text=f"Q{number}", options=[f"o{i}" for i in range(options)])


def test_matched_by_printed_number_not_position() -> None:
    questions = [make(57), make(58), make(56)]
    updated, result = apply_answer_key(questions, "56-1 57-2 58-3")
    assert [q.answer_index for q in updated] == [1, 2, 0]
    assert result.applied == 3


def test_answer_source_and_evidence_are_recorded() -> None:
    [q], _ = apply_answer_key([make(12)], "12.(3)")
    assert q.answer_source == "paper_key"
    assert q.answer_evidence == "Pasted answer key: 12 (3)"


def test_key_replaces_an_existing_answer() -> None:
    q = make(1).model_copy(update={"answer_index": 0, "answer_source": "student"})
    [updated], _ = apply_answer_key([q], "1-4")
    assert (updated.answer_index, updated.answer_source) == (3, "paper_key")


def test_reports_unmatched_ambiguous_and_invalid_entries() -> None:
    questions = [make(1), make(2, options=2), make(1), make(3)]  # numbering restarted: two Q1s
    updated, result = apply_answer_key(questions, "1-1 2-4 3-2 9-1")
    assert result.applied == 1
    assert result.unmatched == [9]
    assert result.ambiguous == [1]
    assert result.invalid == [2]
    assert [q.answer_index for q in updated] == [None, None, None, 1]
