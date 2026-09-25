"""Creating and saving question sets. Every save goes through the validator."""

import uuid
from datetime import UTC, datetime

from prepflip.models import Question, QuestionSet, SetSource
from prepflip.services import validator
from prepflip.services.answer_key import KeyResult, apply_answer_key
from prepflip.services.parser import ExtractedQuestion


def to_questions(extracted: list[ExtractedQuestion]) -> list[Question]:
    questions = []
    for q in extracted:
        answer = q.answer_index
        # An answer letter beyond the options (e.g. "Ans: D" with three options) is dropped,
        # which leaves the question flagged MISSING_ANSWER for the student.
        if answer is not None and answer >= len(q.options):
            answer = None
        questions.append(Question(
            id=str(uuid.uuid4()),
            printed_number=q.printed_number,
            page=q.page,
            text=q.text,
            options=q.options,
            answer_index=answer,
            answer_source=q.answer_source if answer is not None else None,
        ))
    return questions


def tidy_answers(questions: list[Question]) -> list[Question]:
    """Keep answer_source consistent: an answer with no recorded source was chosen by the student."""
    tidy = []
    for q in questions:
        if q.answer_index is None:
            q = q.model_copy(update={"answer_source": None, "answer_evidence": None})
        elif q.answer_source is None:
            q = q.model_copy(update={"answer_source": "student"})
        tidy.append(q)
    return tidy


def build_set(
    *,
    id: str,
    owner_id: str,
    title: str,
    source: SetSource,
    questions: list[Question],
    created_at: datetime | None = None,
) -> QuestionSet:
    now = datetime.now(UTC)
    questions = validator.validate_set(tidy_answers(questions))
    return QuestionSet(
        id=id,
        owner_id=owner_id,
        title=title.strip(),
        status="ready" if validator.is_ready(questions) else "draft",
        source=source,
        questions=questions,
        created_at=created_at or now,
        updated_at=now,
    )


def with_answer_key(qs: QuestionSet, key_text: str) -> tuple[QuestionSet, KeyResult]:
    questions, result = apply_answer_key(qs.questions, key_text)
    updated = build_set(
        id=qs.id, owner_id=qs.owner_id, title=qs.title, source=qs.source,
        questions=questions, created_at=qs.created_at,
    )
    return updated, result


def default_title(now: datetime | None = None) -> str:
    return f"Pasted questions, {(now or datetime.now()).strftime('%d %b %Y %H:%M')}"
