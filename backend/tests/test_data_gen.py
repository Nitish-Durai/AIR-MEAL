"""Phase 3 acceptance tests — Synthetic Data Generator.

Checks:
  1. Running the generator populates all 14 tables.
  2. Row counts match the CLI flags passed.
  3. Re-running with the same seed yields identical data (reproducibility).
  4. No allergen-conflict orders are placed.
  5. No inventory constraint violations exist.
  6. Model registry metrics start NULL.
  7. Embedding dimensions are 32.
"""

from unittest.mock import MagicMock
import pytest
from sqlalchemy import select, func

from app.db.session import SessionLocal
from app.ml.data_gen import generate

from app.models.airline import Airline
from app.models.crew import CrewMember
from app.models.delivery import DeliveryTask
from app.models.feedback import Feedback
from app.models.flight import Flight, FlightSeat
from app.models.meal import FlightInventory, MealCategory, MealItem
from app.models.ml import ModelRegistry
from app.models.order import OrderItem, PassengerOrder
from app.models.passenger import Passenger, PassengerProfile


@pytest.fixture
def db():
    """Provides a database session wrapped in a transaction that is rolled back."""
    session = SessionLocal()
    transaction = session.begin()

    # Intercept commit so the generator flushes instead of committing.
    session.commit = session.flush

    yield session

    try:
        if transaction.is_active:
            transaction.rollback()
    except Exception:
        pass
    session.close()


def test_generation_populates_all_tables_and_respects_scale(db):
    # Scale: 50 flights is needed to guarantee flights in the past/active states,
    # which in turn guarantees generation of delivery tasks and feedback.
    # 100 passengers is fast to generate.
    n_flights = 50
    n_passengers = 100
    n_meals = 10
    seed = 99

    stats = generate(
        db,
        n_flights=n_flights,
        n_passengers=n_passengers,
        n_meals=n_meals,
        seed=seed,
        reset=True,
    )

    # 1. Verify row counts returned by the function match database queries
    assert db.scalar(select(func.count()).select_from(Airline)) == stats["airlines"]
    assert db.scalar(select(func.count()).select_from(MealCategory)) == stats["meal_categories"]
    assert db.scalar(select(func.count()).select_from(MealItem)) == stats["meal_items"]
    assert db.scalar(select(func.count()).select_from(CrewMember)) == stats["crew_members"]
    assert db.scalar(select(func.count()).select_from(Passenger)) == stats["passengers"]
    assert db.scalar(select(func.count()).select_from(PassengerProfile)) == stats["passengers"]  # 1:1 relationship
    assert db.scalar(select(func.count()).select_from(Flight)) == stats["flights"]
    assert db.scalar(select(func.count()).select_from(FlightSeat)) == stats["flight_seats"]
    assert db.scalar(select(func.count()).select_from(FlightInventory)) == stats["flight_inventory"]
    assert db.scalar(select(func.count()).select_from(PassengerOrder)) == stats["orders"]
    assert db.scalar(select(func.count()).select_from(OrderItem)) == stats["order_items"]
    assert db.scalar(select(func.count()).select_from(DeliveryTask)) == stats["delivery_tasks"]
    assert db.scalar(select(func.count()).select_from(Feedback)) == stats["feedback"]
    assert db.scalar(select(func.count()).select_from(ModelRegistry)) == stats["model_registry"]

    # 2. Verify row counts match the scaling arguments
    assert stats["flights"] == n_flights
    assert stats["passengers"] == n_passengers
    assert stats["meal_items"] == n_meals
    assert stats["model_registry"] == 4  # Always 4 models in registry

    # Ensure all tables have at least some data (i.e. > 0 rows)
    for table_name, count in stats.items():
        assert count > 0, f"Table {table_name} has 0 rows generated!"


