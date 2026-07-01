"""Admin API endpoints for flight management, inventory, crew assignment, and analytics."""

import csv
import io
import uuid
from typing import Optional
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser, require_role
from app.db.session import get_db
from app.models.airline import Airline
from app.models.crew import CrewMember
from app.models.feedback import Feedback
from app.models.flight import Flight, FlightSeat
from app.models.meal import FlightInventory, MealItem
from app.models.order import PassengerOrder, OrderStatus
from app.schemas.api_v1 import (
    AirlineResponse,
    CrewAssignmentRequest,
    FlightAnalyticsSummaryResponse,
    FlightCreateRequest,
    FlightResponse,
    InventoryItemResponse,
    InventoryLoadRequest,
    ResponseEnvelope,
    success_response,
)

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/airlines", response_model=ResponseEnvelope[list[AirlineResponse]])
def list_airlines(
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role("admin")),
) -> dict:
    """List all airlines (Admin only) — for the flight-creation airline picker."""
    airlines = db.scalars(select(Airline).order_by(Airline.name)).all()
    return success_response([AirlineResponse.model_validate(a) for a in airlines])



@router.post("/flights", response_model=ResponseEnvelope[FlightResponse], status_code=status.HTTP_201_CREATED)
def create_flight(
    payload: FlightCreateRequest,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role("admin")),
) -> dict:
    """Create a new flight (Admin only)."""
    # Check if flight number already exists
    existing = db.scalar(select(Flight).where(Flight.flight_number == payload.flight_number))
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Flight number {payload.flight_number} already exists",
        )

    flight = Flight(
        id=uuid.uuid4(),
        flight_number=payload.flight_number,
        airline_id=payload.airline_id,
        origin=payload.origin,
        destination=payload.destination,
        dep_time=payload.dep_time,
        arr_time=payload.arr_time,
        aircraft_type=payload.aircraft_type,
        load_factor=payload.load_factor or 0.0,
        status=payload.status,
    )
    db.add(flight)
    
    # Provision default seats for aircraft configurations
    # Simple defaults: 12 business, 20 premium economy, and 150 economy seats
    seats = []
    # Business seats: Rows 1-3, Columns A-D
    for r in range(1, 4):
        for col in ["A", "B", "C", "D"]:
            seats.append(FlightSeat(id=uuid.uuid4(), flight_id=flight.id, seat_number=f"J{r}{col}", cabin_class="business"))
    # Premium Economy seats: Rows 4-7, Columns A-E
    for r in range(4, 8):
        for col in ["A", "B", "C", "D", "E"]:
            seats.append(FlightSeat(id=uuid.uuid4(), flight_id=flight.id, seat_number=f"W{r}{col}", cabin_class="premium_economy"))
    # Economy seats: Rows 8-32, Columns A-F
    for r in range(8, 33):
        for col in ["A", "B", "C", "D", "E", "F"]:
            seats.append(FlightSeat(id=uuid.uuid4(), flight_id=flight.id, seat_number=f"Y{r}{col}", cabin_class="economy"))
            
    db.add_all(seats)
    db.commit()
    db.refresh(flight)

    return success_response(FlightResponse.model_validate(flight))


# Demo anchor flight — protected from deletion so the live demo can never be destroyed.
_PROTECTED_FLIGHT_ID = uuid.UUID("b159aea5-2cf0-4e54-a8b2-183078d41915")


@router.delete("/flights/{id}", response_model=ResponseEnvelope[dict])
def delete_flight(
    id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role("admin")),
) -> dict:
    """Delete a flight and all its dependent rows (Admin only).

    All child tables (seats, inventory, orders -> order_items / delivery_tasks /
    feedback, waste_interventions, QR/seat rows) reference flights.id with
    ON DELETE CASCADE, so removing the flight removes its entire subtree in one
    transaction. No migration required.
    """
    if id == _PROTECTED_FLIGHT_ID:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="The demo flight SV209 is protected and cannot be deleted.",
        )

    flight = db.scalar(select(Flight).where(Flight.id == id))
    if not flight:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Flight not found",
        )

    flight_number = flight.flight_number
    db.delete(flight)
    db.commit()

    return success_response({"id": str(id), "flight_number": flight_number, "deleted": True})


