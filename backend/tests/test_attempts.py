"""Attempt rules: question order, scoring and the practice-mode answer lock."""

from datetime import UTC, datetime

import pytest

from prepflip.models import Marking, Question, QuestionSet, Response, SetSource
from prepflip.services.attempts import AttemptError, create_attempt, question_order, save_responses, score, submit


def make_questions(n: int) -> list[Question]:
    return [Question(id=f"q{i}", text=f"Q{i}", options=["a", "b", "c", "d"], answer_index=i % 4) for i in range(n)]


def make_set(n: int = 5, status: str = "ready") -> QuestionSet:
    now = datetime.now(UTC)
    return QuestionSet(
        id="set-1", owner_id="u1", title="Mock", status=status, source=SetSource(kind="text"),
        questions=make_questions(n), created_at=now, updated_at=now,
    )


# ---------- Order ----------


def test_original_order_is_the_paper_order() -> None:
    ids = [f"q{i}" for i in range(10)]
    assert question_order(ids, "original") == ids


@pytest.mark.parametrize("n", [2, 3, 5, 45, 180])
def test_shuffle_is_a_genuine_reordering(n: int) -> None:
    ids = [f"q{i}" for i in range(n)]
    for seed in range(50):
        order = question_order(ids, "shuffle", seed)
        assert sorted(order) == sorted(ids)  # same questions, none lost or repeated
        assert order != ids  # never "shuffled" into the original order


def test_shuffle_with_the_same_seed_is_repeatable() -> None:
    ids = [f"q{i}" for i in range(20)]
    assert question_order(ids, "shuffle", 7) == question_order(ids, "shuffle", 7)
    assert question_order(ids, "shuffle", 7) != question_order(ids, "shuffle", 8)


def test_single_question_shuffle_is_just_that_question() -> None:
    assert question_order(["q0"], "shuffle", 1) == ["q0"]


# ---------- Creating ----------


def test_attempt_copies_the_questions() -> None:
    qs = make_set()
    attempt = create_attempt(owner_id="u1", qs=qs, mode="practice", order_kind="original")
    qs.questions[0].text = "edited after starting"
    assert attempt.questions[0].text == "Q0"
    assert attempt.set_title == "Mock"


def test_draft_set_cannot_be_practised() -> None:
    with pytest.raises(AttemptError) as err:
        create_attempt(owner_id="u1", qs=make_set(status="draft"), mode="practice", order_kind="original")
    assert err.value.status == 409


def test_exam_mode_is_not_available_yet() -> None:
    with pytest.raises(AttemptError) as err:
        create_attempt(owner_id="u1", qs=make_set(), mode="exam", order_kind="original")
    assert err.value.status == 422


def test_subset_keeps_paper_order() -> None:
    attempt = create_attempt(owner_id="u1", qs=make_set(), mode="practice", order_kind="original", question_ids=["q3", "q1"])
    assert attempt.order == ["q1", "q3"]


def test_subset_must_come_from_the_set() -> None:
    with pytest.raises(AttemptError):
        create_attempt(owner_id="u1", qs=make_set(), mode="practice", order_kind="original", question_ids=["q1", "nope"])


# ---------- Scoring ----------

QS = make_questions(4)  # answers: q0→0, q1→1, q2→2, q3→3


@pytest.mark.parametrize(
    ("choices", "expected"),
    [
        ({}, (0, 0, 4)),
        ({"q0": 0, "q1": 1, "q2": 2, "q3": 3}, (4, 0, 0)),
        ({"q0": 1, "q1": 0, "q2": 3, "q3": 2}, (0, 4, 0)),
        ({"q0": 0, "q1": 0, "q3": None}, (1, 1, 2)),
        ({"q2": 2}, (1, 0, 3)),
    ],
    ids=["nothing answered", "all correct", "all wrong", "mixed with explicit skip", "one correct"],
)
def test_counts(choices: dict, expected: tuple[int, int, int]) -> None:
    result = score(QS, {q: Response(choice=c) for q, c in choices.items()}, marking=None)
    assert (result.correct, result.wrong, result.skipped) == expected
    assert result.score is None and result.max_score is None  # practice mode has no marks


@pytest.mark.parametrize(
    ("correct", "wrong", "skipped", "expected_score"),
    [
        (180, 0, 0, 720),  # full marks in NEET
        (0, 0, 180, 0),
        (0, 180, 0, -180),
        (150, 20, 10, 580),
        (1, 3, 176, 1),
    ],
)
def test_neet_marking(correct: int, wrong: int, skipped: int, expected_score: int) -> None:
    questions = make_questions(correct + wrong + skipped)
    responses = {}
    for i, q in enumerate(questions):
        if i < correct:
            responses[q.id] = Response(choice=q.answer_index)
        elif i < correct + wrong:
            responses[q.id] = Response(choice=(q.answer_index + 1) % 4)
    result = score(questions, responses, Marking(correct=4, wrong=-1, skipped=0))
    assert (result.correct, result.wrong, result.skipped) == (correct, wrong, skipped)
    assert (result.score, result.max_score) == (expected_score, 720)


def test_per_question_outcomes() -> None:
    result = score(QS[:3], {"q0": Response(choice=0), "q1": Response(choice=3)}, None)
    assert [(p.question_id, p.choice, p.answer_index, p.outcome) for p in result.per_question] == [
        ("q0", 0, 0, "correct"),
        ("q1", 3, 1, "wrong"),
        ("q2", None, 2, "skipped"),
    ]


def test_submit_reports_in_asked_order_and_is_repeatable() -> None:
    attempt = create_attempt(owner_id="u1", qs=make_set(3), mode="practice", order_kind="shuffle", seed=1)
    attempt = save_responses(attempt, {attempt.order[0]: Response(choice=0, visited=True)})
    done = submit(attempt)
    assert done.status == "submitted"
    assert [p.question_id for p in done.result.per_question] == attempt.order
    assert submit(done) == done


# ---------- Practice-mode answer lock ----------


def practice_attempt():
    return create_attempt(owner_id="u1", qs=make_set(3), mode="practice", order_kind="original")


def test_an_answer_cannot_be_changed_in_practice_mode() -> None:
    attempt = save_responses(practice_attempt(), {"q0": Response(choice=1)})
    with pytest.raises(AttemptError) as err:
        save_responses(attempt, {"q0": Response(choice=2)})
    assert err.value.status == 409


@pytest.mark.parametrize("clearing", [{"q0": Response(choice=None)}, {}], ids=["set to none", "left out"])
def test_an_answer_cannot_be_cleared_in_practice_mode(clearing: dict) -> None:
    attempt = save_responses(practice_attempt(), {"q0": Response(choice=1)})
    with pytest.raises(AttemptError):
        save_responses(attempt, clearing)


def test_resending_the_same_responses_is_fine() -> None:
    attempt = save_responses(practice_attempt(), {"q0": Response(choice=1)})
    again = save_responses(attempt, {"q0": Response(choice=1, visited=True), "q1": Response(visited=True)})
    assert again.responses["q0"].choice == 1
    assert again.responses["q1"].visited


def test_responses_are_checked() -> None:
    with pytest.raises(AttemptError):
        save_responses(practice_attempt(), {"not-in-attempt": Response(choice=0)})
    with pytest.raises(AttemptError):
        save_responses(practice_attempt(), {"q0": Response(choice=4)})  # only options 0–3


def test_no_changes_after_submitting() -> None:
    with pytest.raises(AttemptError) as err:
        save_responses(submit(practice_attempt()), {"q0": Response(choice=0)})
    assert err.value.status == 409
