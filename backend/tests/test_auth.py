from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from prepflip.api.deps import SESSION_COOKIE, get_owned
from prepflip.config import Settings
from prepflip.main import create_app
from prepflip.models import OwnedDocument, User
from prepflip.services.auth import LoginRateLimiter, load_users
from prepflip.store import InMemoryStore
from prepflip.store.memory import InMemoryCollection

from .conftest import PASSWORDS, USER_IDS, login


def set_cookie_header(res) -> str:
    return next(v for k, v in res.headers.multi_items() if k == "set-cookie")


# ---------- Login ----------


def test_login_returns_user_and_sets_session_cookie(client: TestClient) -> None:
    res = login(client)
    assert res.status_code == 200
    assert res.json() == {"id": "user-asha", "username": "asha", "display_name": "Asha"}
    assert SESSION_COOKIE in client.cookies


def test_session_cookie_flags(client: TestClient) -> None:
    header = set_cookie_header(login(client)).lower()
    assert "httponly" in header
    assert "samesite=lax" in header
    assert "path=/" in header
    assert "max-age=604800" in header
    assert "secure" not in header  # off for http://localhost by default


def test_session_cookie_is_secure_when_configured(settings: Settings) -> None:
    client = TestClient(create_app(Settings(users_file=settings.users_file, static_dir=settings.static_dir, secure_cookies=True)))
    assert "secure" in set_cookie_header(login(client)).lower()


def test_username_is_case_insensitive(client: TestClient) -> None:
    assert login(client, " ASHA ", PASSWORDS["asha"]).status_code == 200


def test_wrong_password_is_401(client: TestClient) -> None:
    res = login(client, "asha", "wrong-password")
    assert res.status_code == 401
    assert res.json()["detail"] == "Wrong username or password."
    assert SESSION_COOKIE not in client.cookies


def test_unknown_user_gets_the_same_401(client: TestClient) -> None:
    res = login(client, "nobody", "whatever")
    assert res.status_code == 401
    assert res.json()["detail"] == "Wrong username or password."


def test_login_rejects_non_json_body(client: TestClient) -> None:
    """A cross-site HTML form can only send form or text bodies; the API accepts JSON only."""
    res = client.post(
        "/api/auth/login",
        content='{"username": "asha", "password": "asha-secret-1"}',
        headers={"Content-Type": "text/plain"},
    )
    assert res.status_code == 422
    assert SESSION_COOKIE not in client.cookies


# ---------- Sessions ----------


@pytest.mark.parametrize("path", ["/api/auth/me", "/api/config"])
def test_no_session_is_401(client: TestClient, path: str) -> None:
    assert client.get(path).status_code == 401


def test_made_up_session_token_is_401(client: TestClient) -> None:
    client.cookies.set(SESSION_COOKIE, "made-up-token")
    assert client.get("/api/auth/me").status_code == 401


def test_logged_in_user_can_use_protected_endpoints(asha: TestClient) -> None:
    assert asha.get("/api/auth/me").json()["username"] == "asha"
    assert asha.get("/api/config").status_code == 200


def test_health_needs_no_session(client: TestClient) -> None:
    assert client.get("/api/health").status_code == 200


def test_store_keeps_only_a_hash_of_the_token(asha: TestClient, store: InMemoryStore) -> None:
    token = asha.cookies[SESSION_COOKIE]
    [session] = store.sessions.list()
    assert session.id != token
    assert token not in session.model_dump_json()


def test_logout_ends_the_session_even_if_the_cookie_is_replayed(asha: TestClient) -> None:
    token = asha.cookies[SESSION_COOKIE]
    res = asha.post("/api/auth/logout")
    assert res.status_code == 204
    assert SESSION_COOKIE not in asha.cookies
    asha.cookies.set(SESSION_COOKIE, token)
    assert asha.get("/api/auth/me").status_code == 401


def test_logout_without_a_session_is_fine(client: TestClient) -> None:
    assert client.post("/api/auth/logout").status_code == 204


