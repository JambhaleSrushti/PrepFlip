"""Shared FastAPI dependencies."""

from typing import Annotated, TypeVar

from fastapi import Depends, HTTPException, Request

from prepflip.models import OwnedDocument, User
from prepflip.services import auth
from prepflip.store import Collection, Store

SESSION_COOKIE = "prepflip_session"

T = TypeVar("T", bound=OwnedDocument)


def get_store(request: Request) -> Store:
    return request.app.state.store


def current_user(request: Request) -> User:
    user = auth.session_user(request.app.state.store, request.cookies.get(SESSION_COOKIE))
    if user is None:
        raise HTTPException(status_code=401, detail="Please log in.")
    return user


CurrentUser = Annotated[User, Depends(current_user)]
StoreDep = Annotated[Store, Depends(get_store)]


def get_owned(collection: Collection[T], id: str, user: User) -> T:
    """Fetch a document that belongs to `user`.

    Another user's document gives the same 404 as a missing one, so IDs can't be probed.
    """
    doc = collection.get(id)
    if doc is None or doc.owner_id != user.id:
        raise HTTPException(status_code=404, detail="Not found")
    return doc
