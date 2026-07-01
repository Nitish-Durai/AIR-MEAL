"""Flight and FlightSeat models."""

import enum
import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, Float, ForeignKey, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.airline import Airline
    from app.models.meal import FlightInventory
    from app.models.order import PassengerOrder


class FlightStatus(str, enum.Enum):
    scheduled = "scheduled"
    boarding = "boarding"
    in_flight = "in_flight"
    landed = "landed"
    cancelled = "cancelled"
    delayed = "delayed"


class CabinClass(str, enum.Enum):
    economy = "economy"
    premium_economy = "premium_economy"
    business = "business"
    first = "first"


class Flight(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "flights"

    flight_number: Mapped[str] = mapped_column(String(20), nullable=False)
    airline_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("airlines.id", ondelete="CASCADE"), nullable=False
    )
    origin: Mapped[str] = mapped_column(String(10), nullable=False)
    destination: Mapped[str] = mapped_column(String(10), nullable=False)
    dep_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    arr_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    aircraft_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    load_factor: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default=FlightStatus.scheduled.value
    )

    airline: Mapped["Airline"] = relationship(back_populates="flights")
    seats: Mapped[list["FlightSeat"]] = relationship(
        back_populates="flight", cascade="all, delete-orphan"
    )
    inventory: Mapped[list["FlightInventory"]] = relationship(
        back_populates="flight", cascade="all, delete-orphan"
    )
    orders: Mapped[list["PassengerOrder"]] = relationship(
        back_populates="flight", cascade="all, delete-orphan"
    )


class FlightSeat(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "flight_seats"

    flight_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("flights.id", ondelete="CASCADE"), nullable=False
    )
    seat_number: Mapped[str] = mapped_column(String(10), nullable=False)
    cabin_class: Mapped[str] = mapped_column(String(20), nullable=False)

    flight: Mapped["Flight"] = relationship(back_populates="seats")
