import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from prepflip.config import Settings
from prepflip.main import create_app
from prepflip.services.auth import hash_password
from prepflip.store import InMemoryStore

# Hashing is deliberately slow, so do it once per test run.
PASSWORDS = {"asha": "asha-secret-1", "ravi": "ravi-secret-2"}
_HASHES = {name: hash_password(pw) for name, pw in PASSWORDS.items()}
USER_IDS = {"asha": "user-asha", "ravi": "user-ravi"}


def write_users_file(path: Path) -> Path:
    users = [
        {"id": USER_IDS[name], "username": name, "password_hash": _HASHES[name], "display_name": name.title()}
        for name in PASSWORDS
    ]
    path.write_text(json.dumps({"users": users}), encoding="utf-8")
    return path


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return Settings(users_file=write_users_file(tmp_path / "users.json"), static_dir=tmp_path / "dist")


@pytest.fixture
def store() -> InMemoryStore:
    return InMemoryStore()


@pytest.fixture
def client(settings: Settings, store: InMemoryStore) -> TestClient:
    return TestClient(create_app(settings, store))


def login(client: TestClient, username: str = "asha", password: str | None = None):
    return client.post("/api/auth/login", json={"username": username, "password": password or PASSWORDS[username]})


@pytest.fixture
def asha(client: TestClient) -> TestClient:
    """A client logged in as asha."""
    assert login(client).status_code == 200
    return client
