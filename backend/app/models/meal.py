"""MealCategory, MealItem, and FlightInventory models."""

import uuid
from typing import TYPE_CHECKING, Optional

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    Uuid,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.flight import Flight
    from app.models.order import OrderItem


class MealCategory(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "meal_categories"

    name: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)

    meals: Mapped[list["MealItem"]] = relationship(back_populates="category")


class MealItem(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "meal_items"

    meal_code: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    category_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("meal_categories.id", ondelete="SET NULL"),
        nullable=True,
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    cuisine_type: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    ingredients: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    allergen_flags: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    dietary_flags: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    calories: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    image_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Stored as a JSON array of floats — NOT a vector type
    meal_embedding: Mapped[Optional[list]] = mapped_column(JSONB, nullable=True)
    is_alcohol: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")

    category: Mapped[Optional["MealCategory"]] = relationship(back_populates="meals")
    inventory_entries: Mapped[list["FlightInventory"]] = relationship(
        back_populates="meal"
    )
    order_items: Mapped[list["OrderItem"]] = relationship(back_populates="meal")

    __table_args__ = (
        # GIN index for fast allergen-flag containment queries
        Index(
            "ix_meal_items_allergen_gin",
            "allergen_flags",
            postgresql_using="gin",
        ),
    )


class FlightInventory(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "flight_inventory"

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
    initial_qty: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    reserved_qty: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    served_qty: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    wasted_qty: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    restock_alert_qty: Mapped[int] = mapped_column(Integer, nullable=False, default=5)

    flight: Mapped["Flight"] = relationship(back_populates="inventory")
    meal: Mapped["MealItem"] = relationship(back_populates="inventory_entries")

    @property
    def current_stock(self) -> int:
        """Derived: units not yet reserved or served."""
        return self.initial_qty - self.reserved_qty - self.served_qty

    __table_args__ = (
        # DB-level guard: can never over-reserve or over-serve
        CheckConstraint(
            "reserved_qty + served_qty <= initial_qty",
            name="ck_inventory_not_overreserved",
        ),
        CheckConstraint("initial_qty >= 0", name="ck_inventory_initial_non_negative"),
        CheckConstraint("reserved_qty >= 0", name="ck_inventory_reserved_non_negative"),
        CheckConstraint("served_qty >= 0", name="ck_inventory_served_non_negative"),
        CheckConstraint("wasted_qty >= 0", name="ck_inventory_wasted_non_negative"),
        # Partial index: only rows with available stock (avoids full scans on sold-out items)
        Index(
            "ix_flight_inventory_available",
            "flight_id",
            postgresql_where=text("initial_qty - reserved_qty - served_qty > 0"),
        ),
    )
