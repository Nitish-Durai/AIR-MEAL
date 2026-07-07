"""Booking model — links a passenger to a specific flight, seat, and PNR."""

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, String, Uuid, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.flight import Flight
    from app.models.passenger import Passenger


class Booking(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "bookings"

    pnr: Mapped[str] = mapped_column(String(20), nullable=False, unique=True, index=True)
    passenger_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("passengers.id", ondelete="CASCADE"),
        nullable=False,
    )
    flight_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("flights.id", ondelete="CASCADE"),
        nullable=False,
    )
    seat_number: Mapped[str] = mapped_column(String(10), nullable=False)
    cabin_class: Mapped[str] = mapped_column(String(20), nullable=False)

    passenger: Mapped["Passenger"] = relationship()
    flight: Mapped["Flight"] = relationship()

    __table_args__ = (
        UniqueConstraint("flight_id", "seat_number", name="uq_booking_flight_seat"),
    )
