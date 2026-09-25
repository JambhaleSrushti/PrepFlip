"""Settings read from environment variables, with defaults for local development."""

import os
from dataclasses import dataclass
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
REPO_DIR = BACKEND_DIR.parent


def _env_bool(name: str, default: bool) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    # Accounts file (see users.example.json). There is no sign-up in v1.
    users_file: Path = BACKEND_DIR / "users.json"
    # Built React app. When missing (e.g. during `npm run dev`), only the API is served.
    static_dir: Path = REPO_DIR / "frontend" / "dist"
    # `Secure` cookie flag. Must be on in production (HTTPS); off for http://localhost.
    secure_cookies: bool = False
    session_ttl_hours: int = 24 * 7
    # Failed logins allowed per username + IP within the window before returning 429.
    login_max_failures: int = 5
    login_window_seconds: int = 15 * 60
    ai_enabled: bool = False

    @classmethod
    def from_env(cls) -> "Settings":
        defaults = cls()
        return cls(
            users_file=Path(os.environ.get("PREPFLIP_USERS_FILE", defaults.users_file)),
            static_dir=Path(os.environ.get("PREPFLIP_STATIC_DIR", defaults.static_dir)),
            secure_cookies=_env_bool("PREPFLIP_SECURE_COOKIES", defaults.secure_cookies),
            session_ttl_hours=int(os.environ.get("PREPFLIP_SESSION_TTL_HOURS", defaults.session_ttl_hours)),
        )
