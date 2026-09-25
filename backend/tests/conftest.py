from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from prepflip.config import Settings
from prepflip.main import create_app
from prepflip.store import InMemoryStore


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return Settings(users_file=tmp_path / "users.json", static_dir=tmp_path / "dist")


@pytest.fixture
def store() -> InMemoryStore:
    return InMemoryStore()


@pytest.fixture
def client(settings: Settings, store: InMemoryStore) -> TestClient:
    return TestClient(create_app(settings, store))
