"""FastAPI dependencies: DB session, current user extraction, RBAC guard."""

import uuid
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import decode_token
from app.db.session import get_db
from app.models.crew import CrewMember
from app.models.passenger import Passenger

# tokenUrl is used only by the OpenAPI "Authorize" button; login body is JSON
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=True)

_CREDENTIALS_EXC = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Invalid or expired token",
    headers={"WWW-Authenticate": "Bearer"},
)


class CurrentUser(BaseModel):
    """Unified representation of any authenticated principal."""

    id: uuid.UUID
    email: str
    role: str  # "passenger" | "crew" | "admin"
    name: str

    model_config = {"from_attributes": True}


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> CurrentUser:
    """Decode the Bearer token and return the matching DB user."""
    try:
        payload = decode_token(token)
    except ValueError:
        raise _CREDENTIALS_EXC

    if payload.get("type") != "access":
        raise _CREDENTIALS_EXC

    sub: Optional[str] = payload.get("sub")
    role: Optional[str] = payload.get("role")
    email: Optional[str] = payload.get("email")

    if not sub or not role or not email:
        raise _CREDENTIALS_EXC

    try:
        user_id = uuid.UUID(sub)
    except ValueError:
        raise _CREDENTIALS_EXC

    if role == "passenger":
        user = db.scalar(select(Passenger).where(Passenger.id == user_id))
        if not user:
            raise _CREDENTIALS_EXC
        return CurrentUser(
            id=user.id,
            email=user.email,
            role="passenger",
            name=f"{user.first_name} {user.last_name}",
        )

    if role in ("crew", "admin"):
        user = db.scalar(select(CrewMember).where(CrewMember.id == user_id))
        if not user:
            raise _CREDENTIALS_EXC
        # Stored role "admin" in crew_members.role column elevates to admin JWT role
        effective_role = "admin" if user.role == "admin" else "crew"
        return CurrentUser(id=user.id, email=user.email, role=effective_role, name=user.name)

    raise _CREDENTIALS_EXC


def require_role(*roles: str):
    """
    Factory that returns a FastAPI dependency enforcing at least one of `roles`.

    Usage:
        @router.get("/crew-only")
        def endpoint(user: CurrentUser = Depends(require_role("crew", "admin"))):
            ...
    """
    def dependency(current_user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access requires role: {' or '.join(roles)}",
            )
        return current_user

    return dependency
