"""Pydantic V2 schemas for Phase 4 Core CRUD APIs."""

import uuid
from datetime import date, datetime
from typing import Any, Generic, Optional, TypeVar
from pydantic import BaseModel, ConfigDict, Field

# ── Generic Response Envelope ────────────────────────────────────────────────
T = TypeVar("T")


class ErrorDetail(BaseModel):
    message: str
    code: Optional[int] = None


class ResponseEnvelope(BaseModel, Generic[T]):
    data: Optional[T] = None
    error: Optional[ErrorDetail] = None
    meta: Optional[dict] = None


def success_response(data: Any, meta: Optional[dict] = None) -> dict:
    """Helper to construct a success envelope."""
    return {"data": data, "error": None, "meta": meta}


def error_response(message: str, code: Optional[int] = None) -> dict:
    """Helper to construct an error envelope."""
    return {"data": None, "error": {"message": message, "code": code}, "meta": None}


# ── Passenger & Profile Schemas ──────────────────────────────────────────────
class PassengerProfileUpdate(BaseModel):
    dietary_flags: Optional[dict[str, bool]] = None
    allergy_flags: Optional[dict[str, bool]] = None
    cuisine_prefs: Optional[dict[str, float]] = None
    portion_pref: Optional[str] = Field(None, max_length=20)
    price_sensitivity: Optional[str] = Field(None, max_length=20)


class PassengerProfileResponse(BaseModel):
    passenger_id: uuid.UUID
    dietary_flags: Optional[dict[str, bool]] = None
    allergy_flags: Optional[dict[str, bool]] = None
    cuisine_prefs: Optional[dict[str, float]] = None
    portion_pref: Optional[str] = None
    price_sensitivity: Optional[str] = None
    preference_embedding: Optional[list[float]] = None

    model_config = ConfigDict(from_attributes=True)

# ── Airline Schemas ──────────────────────────────────────────────────────────
class AirlineResponse(BaseModel):
    id: uuid.UUID
    name: str
    code: str

    model_config = ConfigDict(from_attributes=True)


# ── Flight & Seat Schemas ────────────────────────────────────────────────────
class FlightResponse(BaseModel):
    id: uuid.UUID
    flight_number: str
    airline_id: uuid.UUID
    origin: str
    destination: str
    dep_time: datetime
    arr_time: datetime
    aircraft_type: Optional[str] = None
    load_factor: Optional[float] = None
    status: str

    model_config = ConfigDict(from_attributes=True)


class FlightCreateRequest(BaseModel):
    flight_number: str = Field(min_length=1, max_length=20)
    airline_id: uuid.UUID
    origin: str = Field(min_length=3, max_length=10)
    destination: str = Field(min_length=3, max_length=10)
    dep_time: datetime
    arr_time: datetime
    aircraft_type: Optional[str] = Field(None, max_length=50)
    load_factor: Optional[float] = Field(None, ge=0.0, le=1.0)
    status: Optional[str] = "scheduled"


# ── Meal & Inventory Schemas ─────────────────────────────────────────────────
class MealItemResponse(BaseModel):
    id: uuid.UUID
    meal_code: str
    category_id: Optional[uuid.UUID] = None
    name: str
    cuisine_type: Optional[str] = None
    ingredients: Optional[dict] = None
    allergen_flags: Optional[dict] = None
    dietary_flags: Optional[dict] = None
    calories: Optional[int] = None
    is_alcohol: Optional[bool] = False
    image_url: Optional[str] = None
    meal_embedding: Optional[list[float]] = None
    # Live stock attributes injected at runtime
    current_stock: Optional[int] = None
    initial_qty: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


class MealAllergenCheckResponse(BaseModel):
    meal_id: uuid.UUID
    passenger_id: uuid.UUID
    is_safe: bool
    conflicting_allergens: list[str]


class InventoryItemResponse(BaseModel):
    id: uuid.UUID
    flight_id: uuid.UUID
    meal_id: uuid.UUID
    cabin_class: str
    initial_qty: int
    reserved_qty: int
    served_qty: int
    wasted_qty: int
    restock_alert_qty: int
    current_stock: int  # computed property

    model_config = ConfigDict(from_attributes=True)