def test_expired_session_is_401_and_removed(asha: TestClient, store: InMemoryStore) -> None:
    [session] = store.sessions.list()
    store.sessions.put(session.model_copy(update={"expires_at": datetime.now(UTC) - timedelta(seconds=1)}))
    assert asha.get("/api/auth/me").status_code == 401
    assert store.sessions.list() == []


# ---------- Rate limiting ----------


class FakeClock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


@pytest.fixture
def clock(client: TestClient) -> FakeClock:
    clock = FakeClock()
    client.app.state.login_limiter = LoginRateLimiter(max_failures=5, window_seconds=900, clock=clock)
    return clock


def test_rate_limit_triggers_after_repeated_failures(client: TestClient, clock: FakeClock) -> None:
    for _ in range(5):
        assert login(client, "asha", "wrong").status_code == 401
    res = login(client)  # even the right password is refused while blocked
    assert res.status_code == 429
    assert 0 < int(res.headers["Retry-After"]) <= 900
    assert SESSION_COOKIE not in client.cookies


def test_rate_limit_is_per_username(client: TestClient, clock: FakeClock) -> None:
    for _ in range(5):
        login(client, "asha", "wrong")
    assert login(client, "ravi").status_code == 200


def test_rate_limit_lifts_after_the_window(client: TestClient, clock: FakeClock) -> None:
    for _ in range(5):
        login(client, "asha", "wrong")
    clock.now += 901
    assert login(client).status_code == 200


def test_successful_login_resets_the_count(client: TestClient, clock: FakeClock) -> None:
    for _ in range(4):
        login(client, "asha", "wrong")
    assert login(client).status_code == 200
    for _ in range(4):
        assert login(client, "asha", "wrong").status_code == 401


def test_rate_limit_per_ip_stops_trying_many_usernames(client: TestClient, clock: FakeClock) -> None:
    for i in range(20):
        login(client, f"guess{i}", "wrong")
    assert login(client, "ravi").status_code == 429


def test_rate_limiter_forgets_expired_failures() -> None:
    clock = FakeClock()
    limiter = LoginRateLimiter(max_failures=5, window_seconds=900, clock=clock)
    for i in range(50):
        limiter.record_failure(f"guess{i}", "1.2.3.4")
        limiter.retry_after(f"other{i}", "1.2.3.4")  # checking must not add entries
    clock.now += 901
    limiter._sweep()
    assert limiter._failures == {}


# ---------- Ownership ----------


class Note(OwnedDocument):
    text: str


def test_user_a_gets_404_for_user_bs_document() -> None:
    notes = InMemoryCollection(Note)
    notes.put(Note(id="n1", owner_id=USER_IDS["ravi"], text="ravi's"))
    asha = User(id=USER_IDS["asha"], username="asha", password_hash="x", display_name="Asha")
    ravi = User(id=USER_IDS["ravi"], username="ravi", password_hash="x", display_name="Ravi")

    assert get_owned(notes, "n1", ravi).text == "ravi's"
    with pytest.raises(HTTPException) as other_users:
        get_owned(notes, "n1", asha)
    with pytest.raises(HTTPException) as missing:
        get_owned(notes, "missing", asha)
    assert other_users.value.status_code == missing.value.status_code == 404
    assert other_users.value.detail == missing.value.detail


# ---------- Accounts file ----------


def test_missing_accounts_file_means_no_users(tmp_path: Path) -> None:
    store = InMemoryStore()
    assert load_users(tmp_path / "missing.json", store) == 0
    assert store.users.list() == []


def test_accounts_without_argon2_hash_are_skipped(tmp_path: Path) -> None:
    path = tmp_path / "users.json"
    path.write_text('{"users": [{"id": "1", "username": "a", "password_hash": "plaintext", "display_name": "A"}]}')
    store = InMemoryStore()
    assert load_users(path, store) == 0


def test_duplicate_usernames_are_rejected(tmp_path: Path, settings: Settings) -> None:
    path = tmp_path / "users.json"
    user = '{"id": "%s", "username": "%s", "password_hash": "$argon2id$x", "display_name": "A"}'
    path.write_text('{"users": [%s, %s]}' % (user % ("1", "Asha"), user % ("2", "asha")))
    with pytest.raises(RuntimeError, match="more than once"):
        load_users(path, InMemoryStore())
