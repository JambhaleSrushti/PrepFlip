from fastapi import APIRouter, Request

router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> dict:
    return {"status": "ok"}


@router.get("/config")
def config(request: Request) -> dict:
    """Feature flags and limits the front end needs."""
    settings = request.app.state.settings
    return {"ai_enabled": settings.ai_enabled}
