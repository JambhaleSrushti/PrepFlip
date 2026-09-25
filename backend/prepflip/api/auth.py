from datetime import timedelta

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, Field

from prepflip.api.deps import SESSION_COOKIE, CurrentUser, StoreDep
from prepflip.models import User
from prepflip.services import auth

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=1, max_length=1000)


class UserOut(BaseModel):
    id: str
    username: str
    display_name: str

    @classmethod
    def of(cls, user: User) -> "UserOut":
        return cls(id=user.id, username=user.username, display_name=user.display_name)


@router.post("/login")
def login(body: LoginRequest, request: Request, response: Response, store: StoreDep) -> UserOut:
    settings = request.app.state.settings
    limiter: auth.LoginRateLimiter = request.app.state.login_limiter
    ip = request.client.host if request.client else "unknown"

    retry_after = limiter.retry_after(body.username, ip)
    if retry_after is not None:
        raise HTTPException(
            status_code=429,
            detail="Too many failed logins. Please wait a few minutes and try again.",
            headers={"Retry-After": str(retry_after)},
        )

    user = auth.authenticate(store, body.username, body.password)
    if user is None:
        limiter.record_failure(body.username, ip)
        raise HTTPException(status_code=401, detail="Wrong username or password.")

    limiter.record_success(body.username, ip)
    ttl = timedelta(hours=settings.session_ttl_hours)
    token = auth.create_session(store, user.id, ttl)
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=int(ttl.total_seconds()),
        path="/",
        httponly=True,
        samesite="lax",
        secure=settings.secure_cookies,
    )
    return UserOut.of(user)


@router.post("/logout", status_code=204)
def logout(request: Request, response: Response, store: StoreDep) -> None:
    auth.end_session(store, request.cookies.get(SESSION_COOKIE))
    settings = request.app.state.settings
    response.delete_cookie(SESSION_COOKIE, path="/", httponly=True, samesite="lax", secure=settings.secure_cookies)


@router.get("/me")
def me(user: CurrentUser) -> UserOut:
    return UserOut.of(user)
