import uuid

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from prepflip.api.deps import CurrentUser, StoreDep
from prepflip.models import QuestionSet, SetSource
from prepflip.services import sets
from prepflip.services.answer_key import apply_answer_key
from prepflip.services.parser import parse_text

router = APIRouter(prefix="/imports", tags=["imports"])


class TextImportIn(BaseModel):
    text: str = Field(min_length=1, max_length=300_000)
    answer_key: str | None = Field(default=None, max_length=20_000)
    title: str | None = Field(default=None, max_length=200)


@router.post("/text", status_code=201)
def import_text(body: TextImportIn, user: CurrentUser, store: StoreDep) -> QuestionSet:
    """Parse pasted questions (and optionally an answer key) into a new draft set."""
    questions = sets.to_questions(parse_text(body.text))
    if not questions:
        raise HTTPException(status_code=422, detail="No questions found. Check the format and try again.")
    if body.answer_key and body.answer_key.strip():
        questions, _ = apply_answer_key(questions, body.answer_key)
    qs = sets.build_set(
        id=str(uuid.uuid4()),
        owner_id=user.id,
        title=(body.title or "").strip() or sets.default_title(),
        source=SetSource(kind="text"),
        questions=questions,
    )
    return store.sets.put(qs)
