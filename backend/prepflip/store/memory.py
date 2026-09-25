"""In-memory store for the pilot.

Documents are kept as JSON-compatible dicts and turned back into models on the
way out, so callers always get copies and behave as they would with a database.
Data lives in this process only: run exactly one server process with one worker.
"""

import threading
from typing import Any, Generic, TypeVar

from prepflip.models import Document, Session, User

T = TypeVar("T", bound=Document)


class InMemoryCollection(Generic[T]):
    def __init__(self, model: type[T]) -> None:
        self._model = model
        self._docs: dict[str, dict[str, Any]] = {}
        self._lock = threading.Lock()  # PDF extraction runs in worker threads

    def get(self, id: str) -> T | None:
        with self._lock:
            data = self._docs.get(id)
        return None if data is None else self._model.model_validate(data)

    def put(self, doc: T) -> T:
        data = doc.model_dump(mode="json")
        with self._lock:
            self._docs[doc.id] = data
        return self._model.model_validate(data)

    def list(self, **filters: Any) -> list[T]:
        with self._lock:
            docs = list(self._docs.values())
        models = [self._model.model_validate(d) for d in docs]
        return [m for m in models if all(getattr(m, k) == v for k, v in filters.items())]

    def delete(self, id: str) -> bool:
        with self._lock:
            return self._docs.pop(id, None) is not None


class InMemoryStore:
    def __init__(self) -> None:
        self.users = InMemoryCollection(User)
        self.sessions = InMemoryCollection(Session)
