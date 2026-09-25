from datetime import datetime
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel, Field, model_validator

from prepflip.api.deps import CurrentUser, StoreDep, get_owned
from prepflip.models import Question, QuestionSet, SetSource
from prepflip.services import sets

router = APIRouter(prefix="/sets", tags=["sets"])

MAX_QUESTIONS = 500


class SetIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    # Only used when the set is created (including restores from the browser); later saves keep the original.
    source: SetSource = SetSource(kind="text")
    questions: list[Question] = Field(max_length=MAX_QUESTIONS)

    @model_validator(mode="after")
    def check_questions(self) -> "SetIn":
        ids = [q.id for q in self.questions]
        if len(ids) != len(set(ids)):
            raise ValueError("Question ids must be unique within a set.")
        for q in self.questions:
            if q.answer_index is not None and not 0 <= q.answer_index < len(q.options):
                raise ValueError(f"Question {q.id}: answer_index is not one of its options.")
        return self


class SetSummary(BaseModel):
    id: str
    title: str
    status: Literal["draft", "ready"]
    question_count: int
    flagged_count: int
    source_kind: Literal["pdf", "text"]
    updated_at: datetime

    @classmethod
    def of(cls, qs: QuestionSet) -> "SetSummary":
        return cls(
            id=qs.id, title=qs.title, status=qs.status, question_count=len(qs.questions),
            flagged_count=sum(1 for q in qs.questions if q.issues),
            source_kind=qs.source.kind, updated_at=qs.updated_at,
        )


class AnswerKeyIn(BaseModel):
    text: str = Field(min_length=1, max_length=20_000)


class AnswerKeyOut(BaseModel):
    set: QuestionSet
    applied: int
    unmatched: list[int]
    ambiguous: list[int]
    invalid: list[int]


@router.get("")
def list_sets(user: CurrentUser, store: StoreDep) -> list[SetSummary]:
    owned = store.sets.list(owner_id=user.id)
    return [SetSummary.of(s) for s in sorted(owned, key=lambda s: s.updated_at, reverse=True)]


@router.get("/{set_id}")
def get_set(set_id: UUID, user: CurrentUser, store: StoreDep) -> QuestionSet:
    return get_owned(store.sets, str(set_id), user)


@router.put("/{set_id}")
def put_set(set_id: UUID, body: SetIn, user: CurrentUser, store: StoreDep) -> QuestionSet:
    """Create or replace a set. The id is chosen by the browser, so saving the same data twice is harmless."""
    existing = store.sets.get(str(set_id))
    if existing is not None and existing.owner_id != user.id:
        raise HTTPException(status_code=404, detail="Not found")
    qs = sets.build_set(
        id=str(set_id),
        owner_id=user.id,
        title=body.title,
        source=existing.source if existing else body.source,
        questions=body.questions,
        created_at=existing.created_at if existing else None,
    )
    return store.sets.put(qs)


@router.delete("/{set_id}", status_code=204)
def delete_set(set_id: UUID, user: CurrentUser, store: StoreDep) -> Response:
    get_owned(store.sets, str(set_id), user)
    store.sets.delete(str(set_id))
    return Response(status_code=204)


@router.post("/{set_id}/answer-key")
def apply_answer_key(set_id: UUID, body: AnswerKeyIn, user: CurrentUser, store: StoreDep) -> AnswerKeyOut:
    """Fill in answers from a pasted key, matched by printed question number."""
    qs = get_owned(store.sets, str(set_id), user)
    updated, result = sets.with_answer_key(qs, body.text)
    store.sets.put(updated)
    return AnswerKeyOut(set=updated, **result.__dict__)
