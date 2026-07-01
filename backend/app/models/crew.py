"""Crew member model."""

import enum
import uuid
from typing import TYPE_CHECKING, Optional

from sqlalchemy import ForeignKey, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.airline import Airline
    from app.models.order import PassengerOrder
    from app.models.delivery import DeliveryTask


class CrewRole(str, enum.Enum):
    captain = "captain"
    purser = "purser"
    senior_cabin_crew = "senior_cabin_crew"
    cabin_crew = "cabin_crew"
    ground_operations = "ground_operations"


class CrewMember(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "crew_members"

    employee_id: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    role: Mapped[CrewRole] = mapped_column(
        String(30), nullable=False
    )
    airline_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("airlines.id", ondelete="CASCADE"), nullable=False
    )
    assigned_zone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    hashed_password: Mapped[str] = mapped_column(String(200), nullable=False)
    email: Mapped[str] = mapped_column(String(254), nullable=False, unique=True)

    airline: Mapped["Airline"] = relationship(back_populates="crew_members")
    assigned_orders: Mapped[list["PassengerOrder"]] = relationship(
        back_populates="assigned_crew", foreign_keys="PassengerOrder.assigned_crew_id"
    )
    delivery_tasks: Mapped[list["DeliveryTask"]] = relationship(
        back_populates="crew"
    )
