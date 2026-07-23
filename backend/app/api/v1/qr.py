"""QR seat-access resolution and administration endpoints."""

import urllib.parse
import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from jose import jwt
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import CurrentUser, require_role
from app.db.session import get_db
from app.models.flight import Flight, FlightSeat
from app.schemas.api_v1 import (
    QRGenerateResponse,
    ResponseEnvelope,
    success_response,
)

router = APIRouter(tags=["qr"])


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
