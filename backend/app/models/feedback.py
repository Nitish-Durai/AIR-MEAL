"""Feedback model."""

import uuid
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Float, ForeignKey, Integer, Text, Uuid
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.order import PassengerOrder


class Feedback(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "feedback"

    order_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("passenger_orders.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,  # One feedback per order
    )
    overall_rating: Mapped[int] = mapped_column(Integer, nullable=False)
    taste_rating: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    temp_rating: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    portion_rating: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    speed_rating: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    # PostgreSQL text[] column for curated tags (e.g. ["great-taste", "quick-delivery"])
    tags: Mapped[Optional[list]] = mapped_column(ARRAY(String), nullable=True)
    free_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Computed by sentiment model in Phase 5; NULL until then
    sentiment_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    order: Mapped["PassengerOrder"] = relationship(back_populates="feedback")
