"""FastAPI app: the JSON API under /api, plus the built React app on every other path."""

from pathlib import Path

from fastapi import APIRouter, FastAPI, HTTPException
from fastapi.responses import FileResponse

from prepflip.api import health
from prepflip.config import Settings
from prepflip.store import InMemoryStore, Store


def create_app(settings: Settings | None = None, store: Store | None = None) -> FastAPI:
    settings = settings or Settings.from_env()
    app = FastAPI(title="PrepFlip API", docs_url="/api/docs", openapi_url="/api/openapi.json", redoc_url=None)
    app.state.settings = settings
    app.state.store = store or InMemoryStore()

    api = APIRouter(prefix="/api")
    api.include_router(health.router)
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
