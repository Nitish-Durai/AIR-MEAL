"""Passenger and PassengerProfile models."""

import uuid
from datetime import date, datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, Date, ForeignKey, String, Text, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.order import PassengerOrder


class Passenger(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "passengers"

    pnr: Mapped[str] = mapped_column(String(20), nullable=False, unique=True)
    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name: Mapped[str] = mapped_column(String(100), nullable=False)
    dob: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    nationality: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    email: Mapped[str] = mapped_column(String(254), nullable=False, unique=True)
    hashed_password: Mapped[str] = mapped_column(String(200), nullable=False)
    # Frequent flyer tier: Bronze, Silver, Gold, Platinum — stored as plain string
    ffp_tier: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    # Priority-relevant traveller attributes (drive priority_score via max-wins)
    is_medical: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    has_infant: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    is_connecting: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")

    profile: Mapped[Optional["PassengerProfile"]] = relationship(
        back_populates="passenger",
        cascade="all, delete-orphan",
        uselist=False,
    )
    orders: Mapped[list["PassengerOrder"]] = relationship(
        back_populates="passenger", cascade="all, delete-orphan"
    )


class PassengerProfile(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "passenger_profiles"

    passenger_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("passengers.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    dietary_flags: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    allergy_flags: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    cuisine_prefs: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    # E.g. "small", "medium", "large"
    portion_pref: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    # E.g. "budget", "mid", "premium"
    price_sensitivity: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    # 32-dim float vector stored as a JSON array — NOT a pgvector type
    preference_embedding: Mapped[Optional[list]] = mapped_column(JSONB, nullable=True)

    passenger: Mapped["Passenger"] = relationship(back_populates="profile")
