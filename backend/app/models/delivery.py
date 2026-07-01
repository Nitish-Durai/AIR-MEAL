"""DeliveryTask model."""

import enum
import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.order import PassengerOrder
    from app.models.crew import CrewMember


class DeliveryStatus(str, enum.Enum):
    pending = "pending"
    in_progress = "in_progress"
    completed = "completed"


class DeliveryTask(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "delivery_tasks"

    order_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("passenger_orders.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,  # One task per order
    )
    crew_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("crew_members.id", ondelete="SET NULL"),
        nullable=True,
    )
    seat_number: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    # Position in the ACO-computed delivery route (lower = earlier)
    route_position: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default=DeliveryStatus.pending.value
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    order: Mapped["PassengerOrder"] = relationship(back_populates="delivery_task")
    crew: Mapped[Optional["CrewMember"]] = relationship(back_populates="delivery_tasks")
