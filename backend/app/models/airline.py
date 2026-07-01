"""Airline model."""

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.flight import Flight
    from app.models.crew import CrewMember


class Airline(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "airlines"

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    code: Mapped[str] = mapped_column(String(10), nullable=False, unique=True)

    flights: Mapped[list["Flight"]] = relationship(
        back_populates="airline", cascade="all, delete-orphan"
    )
    crew_members: Mapped[list["CrewMember"]] = relationship(
        back_populates="airline", cascade="all, delete-orphan"
    )
