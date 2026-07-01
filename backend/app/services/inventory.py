"""Inventory reservation service.

Uses SELECT ... FOR UPDATE to hold a row-level lock for the duration of the
transaction, preventing concurrent over-reservation without a stored procedure.
The caller is responsible for committing or rolling back the transaction.
"""

import uuid
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.meal import FlightInventory


class InsufficientStockError(Exception):
    """Raised when the requested quantity exceeds available inventory."""

    def __init__(self, available: int, requested: int) -> None:
        super().__init__(
            f"Insufficient stock: {available} units available, {requested} requested"
        )
        self.available = available
        self.requested = requested


def reserve_inventory(
    db: Session,
    flight_id: uuid.UUID,
    meal_id: uuid.UUID,
    cabin_class: str,
    qty: int,
) -> FlightInventory:
    """Atomically reserve `qty` units for a (flight, meal, cabin_class) triple.

    Acquires a row-level lock with FOR UPDATE so that two simultaneous requests
    cannot both succeed when only one unit remains.

    Returns the updated FlightInventory row (not yet committed).
    Raises InsufficientStockError if stock would go negative.
    """
    row = db.execute(
        select(FlightInventory)
        .where(
            FlightInventory.flight_id == flight_id,
            FlightInventory.meal_id == meal_id,
            FlightInventory.cabin_class == cabin_class,
        )
        .with_for_update()
    ).scalar_one_or_none()

    if row is None:
        raise LookupError(
            f"No inventory row for flight={flight_id} meal={meal_id} cabin={cabin_class}"
        )

    available = row.current_stock
    if available < qty:
        raise InsufficientStockError(available, qty)

    row.reserved_qty += qty
    db.flush()  # Write to DB within transaction; caller commits
    return row


def release_reservation(
    db: Session,
    flight_id: uuid.UUID,
    meal_id: uuid.UUID,
    cabin_class: str,
    qty: int,
) -> FlightInventory:
    """Release a previously reserved quantity (e.g. on order cancellation)."""
    row = db.execute(
        select(FlightInventory)
        .where(
            FlightInventory.flight_id == flight_id,
            FlightInventory.meal_id == meal_id,
            FlightInventory.cabin_class == cabin_class,
        )
        .with_for_update()
    ).scalar_one_or_none()

    if row is None:
        raise LookupError(
            f"No inventory row for flight={flight_id} meal={meal_id} cabin={cabin_class}"
        )

    row.reserved_qty = max(0, row.reserved_qty - qty)
    db.flush()
    return row


def mark_served(
    db: Session,
    flight_id: uuid.UUID,
    meal_id: uuid.UUID,
    cabin_class: str,
    qty: int,
) -> FlightInventory:
    """Convert reserved → served when a delivery task completes."""
    row = db.execute(
        select(FlightInventory)
        .where(
            FlightInventory.flight_id == flight_id,
            FlightInventory.meal_id == meal_id,
            FlightInventory.cabin_class == cabin_class,
        )
        .with_for_update()
    ).scalar_one_or_none()

    if row is None:
        raise LookupError(
            f"No inventory row for flight={flight_id} meal={meal_id} cabin={cabin_class}"
        )

    actual_qty = min(qty, row.reserved_qty)
    row.reserved_qty -= actual_qty
    row.served_qty += actual_qty
    db.flush()
    return row
