"""QR seat-access resolution and administration endpoints."""

import urllib.parse
import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import CurrentUser, require_role
from app.core.security import create_access_token, hash_password
from app.db.session import get_db
from app.models.flight import Flight, FlightSeat
from app.models.passenger import Passenger, PassengerProfile
from app.schemas.api_v1 import (
    QRGenerateResponse,
    QRResolveResponse,
    ResponseEnvelope,
    success_response,
)

router = APIRouter(tags=["qr"])


@router.get("/qr/resolve", response_model=ResponseEnvelope[QRResolveResponse])
def resolve_qr_code(
    code: str = Query(..., description="The signed QR seat token"),
    db: Session = Depends(get_db),
) -> dict:
    """
    Resolve a seat QR code token.
    Decodes the token, provisions a temporary guest passenger account in the DB
    to respect foreign keys, and returns a signed passenger access JWT.
    """
    try:
        payload = jwt.decode(
            code,
            settings.JWT_SECRET,
            algorithms=[settings.JWT_ALGORITHM],
        )
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid or expired QR token: {exc}",
        )

    if payload.get("type") != "qr_code":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid token type",
        )

    flight_id_str = payload.get("flight_id")
    seat_number = payload.get("seat_number")
    cabin_class = payload.get("cabin_class")

    if not all([flight_id_str, seat_number, cabin_class]):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing claims in token",
        )

    try:
        flight_id = uuid.UUID(flight_id_str)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid flight UUID",
        )

    # Verify flight and seat exist in DB
    flight = db.scalar(select(Flight).where(Flight.id == flight_id))
    if not flight:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Flight not found",
        )

    # Retrieve or provision guest passenger account
    guest_email = f"guest_{flight_id_str}_{seat_number.lower()}@airmeal.guest"
    passenger = db.scalar(select(Passenger).where(Passenger.email == guest_email))

    if not passenger:
        # Create guest account
        passenger = Passenger(
            id=uuid.uuid4(),
            pnr=f"G{uuid.uuid4().hex[:5].upper()}",
            first_name="Guest",
            last_name=f"Seat {seat_number}",
            email=guest_email,
            hashed_password=hash_password("guest"),
        )
        db.add(passenger)
        db.flush()

        profile = PassengerProfile(
            passenger_id=passenger.id,
            dietary_flags={},
            allergy_flags={},
            cuisine_prefs={},
            portion_pref="medium",
            price_sensitivity="mid",
        )
        db.add(profile)
        db.commit()
        db.refresh(passenger)

    # Generate JWT passenger token
    token = create_access_token(
        subject=str(passenger.id),
        email=passenger.email,
        role="passenger",
    )

    res = QRResolveResponse(
        flight_id=flight_id,
        seat_number=seat_number,
        cabin_class=cabin_class,
        token=token,
    )
    return success_response(res)


# Admin endpoint to generate QR tokens for a flight
@router.post("/admin/flights/{id}/qr-codes", response_model=ResponseEnvelope[list[QRGenerateResponse]])
def generate_flight_qr_codes(
    id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role("admin")),
) -> dict:
    """
    Generate signed seat QR tokens and code URLs for all flight seats.
    Requires admin role.
    """
    flight = db.scalar(select(Flight).where(Flight.id == id))
    if not flight:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Flight not found",
        )

    # Fetch all seats
    seats = db.scalars(
        select(FlightSeat).where(FlightSeat.flight_id == id)
    ).all()

    qr_list = []
    for seat in seats:
        # Build token payload
        payload = {
            "type": "qr_code",
            "flight_id": str(id),
            "seat_number": seat.seat_number,
            "cabin_class": seat.cabin_class,
        }
        qr_token = jwt.encode(
            payload,
            settings.JWT_SECRET,
            algorithm=settings.JWT_ALGORITHM,
        )

        # Build URL and URL encode it for the QR code API
        client_landing_url = f"{settings.PUBLIC_FRONTEND_URL}/seat?code={qr_token}"
        encoded_url = urllib.parse.quote_plus(client_landing_url)
        qr_code_url = f"https://api.qrserver.com/v1/create-qr-code/?size=150x150&data={encoded_url}"

        qr_list.append(
            QRGenerateResponse(
                seat_number=seat.seat_number,
                cabin_class=seat.cabin_class,
                qr_token=qr_token,
                qr_code_url=qr_code_url,
            )
        )

    return success_response(qr_list)