@router.post("/flights/{id}/assign-crew", response_model=ResponseEnvelope[list[str]])
def assign_crew_to_flight(
    id: uuid.UUID,
    payload: CrewAssignmentRequest,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role("admin")),
) -> dict:
    """Assign crew members and their operational zones for a flight."""
    flight = db.scalar(select(Flight).where(Flight.id == id))
    if not flight:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Flight not found",
        )

    updated_crew_names = []
    for crew_id in payload.crew_ids:
        crew = db.scalar(select(CrewMember).where(CrewMember.id == crew_id))
        if not crew:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Crew member {crew_id} not found",
            )
        if crew.airline_id != flight.airline_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Crew member {crew.name} belongs to a different airline",
            )
        # Update crew member's active zone
        crew.assigned_zone = payload.zone
        updated_crew_names.append(crew.name)

    db.commit()
    return success_response(updated_crew_names)


@router.post("/flights/{id}/inventory/load", response_model=ResponseEnvelope[InventoryItemResponse])
def load_single_inventory(
    id: uuid.UUID,
    payload: InventoryLoadRequest,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role("admin")),
) -> dict:
    """Load or update inventory for a single meal item (Admin only)."""
    flight = db.scalar(select(Flight).where(Flight.id == id))
    if not flight:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Flight not found",
        )

    meal = db.scalar(select(MealItem).where(MealItem.id == payload.meal_id))
    if not meal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Meal not found",
        )

    # Check if inventory entry exists (Upsert)
    inv = db.scalar(
        select(FlightInventory).where(
            FlightInventory.flight_id == id,
            FlightInventory.meal_id == payload.meal_id,
            FlightInventory.cabin_class == payload.cabin_class.lower().strip(),
        )
    )

    if inv:
        inv.initial_qty = payload.initial_qty
        inv.restock_alert_qty = payload.restock_alert_qty
    else:
        inv = FlightInventory(
            id=uuid.uuid4(),
            flight_id=id,
            meal_id=payload.meal_id,
            cabin_class=payload.cabin_class.lower().strip(),
            initial_qty=payload.initial_qty,
            reserved_qty=0,
            served_qty=0,
            wasted_qty=0,
            restock_alert_qty=payload.restock_alert_qty,
        )
        db.add(inv)

    db.commit()
    db.refresh(inv)
    return success_response(InventoryItemResponse.model_validate(inv))


@router.post("/flights/{id}/inventory/load-csv", response_model=ResponseEnvelope[list[InventoryItemResponse]])
def load_inventory_csv(
    id: uuid.UUID,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role("admin")),
) -> dict:
    """
    Upload a CSV to batch load or update flight inventory.
    CSV columns: meal_code, cabin_class, initial_qty, restock_alert_qty
    """
    flight = db.scalar(select(Flight).where(Flight.id == id))
    if not flight:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Flight not found",
        )

    try:
        contents = file.file.read().decode("utf-8")
        # Strip potential BOM
        if contents.startswith("\ufeff"):
            contents = contents[1:]
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to read CSV file: {exc}",
        )

    reader = csv.DictReader(io.StringIO(contents))
    results = []

    for row in reader:
        # Check required columns
        if not all(col in row for col in ("meal_code", "cabin_class", "initial_qty")):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="CSV must contain headers: meal_code, cabin_class, initial_qty",
            )

        meal_code = row["meal_code"].strip()
        cabin_class = row["cabin_class"].strip().lower()
        
        try:
            initial_qty = int(row["initial_qty"])
            restock_alert_qty = int(row.get("restock_alert_qty", 5))
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Quantities must be integers. Found initial_qty={row['initial_qty']}",
            )

        meal = db.scalar(select(MealItem).where(MealItem.meal_code == meal_code))
        if not meal:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Meal with code '{meal_code}' not found",
            )

        # Upsert
        inv = db.scalar(
            select(FlightInventory).where(
                FlightInventory.flight_id == id,
                FlightInventory.meal_id == meal.id,
                FlightInventory.cabin_class == cabin_class,
            )
        )

        if inv:
            inv.initial_qty = initial_qty
            inv.restock_alert_qty = restock_alert_qty
        else:
            inv = FlightInventory(
                id=uuid.uuid4(),
                flight_id=id,
                meal_id=meal.id,
                cabin_class=cabin_class,
                initial_qty=initial_qty,
                reserved_qty=0,
                served_qty=0,
                wasted_qty=0,
                restock_alert_qty=restock_alert_qty,
            )
            db.add(inv)
        
        results.append(inv)

    db.commit()
    
    # Refresh all updated rows
    for item in results:
        db.refresh(item)

    res = [InventoryItemResponse.model_validate(item) for item in results]
    return success_response(res)


