"""Import all SQLAlchemy models so Alembic autogenerate picks them up."""

from app.models.airline import Airline  # noqa: F401
from app.models.passenger import Passenger, PassengerProfile  # noqa: F401
from app.models.crew import CrewMember  # noqa: F401
from app.models.flight import Flight, FlightSeat  # noqa: F401
from app.models.meal import MealCategory, MealItem, FlightInventory  # noqa: F401
from app.models.order import PassengerOrder, OrderItem  # noqa: F401
from app.models.delivery import DeliveryTask  # noqa: F401
from app.models.feedback import Feedback  # noqa: F401
from app.models.waste_intervention import WasteIntervention  # noqa: F401
from app.models.ml import ModelRegistry  # noqa: F401

__all__ = [
    "Airline",
    "Passenger",
    "PassengerProfile",
    "CrewMember",
    "Flight",
    "FlightSeat",
    "MealCategory",
    "MealItem",
    "FlightInventory",
    "PassengerOrder",
    "OrderItem",
    "DeliveryTask",
    "Feedback",
    "WasteIntervention",
    "ModelRegistry",
]