def test_seed_reproducibility(db):
    """Verifies that running the generator with the same seed yields identical values."""
    n_flights = 5
    n_passengers = 15
    n_meals = 10
    seed = 42

    # Run 1
    stats1 = generate(
        db,
        n_flights=n_flights,
        n_passengers=n_passengers,
        n_meals=n_meals,
        seed=seed,
        reset=True,
    )
    
    # Query details of flight numbers and passenger emails
    flights1 = db.scalars(select(Flight.flight_number).order_by(Flight.flight_number)).all()
    passengers1 = db.scalars(select(Passenger.email).order_by(Passenger.email)).all()
    orders1 = db.scalars(select(PassengerOrder.seat_number).order_by(PassengerOrder.id)).all()

    # Clear and run again with same seed inside the same transaction.
    # The --reset flag inside generate() will truncate all tables again.
    stats2 = generate(
        db,
        n_flights=n_flights,
        n_passengers=n_passengers,
        n_meals=n_meals,
        seed=seed,
        reset=True,
    )

    flights2 = db.scalars(select(Flight.flight_number).order_by(Flight.flight_number)).all()
    passengers2 = db.scalars(select(Passenger.email).order_by(Passenger.email)).all()
    orders2 = db.scalars(select(PassengerOrder.seat_number).order_by(PassengerOrder.id)).all()

    assert stats1 == stats2
    assert flights1 == flights2
    assert passengers1 == passengers2
    assert orders1 == orders2


def test_integrity_and_constraints(db):
    """Verifies inventory constraints, allergen gates, embeddings, and integrity rules."""
    n_flights = 5
    n_passengers = 25
    n_meals = 10
    seed = 101

    generate(
        db,
        n_flights=n_flights,
        n_passengers=n_passengers,
        n_meals=n_meals,
        seed=seed,
        reset=True,
    )

    # 1. Verify ModelRegistry integrity rule (metrics must start NULL)
    models = db.scalars(select(ModelRegistry)).all()
    assert len(models) == 4
    for model in models:
        assert model.metrics is None, f"Model {model.model_name} metrics are not NULL!"
        assert model.trained_at is None
        assert model.status == "untrained"

    # 2. Verify embedding dimensions are 32
    profiles = db.scalars(select(PassengerProfile)).all()
    for profile in profiles:
        emb = profile.preference_embedding
        assert isinstance(emb, list)
        assert len(emb) == 32
        # Verify L2 normalized
        import math
        mag = sum(x*x for x in emb)
        assert math.isclose(mag, 1.0, rel_tol=1e-4)

    meal_items = db.scalars(select(MealItem)).all()
    for meal in meal_items:
        emb = meal.meal_embedding
        assert isinstance(emb, list)
        assert len(emb) == 32
        import math
        mag = sum(x*x for x in emb)
        assert math.isclose(mag, 1.0, rel_tol=1e-4)

    # 3. Verify inventory constraint: reserved_qty + served_qty <= initial_qty
    inventory_items = db.scalars(select(FlightInventory)).all()
    for inv in inventory_items:
        assert inv.reserved_qty + inv.served_qty <= inv.initial_qty
        assert inv.current_stock == inv.initial_qty - inv.reserved_qty - inv.served_qty
        assert inv.initial_qty >= 0
        assert inv.reserved_qty >= 0
        assert inv.served_qty >= 0
        assert inv.wasted_qty >= 0

    # 4. Verify allergen safety gate (no passenger order contains conflicting allergens)
    orders = db.scalars(select(PassengerOrder)).all()
    for order in orders:
        passenger = order.passenger
        profile = passenger.profile
        assert profile is not None
        
        allergy_flags = profile.allergy_flags or {}
        
        for item in order.items:
            meal = item.meal
            meal_allergens = meal.allergen_flags or {}
            
            for allergen, is_allergic in allergy_flags.items():
                if is_allergic:
                    assert not meal_allergens.get(allergen), (
                        f"Allergen conflict! Passenger {passenger.id} is allergic to {allergen}, "
                        f"but order {order.id} contains meal {meal.name} which has it."
                    )
