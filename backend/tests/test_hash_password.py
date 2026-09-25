from pathlib import Path

from prepflip.scripts.hash_password import add_user
from prepflip.services.auth import authenticate, hash_password, load_users
from prepflip.store import InMemoryStore


def test_added_account_can_log_in(tmp_path: Path) -> None:
    path = tmp_path / "users.json"
    assert add_user(path, "meera", "Meera S", hash_password("meera-pass-1")) == "Added"

    store = InMemoryStore()
    assert load_users(path, store) == 1
    user = authenticate(store, "meera", "meera-pass-1")
    assert user is not None and user.display_name == "Meera S"


def test_adding_an_existing_username_updates_its_password(tmp_path: Path) -> None:
    path = tmp_path / "users.json"
    add_user(path, "meera", "Meera S", hash_password("old-password"))
    assert add_user(path, "MEERA", "", hash_password("new-password")) == "Updated"

    store = InMemoryStore()
    assert load_users(path, store) == 1
    assert authenticate(store, "meera", "old-password") is None
    assert authenticate(store, "meera", "new-password").display_name == "Meera S"
