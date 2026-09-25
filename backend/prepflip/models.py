"""Stored entities. Each one is a pydantic model kept as one document in the store.

Further entities (ImportJob, QuestionSet, Attempt, ...) are added by later milestones.
"""

from datetime import datetime

from pydantic import BaseModel


class Document(BaseModel):
    """Base for anything kept in the store. `id` is the store key."""

    id: str


class User(Document):
    username: str
    password_hash: str  # argon2
    display_name: str


class Session(Document):
    """A login session. `id` is the SHA-256 hash of the cookie token, never the token itself."""

    user_id: str
    expires_at: datetime
