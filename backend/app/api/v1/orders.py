"""Orders API endpoints."""

import uuid
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.core.deps import CurrentUser, get_current_user, require_role
from app.db.session import get_db
from app.models.crew import CrewMember
from app.models.delivery import DeliveryStatus, DeliveryTask
from app.models.flight import Flight
from app.models.meal import FlightInventory, MealItem
from app.models.order import OrderItem, OrderStatus, PassengerOrder
from app.models.passenger import PassengerProfile
from app.schemas.api_v1 import (
    OrderCreateRequest,
    OrderResponse,
    OrderTrackingResponse,
    ResponseEnvelope,
    success_response,
)
from app.ws.connection_manager import manager

router = APIRouter(prefix="/orders", tags=["orders"])

# Single-select courses: an order may contain at most one item from each of
# these categories, mirroring fixed-tray inflight service. Beverages, snacks,
# and alcohol are unconstrained. Enforced server-side; the UI is never trusted.
SINGLE_SELECT_CATEGORIES = {"Starters", "Main Course", "Desserts"}


# Helper to convert ORM order to DTO
def _to_order_dto(order: PassengerOrder) -> dict:
    return {
        "id": order.id,
        "flight_id": order.flight_id,
        "passenger_id": order.passenger_id,
        "seat_number": order.seat_number,
        "cabin_class": order.cabin_class,
        "status": order.status,
        "priority_score": order.priority_score,
        "assigned_crew_id": order.assigned_crew_id,
        "created_at": order.created_at,
        "updated_at": order.updated_at,
        "items": [
            {
                "id": item.id,
                "meal_id": item.meal_id,
                "qty": item.qty,
                "customisations": item.customisations,
                "meal_name": item.meal.name if item.meal else None,
                "meal_code": item.meal.meal_code if item.meal else None,
                "category_name": (
                    item.meal.category.name
                    if item.meal and item.meal.category
                    else None
                ),
                "is_alcohol": item.meal.is_alcohol if item.meal else False,
            }
            for item in order.items
        ],
    }


