"""WasteIntervention model — records crew decisions on high-waste meals."""

import uuid
from typing import Optional

from sqlalchemy import ForeignKey, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class WasteIntervention(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "waste_interventions"

    flight_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("flights.id", ondelete="CASCADE"),
        nullable=False,
    )
    meal_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("meal_items.id", ondelete="CASCADE"),
        nullable=False,
    )
    cabin_class: Mapped[str] = mapped_column(String(20), nullable=False)
    # One of: "offer_free", "offer_discount", "crew_meal"
    action: Mapped[str] = mapped_column(String(20), nullable=False)
    # Crew member who made the decision (nullable for safety)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid(as_uuid=True), nullable=True)

    __table_args__ = (
        # One active intervention per (flight, meal, cabin)
        UniqueConstraint("flight_id", "meal_id", "cabin_class", name="uq_waste_intervention_target"),
    )
