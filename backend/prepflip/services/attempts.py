"""Creating attempts, saving answers and scoring. The server's score is the official one."""

import random
import uuid
from datetime import UTC, datetime
from typing import Literal

from prepflip.models import Attempt, Marking, Question, QuestionOutcome, QuestionSet, Response, Result


class AttemptError(Exception):
    """A request that breaks an attempt rule. `status` is the HTTP status to answer with."""

    def __init__(self, status: int, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.message = message


def question_order(ids: list[str], kind: Literal["original", "shuffle"], seed: int | None = None) -> list[str]:
    """Original paper order, or a shuffle that is guaranteed to differ from it (when that's possible)."""
    order = list(ids)
    if kind == "original" or len(order) < 2:
        return order
    rng = random.Random(seed)
    rng.shuffle(order)
    if order == ids:
        # Very rare for real sets, common for 2–3 questions: rotate so "Shuffle" visibly shuffles.
        order = order[1:] + order[:1]
    return order


def _snapshot(q: Question) -> Question:
    """The attempt's own copy of a question, without review-only fields."""
    return q.model_copy(update={"issues": [], "acknowledged": [], "extraction_flags": []})


def create_attempt(
    *,
    owner_id: str,
    qs: QuestionSet,
    mode: Literal["practice", "exam"],
    order_kind: Literal["original", "shuffle"],
    question_ids: list[str] | None = None,
    seed: int | None = None,
) -> Attempt:
    if mode == "exam":
        raise AttemptError(422, "Exam mode is coming soon. Use practice mode for now.")
    if qs.status != "ready":
        raise AttemptError(409, "Some questions still need checking. Fix or remove the flagged questions first.")

    questions = qs.questions
    if question_ids is not None:
        wanted = set(question_ids)
        unknown = wanted - {q.id for q in questions}
        if unknown:
            raise AttemptError(422, f"These questions are not in the set: {', '.join(sorted(unknown))}")
        if not wanted:
            raise AttemptError(422, "Choose at least one question.")
        questions = [q for q in questions if q.id in wanted]  # keep paper order

    now = datetime.now(UTC)
    return Attempt(
        id=str(uuid.uuid4()),
        owner_id=owner_id,
        set_id=qs.id,
        set_title=qs.title,
        mode=mode,
        order_kind=order_kind,
        questions=[_snapshot(q) for q in questions],
        order=question_order([q.id for q in questions], order_kind, seed),
        status="in_progress",
        started_at=now,
        updated_at=now,
    )


def _check_responses(questions: list[Question], responses: dict[str, Response]) -> None:
    options = {q.id: len(q.options) for q in questions}
    for qid, response in responses.items():
        if qid not in options:
            raise AttemptError(422, f"Question {qid} is not in this attempt.")
        if response.choice is not None and not 0 <= response.choice < options[qid]:
            raise AttemptError(422, f"Question {qid}: that option doesn't exist.")


def save_responses(attempt: Attempt, responses: dict[str, Response]) -> Attempt:
    """Replace the attempt's responses with the full set sent by the browser. Safe to repeat."""
    if attempt.status == "submitted":
        raise AttemptError(409, "This attempt has already been submitted.")
    _check_responses(attempt.questions, responses)
    for qid, response in responses.items():
        if attempt.mode == "practice":
            before = attempt.responses.get(qid)
            if before and before.choice is not None and response.choice != before.choice:
                raise AttemptError(409, "In practice mode an answer can't be changed once it's chosen.")
    if attempt.mode == "practice":
        # A response missing from the request must not silently erase a locked-in answer.
        for qid, before in attempt.responses.items():
            if before.choice is not None and qid not in responses:
                raise AttemptError(409, "In practice mode an answer can't be changed once it's chosen.")
    return attempt.model_copy(update={"responses": responses, "updated_at": datetime.now(UTC)})


def score(questions: list[Question], responses: dict[str, Response], marking: Marking | None) -> Result:
    per_question = []
    for q in questions:
        choice = responses.get(q.id, Response()).choice
        if choice is None:
            outcome = "skipped"
        elif choice == q.answer_index:
            outcome = "correct"
        else:
            outcome = "wrong"
        per_question.append(QuestionOutcome(question_id=q.id, choice=choice, answer_index=q.answer_index, outcome=outcome))

    counts = {kind: sum(1 for p in per_question if p.outcome == kind) for kind in ("correct", "wrong", "skipped")}
    result = Result(**counts, per_question=per_question)
    if marking is not None:
        result.score = counts["correct"] * marking.correct + counts["wrong"] * marking.wrong + counts["skipped"] * marking.skipped
        result.max_score = len(questions) * marking.correct
    return result


def submit(attempt: Attempt, submitted_at: datetime | None = None) -> Attempt:
    """Score and close the attempt. Submitting again returns the same result."""
    if attempt.status == "submitted":
        return attempt
    # Report outcomes in the order the questions were asked.
    by_id = {q.id: q for q in attempt.questions}
    asked = [by_id[qid] for qid in attempt.order]
    now = datetime.now(UTC)
    return attempt.model_copy(update={
        "status": "submitted",
        "result": score(asked, attempt.responses, attempt.marking),
        "submitted_at": submitted_at or now,
        "updated_at": now,
    })


def merge_responses(attempt: Attempt, incoming: dict[str, Response]) -> dict[str, Response]:
    """Combine the server's responses with a browser's copy, which may be a little ahead or behind.

    In practice mode the first answer counts, so an answer the server already has always wins.
    """
    merged = dict(attempt.responses)
    for qid, theirs in incoming.items():
        ours = merged.get(qid)
        if ours is None:
            merged[qid] = theirs
            continue
        choice = ours.choice if ours.choice is not None else theirs.choice
        merged[qid] = Response(choice=choice, marked=theirs.marked, visited=ours.visited or theirs.visited)
    return merged


def restore_attempt(copy: Attempt, existing: Attempt | None) -> Attempt:
    """Create or update an attempt from the browser's copy (e.g. after a server restart). Safe to repeat.

    The browser can't forge a result: a submitted copy is scored again here. If the server
    already has the attempt, its questions and order are kept and only new answers are added.
    """
    if copy.mode == "exam":
        raise AttemptError(422, "Exam mode is coming soon. Use practice mode for now.")
    if existing is not None:
        if existing.status == "submitted":
            return existing
        _check_responses(existing.questions, copy.responses)
        attempt = existing.model_copy(update={
            "responses": merge_responses(existing, copy.responses), "updated_at": datetime.now(UTC),
        })
        return submit(attempt, copy.submitted_at) if copy.status == "submitted" else attempt

    ids = [q.id for q in copy.questions]
    if not ids or len(ids) != len(set(ids)):
        raise AttemptError(422, "An attempt needs questions with unique ids.")
    if sorted(copy.order) != sorted(ids):
        raise AttemptError(422, "The question order must list every question exactly once.")
    for q in copy.questions:
        if q.answer_index is not None and not 0 <= q.answer_index < len(q.options):
            raise AttemptError(422, f"Question {q.id}: answer_index is not one of its options.")
    _check_responses(copy.questions, copy.responses)
    attempt = copy.model_copy(update={
        "questions": [_snapshot(q) for q in copy.questions],
        "status": "in_progress",
        "result": None,
        "submitted_at": None,
        "updated_at": datetime.now(UTC),
    })
    return submit(attempt, copy.submitted_at) if copy.status == "submitted" else attempt
