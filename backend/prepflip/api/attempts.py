from datetime import UTC, datetime
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from prepflip.api.deps import CurrentUser, StoreDep, get_owned
from prepflip.models import MAX_QUESTIONS, Attempt, Question, Response
from prepflip.services import attempts
from prepflip.services.attempts import AttemptError

router = APIRouter(prefix="/attempts", tags=["attempts"])


class AttemptIn(BaseModel):
    set_id: UUID
    mode: Literal["practice", "exam"] = "practice"
    order: Literal["original", "shuffle"] = "original"
    # Practise only these questions (e.g. "retry wrong only"). Paper order is kept.
    question_ids: list[str] | None = Field(default=None, max_length=1000)
    # Makes "shuffle" repeatable, e.g. in tests.
    seed: int | None = None


class ResponsesIn(BaseModel):
    responses: dict[str, Response] = Field(max_length=1000)


class AttemptCopyIn(BaseModel):
    """The browser's copy of an attempt, sent back to restore it. Its result, if any, is ignored and re-scored."""

    set_id: UUID
    set_title: str = Field(min_length=1, max_length=200)
    mode: Literal["practice", "exam"]
    order_kind: Literal["original", "shuffle"]
    questions: list[Question] = Field(max_length=MAX_QUESTIONS)
    order: list[str] = Field(max_length=MAX_QUESTIONS)
    started_at: datetime
    status: Literal["in_progress", "submitted"]
    responses: dict[str, Response] = Field(default={}, max_length=MAX_QUESTIONS)
    submitted_at: datetime | None = None


class AttemptSummary(BaseModel):
    id: str
    set_id: str
    set_title: str
    mode: Literal["practice", "exam"]
    status: Literal["in_progress", "submitted"]
    question_count: int
    answered_count: int
    correct: int | None
    started_at: datetime
    updated_at: datetime

    @classmethod
    def of(cls, a: Attempt) -> "AttemptSummary":
        return cls(
            id=a.id, set_id=a.set_id, set_title=a.set_title, mode=a.mode, status=a.status,
            question_count=len(a.questions),
            answered_count=sum(1 for r in a.responses.values() if r.choice is not None),
            correct=a.result.correct if a.result else None,
            started_at=a.started_at, updated_at=a.updated_at,
        )


def _fail(err: AttemptError) -> HTTPException:
    return HTTPException(status_code=err.status, detail=err.message)


@router.post("", status_code=201)
def create_attempt(body: AttemptIn, user: CurrentUser, store: StoreDep) -> Attempt:
    qs = get_owned(store.sets, str(body.set_id), user)
    try:
        attempt = attempts.create_attempt(
            owner_id=user.id, qs=qs, mode=body.mode, order_kind=body.order,
            question_ids=body.question_ids, seed=body.seed,
        )
    except AttemptError as err:
        raise _fail(err) from err
    return store.attempts.put(attempt)


@router.get("")
def list_attempts(
    user: CurrentUser, store: StoreDep, status: Literal["in_progress", "submitted"] | None = None
) -> list[AttemptSummary]:
    found = store.attempts.list(owner_id=user.id, **({"status": status} if status else {}))
    return [AttemptSummary.of(a) for a in sorted(found, key=lambda a: a.updated_at, reverse=True)]


@router.get("/{attempt_id}")
def get_attempt(attempt_id: UUID, user: CurrentUser, store: StoreDep) -> Attempt:
    return get_owned(store.attempts, str(attempt_id), user)


@router.put("/{attempt_id}")
def put_attempt(attempt_id: UUID, body: AttemptCopyIn, user: CurrentUser, store: StoreDep) -> Attempt:
    """Create or update an attempt from the browser's copy, e.g. after a server restart. Safe to repeat."""
    existing = store.attempts.get(str(attempt_id))
    if existing is not None and existing.owner_id != user.id:
        raise HTTPException(status_code=404, detail="Not found")
    copy = Attempt(**body.model_dump(mode="json"), id=str(attempt_id), owner_id=user.id, updated_at=datetime.now(UTC))
    try:
        attempt = attempts.restore_attempt(copy, existing)
    except AttemptError as err:
        raise _fail(err) from err
    return store.attempts.put(attempt)


@router.put("/{attempt_id}/responses")
def save_responses(attempt_id: UUID, body: ResponsesIn, user: CurrentUser, store: StoreDep) -> Attempt:
    """Save the whole set of responses. Sending the same responses again is harmless."""
    attempt = get_owned(store.attempts, str(attempt_id), user)
    try:
        attempt = attempts.save_responses(attempt, body.responses)
    except AttemptError as err:
        raise _fail(err) from err
    return store.attempts.put(attempt)


@router.post("/{attempt_id}/submit")
def submit_attempt(attempt_id: UUID, user: CurrentUser, store: StoreDep) -> Attempt:
    attempt = get_owned(store.attempts, str(attempt_id), user)
    return store.attempts.put(attempts.submit(attempt))
