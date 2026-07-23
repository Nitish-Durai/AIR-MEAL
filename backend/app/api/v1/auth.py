"""Auth endpoints: register, login, refresh, me."""

import time
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
from app.models.booking import Booking
from app.models.flight import Flight
from app.schemas.auth import (
    BoardRequest,
    BoardResponse,
    LoginRequest,
    MeResponse,
    RefreshRequest,
    RegisterRequest,
    TokenResponse,
)

router = APIRouter(prefix="/auth", tags=["auth"])


# ---------------------------------------------------------------------------
# Boarding claim rate limiting
#
# A PNR + surname pair is a low-entropy credential, so repeated failed claims
# are throttled per authenticated account. Successful claims are not counted,
# so legitimate re-boarding is never penalised.
#
# Limitation: this counter is in-process, so it resets on restart and is not
# shared across workers. A multi-instance deployment would back it with Redis.
# ---------------------------------------------------------------------------

BOARD_MAX_FAILURES = 5
BOARD_WINDOW_SECONDS = 300  # 5 minutes

_board_failures: dict[str, list[float]] = {}


def _board_recent_failures(account_id: str) -> list[float]:
    """Return this account's failure timestamps inside the current window."""
    cutoff = time.monotonic() - BOARD_WINDOW_SECONDS
    recent = [t for t in _board_failures.get(account_id, []) if t > cutoff]
    if recent:
        _board_failures[account_id] = recent
    else:
        _board_failures.pop(account_id, None)
    return recent


def _board_guard(account_id: str) -> None:
    """Reject the claim if this account has exhausted its failure budget."""
    recent = _board_recent_failures(account_id)
    if len(recent) >= BOARD_MAX_FAILURES:
        # The lockout lifts once the oldest failure leaves the window.
        elapsed = time.monotonic() - recent[0]
        retry_after = max(1, int(BOARD_WINDOW_SECONDS - elapsed))
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            f"Too many failed boarding attempts. Try again in {retry_after} seconds.",
            headers={"Retry-After": str(retry_after)},
        )


def _board_record_failure(account_id: str) -> None:
    _board_failures.setdefault(account_id, []).append(time.monotonic())


def _board_clear_failures(account_id: str) -> None:
    _board_failures.pop(account_id, None)


# ---------------------------------------------------------------------------
# Registration — passengers only; crew/admin accounts are created by admins
# ---------------------------------------------------------------------------

@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, db: Session = Depends(get_db)) -> TokenResponse:
    """Create a passenger account and immediately issue tokens."""
    payload.email = payload.email.lower().strip()

    if db.scalar(select(Passenger).where(Passenger.email == payload.email)):
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")

    # Booking references live on the bookings table; boarding resolves a PNR
    # there and verifies both the surname and the account that owns it. The
    # legacy passengers.pnr column is no longer written at registration — it
    # was only ever populated with a self-generated placeholder, and keeping
    # two PNR columns invites a query against the non-authoritative one.
    passenger = Passenger(
        pnr=None,
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

@router.post("/board", response_model=BoardResponse)
def board(
    payload: BoardRequest,
    current_user: CurrentUser = Depends(require_role("passenger")),
    db: Session = Depends(get_db),
) -> BoardResponse:
    """Resolve a PNR + booking last name to a flight the passenger is on.

    Requires an authenticated passenger (account login). The PNR + last name are
    matched against the bookings table; the last name must match the BOOKING's
    passenger, real-airline style. Returns the flight context so the frontend can
    load that flight's menu and recommendations.
    """
    pnr = payload.pnr.strip().upper()
    last_name = payload.last_name.strip()
    account_id = str(current_user.id)

    _board_guard(account_id)

    booking = db.scalar(select(Booking).where(Booking.pnr == pnr))
    if not booking:
        _board_record_failure(account_id)
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Booking reference not found")

    booked_passenger = db.scalar(
        select(Passenger).where(Passenger.id == booking.passenger_id)
    )
    if not booked_passenger or booked_passenger.last_name.strip().lower() != last_name.lower():
        _board_record_failure(account_id)
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Last name does not match this booking reference",
        )

    # Ownership check: the authenticated account must be the passenger this
    # booking was issued to. Without this, any logged-in passenger who guesses
    # a valid PNR and surname could open another passenger's seat context.
    if booking.passenger_id != current_user.id:
        _board_record_failure(account_id)
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "This booking is not associated with your account",
        )

    _board_clear_failures(account_id)

    flight = db.scalar(select(Flight).where(Flight.id == booking.flight_id))
    if not flight:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Flight not found for this booking")

    return BoardResponse(
        flight_id=flight.id,
        flight_number=flight.flight_number,
        first_name=booked_passenger.first_name,
        origin=flight.origin,
        destination=flight.destination,
        seat_number=booking.seat_number,
        cabin_class=booking.cabin_class,
        status=flight.status,
    )


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
