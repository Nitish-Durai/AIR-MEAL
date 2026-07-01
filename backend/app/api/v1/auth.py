"""Auth endpoints: register, login, refresh, me."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser, get_current_user, require_role
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.db.session import get_db
from app.models.crew import CrewMember
from app.models.passenger import Passenger, PassengerProfile
from app.schemas.auth import (
    LoginRequest,
    MeResponse,
    RefreshRequest,
    RegisterRequest,
    TokenResponse,
)

router = APIRouter(prefix="/auth", tags=["auth"])


# ---------------------------------------------------------------------------
# Registration — passengers only; crew/admin accounts are created by admins
# ---------------------------------------------------------------------------

@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, db: Session = Depends(get_db)) -> TokenResponse:
    """Create a passenger account and immediately issue tokens."""
    payload.email = payload.email.lower().strip()

    if db.scalar(select(Passenger).where(Passenger.email == payload.email)):
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")
    if db.scalar(select(Passenger).where(Passenger.pnr == payload.pnr)):
        raise HTTPException(status.HTTP_409_CONFLICT, "PNR already registered")

    passenger = Passenger(
        pnr=payload.pnr,
        first_name=payload.first_name,
        last_name=payload.last_name,
        dob=payload.dob,
        nationality=payload.nationality,
        email=payload.email,
        hashed_password=hash_password(payload.password),
    )
    db.add(passenger)
    db.flush()

    profile = PassengerProfile(
        passenger_id=passenger.id,
        dietary_flags=payload.dietary_flags,
        allergy_flags=payload.allergy_flags,
        cuisine_prefs=payload.cuisine_prefs,
        portion_pref=payload.portion_pref,
        price_sensitivity=payload.price_sensitivity,
    )
    db.add(profile)
    db.commit()
    db.refresh(passenger)

    token_args = (str(passenger.id), passenger.email, "passenger")
    return TokenResponse(
        access_token=create_access_token(*token_args),
        refresh_token=create_refresh_token(*token_args),
        role="passenger",
        user_id=passenger.id,
    )


# ---------------------------------------------------------------------------
# Login — role auto-detected: passengers → "passenger"; crew → "crew"/"admin"
# ---------------------------------------------------------------------------

@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    """Authenticate any account; role is derived from the account type, not the client."""
    email = payload.email.lower().strip()

    # 1. Try passengers table first
    passenger = db.scalar(select(Passenger).where(Passenger.email == email))
    if passenger:
        if not verify_password(payload.password, passenger.hashed_password):
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect password")
        token_args = (str(passenger.id), passenger.email, "passenger")
        return TokenResponse(
            access_token=create_access_token(*token_args),
            refresh_token=create_refresh_token(*token_args),
            role="passenger",
            user_id=passenger.id,
        )

    # 2. Try crew_members table
    crew = db.scalar(select(CrewMember).where(CrewMember.email == email))
    if crew:
        if not verify_password(payload.password, crew.hashed_password):
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect password")
        # crew_members.role == "admin" elevates to the admin role
        role = "admin" if crew.role == "admin" else "crew"
        token_args = (str(crew.id), crew.email, role)
        return TokenResponse(
            access_token=create_access_token(*token_args),
            refresh_token=create_refresh_token(*token_args),
            role=role,
            user_id=crew.id,
        )

    raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Account not found")


# ---------------------------------------------------------------------------
# Token refresh
# ---------------------------------------------------------------------------

@router.post("/refresh", response_model=TokenResponse)
def refresh_tokens(payload: RefreshRequest, db: Session = Depends(get_db)) -> TokenResponse:
    """Exchange a valid refresh token for a fresh access + refresh token pair."""
    _exc = HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired refresh token")

    try:
        token_payload = decode_token(payload.refresh_token)
    except ValueError:
        raise _exc

    if token_payload.get("type") != "refresh":
        raise _exc

    sub: str = token_payload.get("sub", "")
    email: str = token_payload.get("email", "")
    role: str = token_payload.get("role", "")

    if not all([sub, email, role]):
        raise _exc

    try:
        user_id = uuid.UUID(sub)
    except ValueError:
        raise _exc

    # Re-verify the user still exists in the DB
    if role == "passenger":
        user = db.scalar(select(Passenger).where(Passenger.id == user_id))
    else:
        user = db.scalar(select(CrewMember).where(CrewMember.id == user_id))

    if not user:
        raise _exc

    token_args = (sub, email, role)
    return TokenResponse(
        access_token=create_access_token(*token_args),
        refresh_token=create_refresh_token(*token_args),
        role=role,
        user_id=user_id,
    )


# ---------------------------------------------------------------------------
# Current user info
# ---------------------------------------------------------------------------

@router.get("/me", response_model=MeResponse)
def me(current_user: CurrentUser = Depends(get_current_user)) -> MeResponse:
    """Return the authenticated user's identity. Any valid access token accepted."""
    return MeResponse(
        id=current_user.id,
        email=current_user.email,
        role=current_user.role,
        name=current_user.name,
    )


# ---------------------------------------------------------------------------
# RBAC smoke-test endpoints (used by Phase 2 acceptance check)
# ---------------------------------------------------------------------------

@router.get("/crew-check", summary="Crew-only probe (acceptance test)")
def crew_check(current_user: CurrentUser = Depends(require_role("crew", "admin"))):
    """Returns 200 for crew/admin, 403 for passengers — used by the acceptance test."""
    return {"status": "crew access ok", "user_id": str(current_user.id), "role": current_user.role}


@router.get("/admin-check", summary="Admin-only probe (acceptance test)")
def admin_check(current_user: CurrentUser = Depends(require_role("admin"))):
    return {"status": "admin access ok", "user_id": str(current_user.id)}
