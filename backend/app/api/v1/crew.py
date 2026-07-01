"""Crew dashboard and task management API endpoints."""

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.core.deps import CurrentUser, require_role
from app.db.session import get_db
from app.models.delivery import DeliveryStatus, DeliveryTask
from app.models.order import OrderItem, OrderStatus, PassengerOrder
from app.models.passenger import PassengerProfile
from app.schemas.api_v1 import (
    CrewDashboardTaskResponse,
    ResponseEnvelope,
    TaskStatusUpdateRequest,
    success_response,
)
from app.ws.connection_manager import manager

router = APIRouter(tags=["crew"])


# Helper to convert ORM order to DTO (needed for WS notifications)
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
            }
            for item in order.items
        ],
    }


@router.get("/crew/dashboard", response_model=ResponseEnvelope[list[CrewDashboardTaskResponse]])
def get_crew_dashboard(
    assigned_to_me: bool = False,
    flight_id: Optional[uuid.UUID] = None,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role("crew", "admin")),
) -> dict:
    """
    Get active delivery tasks for the crew dashboard.
    Sorted by priority score descending.
    Injects allergen warning badges and ordered item names.
    """
    # Query active tasks (not completed)
    query = select(DeliveryTask).where(DeliveryTask.status != DeliveryStatus.completed.value)
    if assigned_to_me:
        query = query.where(DeliveryTask.crew_id == current_user.id)
    if flight_id is not None:
        query = query.join(PassengerOrder, DeliveryTask.order_id == PassengerOrder.id).where(
            PassengerOrder.flight_id == flight_id
        )

    tasks = (
        db.scalars(
            query
            .options(
                joinedload(DeliveryTask.order)
                .joinedload(PassengerOrder.items)
                .joinedload(OrderItem.meal)
            )
        )
        .unique()
        .all()
    )

    # Sort by priority score desc, then by order creation time desc (newest first)
    from datetime import datetime, timezone
    def _sort_key(t):
        created = (t.order.created_at if t.order and t.order.created_at else datetime.min.replace(tzinfo=timezone.utc))
        pscore = t.order.priority_score if t.order else 0.0
        return (created, pscore)
    tasks_sorted = sorted(tasks, key=_sort_key, reverse=True)

    response_data = []
    for task in tasks_sorted:
        order = task.order
        if not order:
            continue

        # Fetch passenger profile to identify allergens
        profile = db.scalar(
            select(PassengerProfile).where(PassengerProfile.passenger_id == order.passenger_id)
        )
        allergy_flags = profile.allergy_flags if profile else {}

        # Scan meals in the order for conflicts
        allergen_warnings = []
        ordered_items = []
        for item in order.items:
            meal = item.meal
            if not meal:
                continue

            # Item description string
            ordered_items.append(f"{item.qty}x {meal.meal_code} {meal.name}")

            # Check allergens
            meal_allergens = meal.allergen_flags or {}
            for allergen, is_allergic in allergy_flags.items():
                if is_allergic and meal_allergens.get(allergen):
                    if allergen not in allergen_warnings:
                        allergen_warnings.append(allergen)

        response_data.append(
            CrewDashboardTaskResponse(
                id=task.id,
                order_id=task.order_id,
                crew_id=task.crew_id,
                seat_number=task.seat_number,
                route_position=task.route_position,
                status=task.status,
                order_status=order.status,
                priority_score=order.priority_score,
                allergen_warnings=allergen_warnings,
                ordered_items=ordered_items,
                priority_factors=(order.priority_factors or []) if order else [],
                created_at=task.created_at,
            )
        )

    return success_response(response_data)


@router.put("/tasks/{id}/status", response_model=ResponseEnvelope[CrewDashboardTaskResponse])
async def update_task_status(
    id: uuid.UUID,
    payload: TaskStatusUpdateRequest,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role("crew", "admin")),
) -> dict:
    """
    Update delivery task status by advancing the associated order through its lifecycle stages.
    Validates forward-only transitions, sets order status, and keeps task status synced underneath.
    """
    task = db.scalar(
        select(DeliveryTask)
        .options(
            joinedload(DeliveryTask.order)
            .joinedload(PassengerOrder.items)
            .joinedload(OrderItem.meal)
        )
        .where(DeliveryTask.id == id)
    )
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )

    order = task.order
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Order not found",
        )

    new_status = payload.status.lower().strip()

    ALLOWED_NEXT = {
        OrderStatus.received.value:  OrderStatus.confirmed.value,
        OrderStatus.confirmed.value: OrderStatus.preparing.value,
        OrderStatus.preparing.value: OrderStatus.en_route.value,
        OrderStatus.en_route.value:  OrderStatus.delivered.value,
    }

    expected_next = ALLOWED_NEXT.get(order.status)
    if not expected_next:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Order is already in a terminal state and cannot be advanced.",
        )

    valid_stages = {
        OrderStatus.confirmed.value,
        OrderStatus.preparing.value,
        OrderStatus.en_route.value,
        OrderStatus.delivered.value,
    }

    if new_status not in valid_stages or new_status != expected_next:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot move order from '{order.status}' to '{new_status}'; next allowed stage is '{expected_next}'.",
        )

    # Update order status
    order.status = new_status

    # Keep the delivery task's own status synced as a derived coarse value
    if new_status in (OrderStatus.received.value, OrderStatus.confirmed.value, OrderStatus.preparing.value):
        task.status = DeliveryStatus.pending.value
    elif new_status == OrderStatus.en_route.value:
        task.status = DeliveryStatus.in_progress.value
    elif new_status == OrderStatus.delivered.value:
        task.status = DeliveryStatus.completed.value

    db.commit()
    db.refresh(task)

    # ── Resolve allergens & items for response ──
    profile = db.scalar(
        select(PassengerProfile).where(PassengerProfile.passenger_id == order.passenger_id)
    )
    allergy_flags = profile.allergy_flags if profile else {}

    allergen_warnings = []
    ordered_items = []
    for item in order.items:
        meal = item.meal
        if not meal:
            continue
        ordered_items.append(f"{item.qty}x {meal.meal_code} {meal.name}")
        meal_allergens = meal.allergen_flags or {}
        for allergen, is_allergic in allergy_flags.items():
            if is_allergic and meal_allergens.get(allergen):
                if allergen not in allergen_warnings:
                    allergen_warnings.append(allergen)

    task_res = CrewDashboardTaskResponse(
        id=task.id,
        order_id=task.order_id,
        crew_id=task.crew_id,
        seat_number=task.seat_number,
        route_position=task.route_position,
        status=task.status,
        order_status=order.status if order else "received",
        priority_score=order.priority_score if order else 1.0,
        allergen_warnings=allergen_warnings,
        ordered_items=ordered_items,
        priority_factors=(order.priority_factors or []) if order else [],
        created_at=task.created_at,
    )

    # Dispatch updates to passenger and flight connections
    if order:
        order_dto = _to_order_dto(order)
        # Notify Passenger Order status update
        await manager.send_to_user(order.passenger_id, "ORDER_STATUS_UPDATE", order_dto)
        await manager.broadcast_to_flight(order.flight_id, "ORDER_STATUS_UPDATE", order_dto)

        # Notify special delivery completed event
        if new_status == OrderStatus.delivered.value:
            delivery_data = {"order_id": str(order.id), "seat_number": order.seat_number}
            await manager.send_to_user(order.passenger_id, "DELIVERY_COMPLETE", delivery_data)
            await manager.broadcast_to_flight(order.flight_id, "DELIVERY_COMPLETE", delivery_data)

    return success_response(task_res)