class InventoryLoadRequest(BaseModel):
    meal_id: uuid.UUID
    cabin_class: str = Field(min_length=1, max_length=20)
    initial_qty: int = Field(ge=0)
    restock_alert_qty: int = Field(default=5, ge=0)


# ── Order & Delivery Schemas ───────────────────────────────────────────
class OrderItemCreate(BaseModel):
    meal_id: uuid.UUID
    qty: int = Field(default=1, ge=1)
    customisations: Optional[dict] = None


class OrderCreateRequest(BaseModel):
    flight_id: uuid.UUID
    seat_number: str = Field(min_length=1, max_length=10)
    cabin_class: str = Field(min_length=1, max_length=20)
    items: list[OrderItemCreate] = Field(min_length=1)
    priority_factors: Optional[list[str]] = None  # subset of: "medical","infant","connecting"


class OrderItemResponse(BaseModel):
    id: uuid.UUID
    meal_id: uuid.UUID
    qty: int
    customisations: Optional[dict] = None
    meal_name: Optional[str] = None
    meal_code: Optional[str] = None
    category_name: Optional[str] = None
    is_alcohol: bool = False

    model_config = ConfigDict(from_attributes=True)


class OrderResponse(BaseModel):
    id: uuid.UUID
    flight_id: uuid.UUID
    passenger_id: uuid.UUID
    seat_number: Optional[str] = None
    cabin_class: str
    status: str
    priority_score: float
    assigned_crew_id: Optional[uuid.UUID] = None
    created_at: datetime
    updated_at: datetime
    items: list[OrderItemResponse] = []

    model_config = ConfigDict(from_attributes=True)


class OrderTrackingResponse(BaseModel):
    order_id: uuid.UUID
    status: str
    updated_at: datetime
    eta_minutes: int
    assigned_crew_name: Optional[str] = None


# ── Feedback Schemas ─────────────────────────────────────────────────────────
class FeedbackCreateRequest(BaseModel):
    order_id: uuid.UUID
    overall_rating: int = Field(ge=1, le=5)
    taste_rating: Optional[int] = Field(None, ge=1, le=5)
    temp_rating: Optional[int] = Field(None, ge=1, le=5)
    portion_rating: Optional[int] = Field(None, ge=1, le=5)
    speed_rating: Optional[int] = Field(None, ge=1, le=5)
    tags: Optional[list[str]] = None
    free_text: Optional[str] = None


class FeedbackResponse(BaseModel):
    id: uuid.UUID
    order_id: uuid.UUID
    overall_rating: int
    taste_rating: Optional[int] = None
    temp_rating: Optional[int] = None
    portion_rating: Optional[int] = None
    speed_rating: Optional[int] = None
    tags: list[str] = []
    free_text: Optional[str] = None
    sentiment_score: Optional[float] = None

    model_config = ConfigDict(from_attributes=True)


# ── QR Access Schemas ────────────────────────────────────────────────────────
class QRResolveResponse(BaseModel):
    flight_id: uuid.UUID
    seat_number: str
    cabin_class: str
    token: str


class QRGenerateResponse(BaseModel):
    seat_number: str
    cabin_class: str
    qr_token: str
    qr_code_url: str


# ── Crew Dash Schemas ────────────────────────────────────────────────────────
class CrewDashboardTaskResponse(BaseModel):
    id: uuid.UUID
    order_id: uuid.UUID
    crew_id: uuid.UUID
    seat_number: str
    route_position: int
    status: str
    order_status: str
    priority_score: float
    allergen_warnings: list[str]
    ordered_items: list[str]  # e.g. ["2x ST001 Tomato Bisque"]
    priority_factors: list[str] = []
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TaskStatusUpdateRequest(BaseModel):
    status: str = Field(min_length=1, max_length=20)


# ── Crew Assignment & Analytics Summary ──────────────────────────────────────
class CrewAssignmentRequest(BaseModel):
    crew_ids: list[uuid.UUID]
    zone: str = Field(min_length=1, max_length=50)


class FlightAnalyticsSummaryResponse(BaseModel):
    flight_id: uuid.UUID
    flight_number: str
    load_factor: float
    total_orders: int
    delivered_orders: int
    cancelled_orders: int
    average_overall_rating: Optional[float] = None
    total_initial_qty: int
    total_served_qty: int
    total_wasted_qty: int
    waste_percentage: float
