"""One test per issue code, plus acknowledgement and the ready rule."""

import itertools
from typing import get_args

import pytest

from prepflip.models import BLOCKING_CODES, ExtractionFlag, IssueCode, Question
from prepflip.services.validator import is_ready, validate_set

_ids = itertools.count()


def q(text="What is 2 + 2?", options=("3", "4"), answer=1, number=None, **extra) -> Question:
    return Question(
        id=f"q{next(_ids)}", text=text, options=list(options), answer_index=answer,
        printed_number=number, **extra,
    )


def codes(question: Question) -> list[str]:
    return [i.code for i in question.issues]


def only(question: Question) -> list[str]:
    return codes(validate_set([question])[0])


def test_a_clean_question_has_no_issues() -> None:
    assert only(q()) == []


def test_EMPTY_QUESTION() -> None:
    assert only(q(text="   ")) == ["EMPTY_QUESTION"]


def test_EMPTY_OPTION_names_the_option() -> None:
    [checked] = validate_set([q(options=["3", " ", "5"])])
    assert codes(checked) == ["EMPTY_OPTION"]
    assert "Option B" in checked.issues[0].message


def test_FEW_OPTIONS() -> None:
    assert only(q(options=["4"], answer=0)) == ["FEW_OPTIONS"]


def test_MISSING_ANSWER() -> None:
    assert only(q(answer=None)) == ["MISSING_ANSWER"]


@pytest.mark.parametrize("bad", ["�", "", "\x07"])
def test_UNREADABLE_CHARS(bad: str) -> None:
    assert only(q(text=f"Find {bad} here")) == ["UNREADABLE_CHARS"]
    assert only(q(options=["3", f"4{bad}"])) == ["UNREADABLE_CHARS"]


def test_real_symbols_are_not_unreadable() -> None:
    assert only(q(text="Is x² → α ≤ √3 and Δ H = −5 kJ, 10⁻¹⁹ C?")) == []


@pytest.mark.parametrize("code", ["NEEDS_FIGURE", "AI_UNCERTAIN", "ANSWER_NO_EVIDENCE"])
def test_extraction_flags_become_advisory_issues(code: str) -> None:
    [checked] = validate_set([q(extraction_flags=[ExtractionFlag(code=code, message="Check this one.")])])
    assert [(i.code, i.message, i.blocking) for i in checked.issues] == [(code, "Check this one.", False)]


def test_NUMBERING_GAP_single_missing_question() -> None:
    checked = validate_set([q(number=56), q(number=58)])
    assert codes(checked[0]) == []
    assert codes(checked[1]) == ["NUMBERING_GAP"]
    assert checked[1].issues[0].message.startswith("Q57 missing between Q56 and Q58")


def test_NUMBERING_GAP_several_missing_questions() -> None:
    checked = validate_set([q(number=3), q(number=7)])
    assert checked[1].issues[0].message.startswith("Q4–Q6 missing")


def test_NUMBERING_GAP_out_of_order() -> None:
    checked = validate_set([q(number=5), q(number=6), q(number=4)])
    assert codes(checked[2]) == ["NUMBERING_GAP"]
    assert "comes after Q6" in checked[2].issues[0].message


def test_DUPLICATE_NUMBER() -> None:
    checked = validate_set([q(number=1), q(number=2), q(number=2)])
    assert [codes(c) for c in checked] == [[], [], ["DUPLICATE_NUMBER"]]


def test_numbering_restart_starts_a_new_section() -> None:
    """Physics 1–3, then Chemistry 1–2: not duplicates or gaps."""
    checked = validate_set([q(number=n) for n in (1, 2, 3, 1, 2)])
    assert [codes(c) for c in checked] == [[]] * 5


def test_unnumbered_questions_are_skipped_by_numbering_checks() -> None:
    checked = validate_set([q(number=1), q(number=None), q(number=2)])
    assert [codes(c) for c in checked] == [[], [], []]


def test_every_issue_code_is_covered() -> None:
    all_codes = set(get_args(IssueCode))
    tested = {code for code in all_codes for name in globals() if name.startswith(f"test_{code}")}
    tested |= {"NEEDS_FIGURE", "AI_UNCERTAIN", "ANSWER_NO_EVIDENCE"}  # parametrised above
    assert tested == all_codes


# ---------- Acknowledgement and readiness ----------


def test_acknowledged_advisory_issue_is_resolved() -> None:
    [checked] = validate_set([q(number=58, acknowledged=["NUMBERING_GAP"])])
    assert codes(checked) == []
    checked = validate_set([q(number=56), q(number=58, acknowledged=["NUMBERING_GAP"])])
    assert codes(checked[1]) == []


def test_blocking_issues_cannot_be_acknowledged() -> None:
    assert only(q(answer=None, acknowledged=["MISSING_ANSWER"])) == ["MISSING_ANSWER"]


def test_blocking_flags_match_the_design() -> None:
    assert BLOCKING_CODES == {"EMPTY_QUESTION", "MISSING_ANSWER", "FEW_OPTIONS", "EMPTY_OPTION", "UNREADABLE_CHARS"}


def test_seq_follows_list_order() -> None:
    assert [c.seq for c in validate_set([q(number=3), q(number=1), q(number=2)])] == [0, 1, 2]


def test_issues_sent_by_a_client_are_replaced() -> None:
    from prepflip.models import Issue

    fake = q(issues=[Issue(code="MISSING_ANSWER", message="made up", blocking=True)])
    assert only(fake) == []


def test_ready_only_when_nothing_is_flagged() -> None:
    assert is_ready(validate_set([q(), q()]))
    assert not is_ready(validate_set([q(), q(answer=None)]))
    assert not is_ready(validate_set([q(extraction_flags=[ExtractionFlag(code="NEEDS_FIGURE", message="x")])]))
    assert not is_ready([])