@router.post("", response_model=ResponseEnvelope[OrderResponse])
async def place_order(
    payload: OrderCreateRequest,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role("passenger")),
) -> dict:
    """
    Place a new meal order.
    Enforces allergen hard-gate and handles atomic inventory lock reservation.
    """
    # 1. Preload all ordered meals with their category (needed by both gates below).
    meal_ids = [item.meal_id for item in payload.items]
    meals = db.scalars(
        select(MealItem)
        .options(joinedload(MealItem.category))
        .where(MealItem.id.in_(meal_ids))
    ).all()
    meal_map = {m.id: m for m in meals}

    for item in payload.items:
        if item.meal_id not in meal_map:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Meal {item.meal_id} not found",
            )

    # 1a. Course Gate: at most one item per single-select course, qty 1 each.
    course_counts: dict[str, int] = {}
    for item in payload.items:
        meal = meal_map[item.meal_id]
        if meal.is_alcohol:
            continue
        category_name = meal.category.name if meal.category else None
        if category_name not in SINGLE_SELECT_CATEGORIES:
            continue
        if item.qty != 1:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Only one {category_name.rstrip('s')} may be ordered per meal service.",
            )
        course_counts[category_name] = course_counts.get(category_name, 0) + 1
        if course_counts[category_name] > 1:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Only one {category_name.rstrip('s')} may be ordered per meal service.",
            )

    # 1b. Allergen Gate: verify passenger allergies if a profile exists
    profile = db.scalar(
        select(PassengerProfile).where(PassengerProfile.passenger_id == current_user.id)
    )
    if profile:
        allergy_flags = profile.allergy_flags or {}
        for item in payload.items:
            meal = meal_map[item.meal_id]
            meal_allergens = meal.allergen_flags or {}
            for allergen, is_allergic in allergy_flags.items():
                if is_allergic and meal_allergens.get(allergen):
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail=f"Allergen conflict: meal '{meal.name}' contains {allergen} which conflicts with your profile.",
                    )

    # 2. Lock inventory and update inside transaction
    # Get flight information
    flight = db.scalar(select(Flight).where(Flight.id == payload.flight_id))
    if not flight:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Flight not found",
        )

    # Max-wins priority: cabin baseline vs declared special needs.
    cabin_priority = {"first": 10.0, "business": 7.0, "premium_economy": 4.0, "economy": 1.0}
    priority = cabin_priority.get(payload.cabin_class.lower().strip(), 1.0)
    factors = [f for f in (payload.priority_factors or []) if f in ("medical", "infant", "connecting")]
    factor_scores = {"medical": 10.0, "infant": 7.0, "connecting": 6.0}
    for f in factors:
        priority = max(priority, factor_scores[f])

    # Zone-aware crew assignment: find the crew member already serving the
    # same cabin and nearest seat row on THIS flight (from existing tasks).
    def _row_num(seat: str) -> int:
        digits = "".join(ch for ch in (seat or "") if ch.isdigit())
        return int(digits) if digits else 0
    target_row = _row_num(payload.seat_number)
    # Pull existing tasks on this flight with their order's seat + cabin + crew.
    existing = db.execute(
        select(DeliveryTask.crew_id, PassengerOrder.seat_number, PassengerOrder.cabin_class)
        .join(PassengerOrder, DeliveryTask.order_id == PassengerOrder.id)
        .where(PassengerOrder.flight_id == payload.flight_id)
    ).all()
    crew_member = None
    same_cabin = [
        (cid, seat) for (cid, seat, cab) in existing
        if cid and cab == payload.cabin_class.lower().strip()
    ]
    if same_cabin:
        # Choose the crew serving the seat closest in row number (same zone).
        best = min(same_cabin, key=lambda cs: abs(_row_num(cs[1]) - target_row))
        best_crew_id = best[0]
        crew_member = db.scalars(
            select(CrewMember).where(CrewMember.id == best_crew_id).limit(1)
        ).first()
    # Fallbacks: airline crew, then any crew.
    if not crew_member:
        crew_member = db.scalars(
            select(CrewMember).where(CrewMember.airline_id == flight.airline_id).limit(1)
        ).first()
    if not crew_member:
        crew_member = db.scalars(select(CrewMember).limit(1)).first()

    # Create order object
    order = PassengerOrder(
        id=uuid.uuid4(),
        flight_id=payload.flight_id,
        passenger_id=current_user.id,
        seat_number=payload.seat_number,
        cabin_class=payload.cabin_class.lower().strip(),
        status=OrderStatus.received.value,
        priority_score=priority,
        priority_factors=factors or None,
        assigned_crew_id=crew_member.id if crew_member else None,
    )
    db.add(order)

    # Deduct stock under FOR UPDATE lock
    for item in payload.items:
        inv = db.scalar(
            select(FlightInventory)
            .where(
                FlightInventory.flight_id == payload.flight_id,
                FlightInventory.meal_id == item.meal_id,
                FlightInventory.cabin_class == payload.cabin_class.lower().strip(),
            )
            .with_for_update()
        )

        if not inv or inv.current_stock < item.qty:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Meal {item.meal_id} is out of stock in {payload.cabin_class}.",
            )

        # Update inventory
        inv.reserved_qty += item.qty

        # Create OrderItem
        order_item = OrderItem(
            id=uuid.uuid4(),
            order_id=order.id,
            meal_id=item.meal_id,
            qty=item.qty,
            customisations=item.customisations,
        )
        db.add(order_item)

    # 3. Create Delivery Task
    delivery_task = DeliveryTask(
        id=uuid.uuid4(),
        order_id=order.id,
        crew_id=order.assigned_crew_id,
        seat_number=order.seat_number,
        route_position=99,  # Appends to route queue
        status=DeliveryStatus.pending.value,
    )
    db.add(delivery_task)

    db.commit()
    db.refresh(order)

    # Load items relationship with meal names
    order_updated = db.scalar(
        select(PassengerOrder)
        .options(joinedload(PassengerOrder.items).joinedload(OrderItem.meal))
        .where(PassengerOrder.id == order.id)
    )

    dto = _to_order_dto(order_updated)

    # 4. Notify WebSocket connection manager
    await manager.send_to_user(order.passenger_id, "ORDER_STATUS_UPDATE", dto)
    await manager.broadcast_to_flight(order.flight_id, "ORDER_STATUS_UPDATE", dto)

    return success_response(dto)


