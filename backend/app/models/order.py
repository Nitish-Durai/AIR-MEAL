"""PassengerOrder and OrderItem models."""

import enum
import uuid
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Float, ForeignKey, Index, Integer, String, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.flight import Flight
    from app.models.passenger import Passenger
    from app.models.crew import CrewMember
    from app.models.meal import MealItem
    from app.models.delivery import DeliveryTask
    from app.models.feedback import Feedback


class OrderStatus(str, enum.Enum):
    received = "received"
    confirmed = "confirmed"
    preparing = "preparing"
    en_route = "en_route"
    delivered = "delivered"
    cancelled = "cancelled"


class PassengerOrder(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "passenger_orders"

    flight_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("flights.id", ondelete="CASCADE"),
        nullable=False,
    )
    passenger_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("passengers.id", ondelete="CASCADE"),
        nullable=False,
    )
    seat_number: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    cabin_class: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default=OrderStatus.received.value, index=False
    )
    # Higher = more urgent (medical=10, infant=8, connecting=7, business=5, economy=1)
    priority_score: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    priority_factors: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    assigned_crew_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("crew_members.id", ondelete="SET NULL"),
        nullable=True,
    )

    flight: Mapped["Flight"] = relationship(back_populates="orders")
    passenger: Mapped["Passenger"] = relationship(back_populates="orders")
    assigned_crew: Mapped[Optional["CrewMember"]] = relationship(
        back_populates="assigned_orders",
        foreign_keys=[assigned_crew_id],
    )
    items: Mapped[list["OrderItem"]] = relationship(
        back_populates="order", cascade="all, delete-orphan"
    )
    delivery_task: Mapped[Optional["DeliveryTask"]] = relationship(
        back_populates="order", cascade="all, delete-orphan", uselist=False
    )
    feedback: Mapped[Optional["Feedback"]] = relationship(
        back_populates="order", cascade="all, delete-orphan", uselist=False
    )

    __table_args__ = (
        # Index for dashboard queries that filter by status
        Index("ix_passenger_orders_status", "status"),
    )


class OrderItem(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "order_items"

    order_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("passenger_orders.id", ondelete="CASCADE"),
        nullable=False,
    )
    meal_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("meal_items.id", ondelete="RESTRICT"),
        nullable=False,
    )
    qty: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    customisations: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)

    order: Mapped["PassengerOrder"] = relationship(back_populates="items")
    meal: Mapped["MealItem"] = relationship(back_populates="order_items")
