"""Passwords, accounts file, sessions and login rate limiting."""

import hashlib
import json
import logging
import math
import secrets
import time
from collections import defaultdict, deque
from datetime import UTC, datetime, timedelta
from pathlib import Path

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from pydantic import BaseModel, ValidationError

from prepflip.models import Session, User
from prepflip.store import Store

log = logging.getLogger(__name__)

_hasher = PasswordHasher()
# Verified against when the username is unknown, so response time doesn't reveal which usernames exist.
_DUMMY_HASH = _hasher.hash("not-a-real-password")


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except (VerificationError, InvalidHashError):
        return False


# ---------- Accounts file ----------


class UsersFile(BaseModel):
    users: list[User]


def load_users(path: Path, store: Store) -> int:
    """Load accounts from the JSON file into the store. Returns how many were loaded.

    There is no sign-up in v1: accounts kept only in memory would vanish on every restart.
    """
    if not path.is_file():
        log.warning("No accounts file at %s: nobody can log in. See backend/users.example.json.", path)
        return 0
    try:
        users = UsersFile.model_validate(json.loads(path.read_text(encoding="utf-8"))).users
    except (json.JSONDecodeError, ValidationError) as err:
        raise RuntimeError(f"Accounts file {path} is invalid: {err}") from err

    seen: set[str] = set()
    loaded = 0
    for user in users:
        key = normalise_username(user.username)
        if key in seen:
            raise RuntimeError(f"Accounts file {path} lists username {user.username!r} more than once.")
        seen.add(key)
        if not user.password_hash.startswith("$argon2"):
            log.warning("Skipping %r: password_hash is not an argon2 hash.", user.username)
            continue
        store.users.put(user)
        loaded += 1
    return loaded


def normalise_username(username: str) -> str:
    return username.strip().casefold()


def authenticate(store: Store, username: str, password: str) -> User | None:
    key = normalise_username(username)
    user = next((u for u in store.users.list() if normalise_username(u.username) == key), None)
    if user is None:
        verify_password(_DUMMY_HASH, password)
        return None
    return user if verify_password(user.password_hash, password) else None


# ---------- Sessions ----------


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def create_session(store: Store, user_id: str, ttl: timedelta) -> str:
    """Start a session and return the token for the cookie. Only its hash is stored."""
    token = secrets.token_urlsafe(32)
    store.sessions.put(Session(id=_token_hash(token), user_id=user_id, expires_at=datetime.now(UTC) + ttl))
    return token


def session_user(store: Store, token: str | None) -> User | None:
    if not token:
        return None
    session = store.sessions.get(_token_hash(token))
    if session is None:
        return None
    if session.expires_at <= datetime.now(UTC):
        store.sessions.delete(session.id)
        return None
    return store.users.get(session.user_id)


def end_session(store: Store, token: str | None) -> None:
    if token:
        store.sessions.delete(_token_hash(token))


# ---------- Rate limiting ----------


class LoginRateLimiter:
    """Counts failed logins per (username, IP) and per IP within a sliding window.

    Kept in memory: it resets on restart, which is acceptable for the pilot.
    """

    def __init__(self, max_failures: int, window_seconds: float, clock=time.monotonic) -> None:
        self.max_failures = max_failures
        self.max_failures_per_ip = max_failures * 4  # stops trying many usernames from one address
        self.window = window_seconds
        self._clock = clock
        self._failures: dict[tuple, deque[float]] = defaultdict(deque)

    def _recent(self, key: tuple) -> deque[float]:
        times = self._failures.get(key)
        if times is None:
            return deque()
        cutoff = self._clock() - self.window
        while times and times[0] <= cutoff:
            times.popleft()
        if not times:
            del self._failures[key]
        return times

    def _sweep(self) -> None:
        """Drop expired entries so guessing many usernames can't grow memory without limit."""
        for key in list(self._failures):
            self._recent(key)

    def retry_after(self, username: str, ip: str) -> int | None:
        """Seconds until another attempt is allowed, or None if not blocked."""
        waits = []
        for key, limit in ((("user", normalise_username(username), ip), self.max_failures), (("ip", ip), self.max_failures_per_ip)):
            times = self._recent(key)
            if len(times) >= limit:
                waits.append(times[-limit] + self.window - self._clock())
        return max(1, math.ceil(max(waits))) if waits else None

    def record_failure(self, username: str, ip: str) -> None:
        if len(self._failures) > 10_000:
            self._sweep()
        now = self._clock()
        self._failures[("user", normalise_username(username), ip)].append(now)
        self._failures[("ip", ip)].append(now)

    def record_success(self, username: str, ip: str) -> None:
        self._failures.pop(("user", normalise_username(username), ip), None)