@router.get("/{id}", response_model=ResponseEnvelope[OrderResponse])
def get_order(
    id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Retrieve details of a passenger order by ID."""
    order = db.scalar(
        select(PassengerOrder)
        .options(
            joinedload(PassengerOrder.items)
            .joinedload(OrderItem.meal)
            .joinedload(MealItem.category)
        )
        .where(PassengerOrder.id == id)
    )
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Order not found",
        )

    # Enforce access control: passengers can only view their own orders
    if current_user.role == "passenger" and order.passenger_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied",
        )

    return success_response(_to_order_dto(order))


@router.put("/{id}/cancel", response_model=ResponseEnvelope[OrderResponse])
async def cancel_order(
    id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role("passenger")),
) -> dict:
    """
    Cancel an order (only allowed if status is received or confirmed).
    Restores inventory reservations.
    """
    order = db.scalar(
        select(PassengerOrder)
        .options(joinedload(PassengerOrder.items).joinedload(OrderItem.meal))
        .where(PassengerOrder.id == id)
    )
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Order not found",
        )

    if order.passenger_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot cancel another passenger's order",
        )

    if order.status not in (OrderStatus.received.value, OrderStatus.confirmed.value):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot cancel order in status '{order.status}'.",
        )

    # Update status and lock inventory rows for rollback update
    order.status = OrderStatus.cancelled.value

    # Cancel the delivery task
    if order.delivery_task:
        db.delete(order.delivery_task)

    for item in order.items:
        inv = db.scalar(
            select(FlightInventory)
            .where(
                FlightInventory.flight_id == order.flight_id,
                FlightInventory.meal_id == item.meal_id,
                FlightInventory.cabin_class == order.cabin_class,
            )
            .with_for_update()
        )
        if inv:
            inv.reserved_qty = max(0, inv.reserved_qty - item.qty)

    db.commit()
    db.refresh(order)

    dto = _to_order_dto(order)

    # Dispatch cancel events
    await manager.send_to_user(order.passenger_id, "ORDER_STATUS_UPDATE", dto)
    await manager.broadcast_to_flight(order.flight_id, "ORDER_STATUS_UPDATE", dto)

    return success_response(dto)


@router.get("/{id}/tracking", response_model=ResponseEnvelope[OrderTrackingResponse])
def track_order(
    id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Retrieve delivery progress/ETA updates for an order."""
    order = db.scalar(
        select(PassengerOrder)
        .options(joinedload(PassengerOrder.assigned_crew))
        .where(PassengerOrder.id == id)
    )
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Order not found",
        )

    if current_user.role == "passenger" and order.passenger_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied",
        )

    # Compute realistic ETA based on status
    eta_map = {
        OrderStatus.received.value: 15,
        OrderStatus.confirmed.value: 12,
        OrderStatus.preparing.value: 8,
        OrderStatus.en_route.value: 3,
        OrderStatus.delivered.value: 0,
        OrderStatus.cancelled.value: 0,
    }
    eta = eta_map.get(order.status, 15)

    res = OrderTrackingResponse(
        order_id=order.id,
        status=order.status,
        updated_at=order.updated_at,
        eta_minutes=eta,
        assigned_crew_name=order.assigned_crew.name if order.assigned_crew else None,
    )
    return success_response(res)
