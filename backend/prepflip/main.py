"""FastAPI app: the JSON API under /api, plus the built React app on every other path."""

from pathlib import Path

from fastapi import APIRouter, Depends, FastAPI, HTTPException
from fastapi.responses import FileResponse

from prepflip.api import auth, health
from prepflip.api.deps import current_user
from prepflip.config import Settings
from prepflip.services.auth import LoginRateLimiter, load_users
from prepflip.store import InMemoryStore, Store


def create_app(settings: Settings | None = None, store: Store | None = None) -> FastAPI:
    settings = settings or Settings.from_env()
    store = store or InMemoryStore()
    load_users(settings.users_file, store)

    app = FastAPI(title="PrepFlip API", docs_url="/api/docs", openapi_url="/api/openapi.json", redoc_url=None)
    app.state.settings = settings
    app.state.store = store
    app.state.login_limiter = LoginRateLimiter(settings.login_max_failures, settings.login_window_seconds)

    api = APIRouter(prefix="/api")
    # Public: health check and login. Everything else requires a session.
    api.include_router(health.public_router)
    api.include_router(auth.router)
    protected = APIRouter(dependencies=[Depends(current_user)])
    protected.include_router(health.router)
    api.include_router(protected)
    app.include_router(api)

    @app.api_route("/api/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"], include_in_schema=False)
    def api_not_found(path: str) -> None:
        raise HTTPException(status_code=404, detail="Not found")

    _serve_spa(app, settings.static_dir)
    return app


def _serve_spa(app: FastAPI, static_dir: Path) -> None:
    """Serve files from the Vite build, falling back to index.html for client-side routes."""
    root = static_dir.resolve()
    index = root / "index.html"

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str) -> FileResponse:
        if not index.is_file():
            raise HTTPException(status_code=404, detail="Front end not built. Run `npm run build`.")
        file = (root / path).resolve()
        if path and file.is_file() and file.is_relative_to(root):
            return FileResponse(file)
        return FileResponse(index, headers={"Cache-Control": "no-store"})


app = create_app()
