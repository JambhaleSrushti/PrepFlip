"""Storage behind a small interface, so a database can replace memory later.

Every entity type gets a collection with get / put / list / delete. Only this
package changes when Postgres is added; the rest of the app uses `Store`.
"""

from typing import Any, Generic, Protocol, TypeVar

from prepflip.models import Document, QuestionSet, Session, User

from .memory import InMemoryStore

T = TypeVar("T", bound=Document)


class Collection(Protocol, Generic[T]):
    def get(self, id: str) -> T | None:
        """Return a copy of the document, or None."""

    def put(self, doc: T) -> T:
        """Create or replace the document with this id."""

    def list(self, **filters: Any) -> list[T]:
        """Documents whose fields equal all the given filters, in insertion order."""

    def delete(self, id: str) -> bool:
        """Remove the document. Returns False if it did not exist."""


class Store(Protocol):
    users: Collection[User]
    sessions: Collection[Session]
    sets: Collection[QuestionSet]


__all__ = ["Collection", "Store", "InMemoryStore"]