@router.get("/analytics/flights/{id}/summary", response_model=ResponseEnvelope[FlightAnalyticsSummaryResponse])
def get_flight_analytics_summary(
    id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role("admin")),
) -> dict:
    """Retrieve runtime-computed summary analytics for a flight (Admin only)."""
    flight = db.scalar(select(Flight).where(Flight.id == id))
    if not flight:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Flight not found",
        )

    # 1. Total order counts
    total_orders = db.scalar(
        select(func.count(PassengerOrder.id)).where(PassengerOrder.flight_id == id)
    ) or 0
    delivered_orders = db.scalar(
        select(func.count(PassengerOrder.id)).where(
            PassengerOrder.flight_id == id,
            PassengerOrder.status == OrderStatus.delivered.value,
        )
    ) or 0
    cancelled_orders = db.scalar(
        select(func.count(PassengerOrder.id)).where(
            PassengerOrder.flight_id == id,
            PassengerOrder.status == OrderStatus.cancelled.value,
        )
    ) or 0

    # 2. Average rating from feedback
    avg_rating = db.scalar(
        select(func.avg(Feedback.overall_rating))
        .join(PassengerOrder, Feedback.order_id == PassengerOrder.id)
        .where(PassengerOrder.flight_id == id)
    )
    if avg_rating is not None:
        avg_rating = round(float(avg_rating), 2)

    # 3. Inventory statistics
    inv_stats = db.execute(
        select(
            func.sum(FlightInventory.initial_qty).label("initial"),
            func.sum(FlightInventory.served_qty).label("served"),
            func.sum(FlightInventory.wasted_qty).label("wasted"),
        ).where(FlightInventory.flight_id == id)
    ).first()

    total_initial = int(inv_stats.initial) if inv_stats and inv_stats.initial else 0
    total_served = int(inv_stats.served) if inv_stats and inv_stats.served else 0
    total_wasted = int(inv_stats.wasted) if inv_stats and inv_stats.wasted else 0

    waste_pct = 0.0
    if total_initial > 0:
        waste_pct = round((total_wasted / total_initial) * 100.0, 2)

    res = FlightAnalyticsSummaryResponse(
        flight_id=flight.id,
        flight_number=flight.flight_number,
        load_factor=flight.load_factor or 0.0,
        total_orders=total_orders,
        delivered_orders=delivered_orders,
        cancelled_orders=cancelled_orders,
        average_overall_rating=avg_rating,
        total_initial_qty=total_initial,
        total_served_qty=total_served,
        total_wasted_qty=total_wasted,
        waste_percentage=waste_pct,
    )
    return success_response(res)


@router.get("/feedback", response_model=ResponseEnvelope[list[dict]])
def get_feedback(
    flight_id: Optional[uuid.UUID] = None,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role("admin")),
) -> dict:
    """Retrieve list of passenger feedback (Admin only)."""
    query = (
        select(Feedback, PassengerOrder, Flight)
        .join(PassengerOrder, Feedback.order_id == PassengerOrder.id)
        .join(Flight, PassengerOrder.flight_id == Flight.id)
    )
    if flight_id is not None:
        query = query.where(PassengerOrder.flight_id == flight_id)

    query = query.order_by(Feedback.created_at.desc()).limit(200)
    results = db.execute(query).all()

    feedback_list = []
    for fb, order, flight in results:
        feedback_list.append({
            "feedback_id": str(fb.id),
            "order_id": str(fb.order_id),
            "flight_number": flight.flight_number,
            "origin": flight.origin,
            "destination": flight.destination,
            "seat_number": order.seat_number,
            "cabin_class": order.cabin_class,
            "overall_rating": fb.overall_rating,
            "taste_rating": fb.taste_rating,
            "temp_rating": fb.temp_rating,
            "portion_rating": fb.portion_rating,
            "speed_rating": fb.speed_rating,
            "tags": fb.tags or [],
            "free_text": fb.free_text,
            "sentiment_score": fb.sentiment_score,
            "created_at": fb.created_at.isoformat() if fb.created_at else None,
        })

    return success_response(feedback_list)

