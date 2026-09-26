"""Stored entities. Each one is a pydantic model kept as one document in the store.

Further entities (ImportJob, ...) are added by later milestones.
"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class Document(BaseModel):
    """Base for anything kept in the store. `id` is the store key."""

    id: str


class OwnedDocument(Document):
    """A document that belongs to one user. Other users get 404 for it (see api.deps.get_owned)."""

    owner_id: str


class User(Document):
    username: str
    password_hash: str  # argon2
    display_name: str


class Session(Document):
    """A login session. `id` is the SHA-256 hash of the cookie token, never the token itself."""

    user_id: str
    expires_at: datetime


# ---------- Questions ----------

IssueCode = Literal[
    # Blocking: must be fixed (or the question removed) before practising.
    "EMPTY_QUESTION",
    "MISSING_ANSWER",
    "FEW_OPTIONS",
    "EMPTY_OPTION",
    "UNREADABLE_CHARS",
    # Advisory: the student confirms with one "I've checked it" click.
    "NEEDS_FIGURE",
    "AI_UNCERTAIN",
    "ANSWER_NO_EVIDENCE",
    "NUMBERING_GAP",
    "DUPLICATE_NUMBER",
]
BLOCKING_CODES: frozenset[str] = frozenset(
    {"EMPTY_QUESTION", "MISSING_ANSWER", "FEW_OPTIONS", "EMPTY_OPTION", "UNREADABLE_CHARS"}
)

# Issues only an extractor can know about (e.g. "this needs the diagram"). The validator turns them into issues.
ExtractionFlagCode = Literal["NEEDS_FIGURE", "AI_UNCERTAIN", "ANSWER_NO_EVIDENCE"]

AnswerSource = Literal["paper_inline", "paper_key", "student"]

MAX_OPTIONS = 10
MAX_QUESTIONS = 500  # per set or attempt


class Issue(BaseModel):
    code: IssueCode
    message: str
    blocking: bool


class ExtractionFlag(BaseModel):
    code: ExtractionFlagCode
    message: str


class Question(BaseModel):
    id: str
    # Position in the paper. Questions are never re-sorted by printed number,
    # because NEET numbering can restart or skip between sections.
    seq: int = 0
    printed_number: int | None = None
    page: int | None = None
    text: str = Field(max_length=5000)
    options: list[str] = Field(max_length=MAX_OPTIONS)
    answer_index: int | None = None
    answer_source: AnswerSource | None = None
    answer_evidence: str | None = Field(default=None, max_length=500)
    explanation: str | None = Field(default=None, max_length=5000)
    extraction_flags: list[ExtractionFlag] = []
    # Advisory issue codes the student has confirmed. Blocking codes here are ignored.
    acknowledged: list[IssueCode] = []
    # Set by the validator only; never trusted from the client.
    issues: list[Issue] = []


class SetSource(BaseModel):
    kind: Literal["pdf", "text"]
    filename: str | None = None
    page_count: int | None = None
    sha256: str | None = None


class QuestionSet(OwnedDocument):
    title: str
    # "ready" once no question has an unresolved issue.
    status: Literal["draft", "ready"]
    source: SetSource
    questions: list[Question]
    created_at: datetime
    updated_at: datetime


# ---------- Attempts ----------


class Response(BaseModel):
    choice: int | None = None
    marked: bool = False  # "mark for review" (exam mode)
    visited: bool = False


class Marking(BaseModel):
    correct: int = 4
    wrong: int = -1
    skipped: int = 0


Outcome = Literal["correct", "wrong", "skipped"]


class QuestionOutcome(BaseModel):
    question_id: str
    choice: int | None
    answer_index: int | None
    outcome: Outcome


class Result(BaseModel):
    correct: int
    wrong: int
    skipped: int
    # Only when a marking scheme is used (exam mode).
    score: int | None = None
    max_score: int | None = None
    per_question: list[QuestionOutcome]


class Attempt(OwnedDocument):
    set_id: str
    set_title: str
    mode: Literal["practice", "exam"]
    order_kind: Literal["original", "shuffle"]
    # A copy of the questions, so editing the set later can't change this attempt or its result.
    questions: list[Question]
    # Question ids in the order they are asked.
    order: list[str]
    marking: Marking | None = None
    started_at: datetime
    deadline_at: datetime | None = None
    status: Literal["in_progress", "submitted"]
    responses: dict[str, Response] = {}
    result: Result | None = None
    submitted_at: datetime | None = None
    updated_at: datetime
