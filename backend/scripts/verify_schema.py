"""Phase 1 acceptance: insert + read one row per table, no constraint errors."""

import sys
import uuid
from datetime import date, datetime, timezone

# Ensure backend/ is on path
sys.path.insert(0, ".")

from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent / ".env")

from app.core.config import settings
from app.models import (
    Airline, Passenger, PassengerProfile, CrewMember,
    Flight, FlightSeat, MealCategory, MealItem, FlightInventory,
    PassengerOrder, OrderItem, DeliveryTask, Feedback, ModelRegistry,
)

engine = create_engine(settings.DATABASE_URL)

def now():
    return datetime.now(timezone.utc)

with Session(engine) as db:
    # Airline
    airline = Airline(name="AirMeal Airways", code="AM")
    db.add(airline)
    db.flush()
    print(f"  airline: {airline.id}")

    # Passenger
    pax = Passenger(
        pnr="TEST001", first_name="Alice", last_name="Wong",
        dob=date(1990, 3, 15), nationality="British",
        email=f"alice_{uuid.uuid4().hex[:6]}@example.com",
        hashed_password="$argon2id$v=...", ffp_tier="Gold",
    )
    db.add(pax)
    db.flush()
    print(f"  passenger: {pax.id}")

    # Passenger profile
    profile = PassengerProfile(
        passenger_id=pax.id,
        dietary_flags={"vegetarian": True},
        allergy_flags={"nuts": False},
        cuisine_prefs={"indian": 0.9, "japanese": 0.6},
        portion_pref="medium", price_sensitivity="mid",
        preference_embedding=[0.1] * 32,
    )
    db.add(profile)
    db.flush()
    print(f"  passenger_profile: {profile.id}")

    # Crew member
    crew = CrewMember(
        employee_id=f"EMP{uuid.uuid4().hex[:6]}",
        name="Bob Smith", role="cabin_crew",
        airline_id=airline.id, assigned_zone="A",
        hashed_password="$argon2id$v=...",
        email=f"crew_{uuid.uuid4().hex[:6]}@airline.com",
    )
    db.add(crew)
    db.flush()
    print(f"  crew_member: {crew.id}")

    # Flight
    flight = Flight(
        flight_number="AM101", airline_id=airline.id,
        origin="LHR", destination="DXB",
        dep_time=now(), arr_time=now(),
        aircraft_type="B777", load_factor=0.82, status="scheduled",
    )
    db.add(flight)
    db.flush()
    print(f"  flight: {flight.id}")

    # Flight seat
    seat = FlightSeat(flight_id=flight.id, seat_number="12A", cabin_class="economy")
    db.add(seat)
    db.flush()
    print(f"  flight_seat: {seat.id}")

    # Meal category
    category = MealCategory(name="Main Course")
    db.add(category)
    db.flush()
    print(f"  meal_category: {category.id}")

    # Meal item
    meal = MealItem(
        meal_code=f"MEAL{uuid.uuid4().hex[:6]}",
        category_id=category.id, name="Chicken Tikka Masala",
        cuisine_type="Indian",
        ingredients={"chicken": True, "rice": True},
        allergen_flags={"gluten": False, "nuts": False},
        dietary_flags={"halal": True},
        calories=450, image_url="https://example.com/ctm.jpg",
        meal_embedding=[0.2] * 32,
    )
    db.add(meal)
    db.flush()
    print(f"  meal_item: {meal.id}")

    # Flight inventory
    inv = FlightInventory(
        flight_id=flight.id, meal_id=meal.id, cabin_class="economy",
        initial_qty=20, reserved_qty=0, served_qty=0,
        wasted_qty=0, restock_alert_qty=5,
    )
    db.add(inv)
    db.flush()
    assert inv.current_stock == 20, f"Expected 20, got {inv.current_stock}"
    print(f"  flight_inventory: {inv.id}  current_stock={inv.current_stock}")

    # Passenger order
    order = PassengerOrder(
        flight_id=flight.id, passenger_id=pax.id,
        seat_number="12A", cabin_class="economy",
        status="received", priority_score=1.0,
    )
    db.add(order)
    db.flush()
    print(f"  passenger_order: {order.id}")

    # Order item
    item = OrderItem(order_id=order.id, meal_id=meal.id, qty=1)
    db.add(item)
    db.flush()
    print(f"  order_item: {item.id}")

    # Delivery task
    task = DeliveryTask(
        order_id=order.id, crew_id=crew.id,
        seat_number="12A", route_position=1, status="pending",
    )
    db.add(task)
    db.flush()
    print(f"  delivery_task: {task.id}")

    # Feedback
    fb = Feedback(
        order_id=order.id, overall_rating=5,
        taste_rating=5, temp_rating=4, portion_rating=4, speed_rating=5,
        tags=["great-taste", "hot-food"], free_text="Excellent!",
    )
    db.add(fb)
    db.flush()
    print(f"  feedback: {fb.id}")

    # Model registry (metrics NULL — never seeded with target numbers)
    reg = ModelRegistry(
        model_name="recommender", version="0.0.0",
        status="untrained", metrics=None, trained_at=None,
    )
    db.add(reg)
    db.flush()
    assert reg.metrics is None, "metrics must start NULL"
    print(f"  model_registry: {reg.id}  metrics={reg.metrics}")

    db.rollback()  # Clean up — this is a throwaway test
    print("\nALL INSERTS OK — rolled back (no test data left in DB)")
