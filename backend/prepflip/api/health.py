from fastapi import APIRouter, Request

from prepflip.api.deps import CurrentUser

public_router = APIRouter(tags=["health"])
router = APIRouter(tags=["health"])


@public_router.get("/health")
def health() -> dict:
    return {"status": "ok"}


@router.get("/config")
def config(request: Request, user: CurrentUser) -> dict:
    """Feature flags and limits the front end needs."""
    settings = request.app.state.settings
    return {"ai_enabled": settings.ai_enabled}
