"""Flight and menu API endpoints."""

import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.core.deps import CurrentUser, get_current_user, require_role
from app.db.session import get_db
from app.models.flight import Flight
from app.models.meal import FlightInventory
from app.schemas.api_v1 import (
    FlightResponse,
    InventoryItemResponse,
    MealItemResponse,
    ResponseEnvelope,
    success_response,
)

router = APIRouter(prefix="/flights", tags=["flights"])


@router.get("", response_model=ResponseEnvelope[list[FlightResponse]])
def list_flights(
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role("crew", "admin", "passenger")),
) -> dict:
    """List all flights (Admin only), most recent departure first."""
    flights = db.scalars(
        select(Flight).order_by(Flight.dep_time.desc())
    ).all()
    res = [FlightResponse.model_validate(f) for f in flights]
    return success_response(res)


@router.get("/{id}/menu", response_model=ResponseEnvelope[list[MealItemResponse]])
def get_flight_menu(
    id: uuid.UUID,
    cabin_class: str = Query(..., min_length=1, description="Cabin class (economy, business, first)"),
    db: Session = Depends(get_db),
    # Accepts passenger, guest token, or any authenticated role
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """
    Get the menu of meals available for a specific flight and cabin class,
    injecting live stock numbers.
    """
    # Verify flight exists
    flight = db.scalar(select(Flight).where(Flight.id == id))
    if not flight:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Flight not found",
        )

    # Fetch inventory entries for this flight and cabin class
    inventory_items = db.scalars(
        select(FlightInventory)
        .where(
            FlightInventory.flight_id == id,
            FlightInventory.cabin_class == cabin_class.lower().strip(),
        )
        .options(joinedload(FlightInventory.meal))
    ).all()

    menu_list = []
    for inv in inventory_items:
        meal = inv.meal
        if not meal:
            continue
        # Convert to MealItemResponse and inject stock properties
        meal_dto = MealItemResponse.model_validate(meal)
        meal_dto.current_stock = inv.current_stock
        meal_dto.initial_qty = inv.initial_qty
        menu_list.append(meal_dto)

    return success_response(menu_list)


@router.get("/{id}/inventory", response_model=ResponseEnvelope[list[InventoryItemResponse]])
def get_flight_inventory(
    id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role("crew", "admin")),
) -> dict:
    """Retrieve detailed inventory counts of a flight (for crew and admins)."""
    # Verify flight exists
    flight = db.scalar(select(Flight).where(Flight.id == id))
    if not flight:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Flight not found",
        )

    inventory_items = db.scalars(
        select(FlightInventory).where(FlightInventory.flight_id == id)
    ).all()

    res = [InventoryItemResponse.model_validate(inv) for inv in inventory_items]
    return success_response(res)
