"""Endpoints for end-to-end tests only. Mounted when PREPFLIP_TEST_ENDPOINTS is on; never in production."""

from fastapi import APIRouter, Request, Response

from prepflip.services.auth import LoginRateLimiter, load_users
from prepflip.store import InMemoryStore

router = APIRouter(prefix="/test", tags=["testing"])


@router.post("/restart", status_code=204)
def restart(request: Request) -> Response:
    """Forget everything a server restart would forget: sessions, sets and attempts. Accounts are reloaded."""
    app = request.app
    settings = app.state.settings
    store = InMemoryStore()
    load_users(settings.users_file, store)
    app.state.store = store
    app.state.login_limiter = LoginRateLimiter(settings.login_max_failures, settings.login_window_seconds)
    return Response(status_code=204)
