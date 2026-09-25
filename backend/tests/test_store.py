"""Contract tests for the Store interface.

Any future storage backend (e.g. Postgres) must pass these: add its factory to
STORE_FACTORIES.
"""

from datetime import UTC, datetime
from typing import Callable

import pytest

from prepflip.models import Session, User
from prepflip.store import InMemoryStore, Store

STORE_FACTORIES: dict[str, Callable[[], Store]] = {"memory": InMemoryStore}


@pytest.fixture(params=list(STORE_FACTORIES))
def any_store(request: pytest.FixtureRequest) -> Store:
    return STORE_FACTORIES[request.param]()


def make_user(id: str = "u1", username: str = "asha") -> User:
    return User(id=id, username=username, password_hash="$argon2id$fake", display_name="Asha")


def test_get_missing_returns_none(any_store: Store) -> None:
    assert any_store.users.get("nope") is None


def test_put_then_get_round_trips(any_store: Store) -> None:
    user = make_user()
    any_store.users.put(user)
    assert any_store.users.get("u1") == user


def test_datetimes_round_trip(any_store: Store) -> None:
    session = Session(id="hash", user_id="u1", expires_at=datetime(2026, 1, 2, 3, 4, 5, tzinfo=UTC))
    any_store.sessions.put(session)
    assert any_store.sessions.get("hash") == session


def test_put_replaces_existing(any_store: Store) -> None:
    any_store.users.put(make_user())
    any_store.users.put(make_user().model_copy(update={"display_name": "Asha K"}))
    assert any_store.users.get("u1").display_name == "Asha K"
    assert len(any_store.users.list()) == 1


def test_returned_documents_are_copies(any_store: Store) -> None:
    user = make_user()
    any_store.users.put(user)
    user.display_name = "changed after put"
    fetched = any_store.users.get("u1")
    fetched.display_name = "changed after get"
    assert any_store.users.get("u1").display_name == "Asha"


def test_list_filters_by_field_equality(any_store: Store) -> None:
    any_store.users.put(make_user("u1", "asha"))
    any_store.users.put(make_user("u2", "ravi"))
    assert [u.id for u in any_store.users.list()] == ["u1", "u2"]
    assert [u.id for u in any_store.users.list(username="ravi")] == ["u2"]
    assert any_store.users.list(username="nobody") == []


def test_delete(any_store: Store) -> None:
    any_store.users.put(make_user())
    assert any_store.users.delete("u1") is True
    assert any_store.users.get("u1") is None
    assert any_store.users.delete("u1") is False


def test_collections_are_independent(any_store: Store) -> None:
    any_store.users.put(make_user(id="same"))
    assert any_store.sessions.get("same") is None
