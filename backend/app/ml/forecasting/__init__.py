"""LightGBM demand forecaster for AirMeal.

Predicts per-meal demand (order count) for a flight given:
  - Temporal features: day_of_week, hour_of_day, is_weekend
  - Flight features: load_factor, aircraft_type (encoded), duration_hours
  - Historical features: avg demand for this meal on similar routes

Train/eval split: use the last 20% of flights (by insertion order) as a held-out
test set. Write MAE/RMSE/MAPE to model_registry.

Artifacts saved to app/ml/artifacts/forecaster.pkl (gitignored).
"""

from __future__ import annotations

import os
import pickle
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import numpy as np
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ml.evaluation import regression_metrics
from app.models.flight import Flight
from app.models.meal import FlightInventory, MealItem
from app.models.ml import ModelRegistry
from app.models.order import OrderItem, PassengerOrder

MODEL_NAME = "forecaster"
MODEL_VERSION = "1.0.0"
ARTIFACT_DIR = Path(__file__).parent.parent / "artifacts"
MODEL_PATH = ARTIFACT_DIR / "forecaster.pkl"

# Minimum training rows before we attempt a real model
MIN_TRAIN_ROWS = 30

# Known aircraft types → ordinal encoding (0 = unknown)
_AIRCRAFT_ENCODING = {
    "B737-800":   1,
    "A320neo":    2,
    "B777-300ER": 3,
    "A380-800":   4,
}


def _flight_features(flight: Flight) -> dict:
    """Derive temporal + flight features from a Flight object."""
    dep = flight.dep_time
    arr = flight.arr_time
    duration_h = (arr - dep).total_seconds() / 3600.0 if dep and arr else 0.0
    return {
        "day_of_week":    dep.weekday() if dep else 0,
        "hour_of_day":    dep.hour if dep else 12,
        "is_weekend":     int(dep.weekday() >= 5) if dep else 0,
        "load_factor":    flight.load_factor or 0.75,
        "aircraft_enc":   _AIRCRAFT_ENCODING.get(flight.aircraft_type or "", 0),
        "duration_h":     min(duration_h, 24.0),
    }


def _build_dataset(db: Session) -> tuple[list[list[float]], list[float]]:
    """
    Build feature matrix X and target vector y from historical order data.

    One row per (flight, meal) pair that has inventory defined.
    Target: number of order_items for that meal on that flight.
    """
    # All flights
    flights = db.execute(select(Flight).order_by(Flight.id)).scalars().all()
    if not flights:
        return [], []

    # Order counts per (flight_id, meal_id)
    # Build counts via Python (simpler and safe with ORM)
    all_orders = db.execute(select(PassengerOrder).order_by(PassengerOrder.id)).scalars().all()
    order_to_flight: dict[uuid.UUID, uuid.UUID] = {o.id: o.flight_id for o in all_orders}

    all_items = db.execute(select(OrderItem).order_by(OrderItem.id)).scalars().all()
    demand_counts: dict[tuple[uuid.UUID, uuid.UUID], int] = {}
    for item in all_items:
        flight_id = order_to_flight.get(item.order_id)
        if flight_id is None:
            continue
        key = (flight_id, item.meal_id)
        demand_counts[key] = demand_counts.get(key, 0) + item.qty

    # All inventory rows give us the (flight, meal) universe
    inventories = db.execute(select(FlightInventory).order_by(FlightInventory.flight_id, FlightInventory.meal_id)).scalars().all()
    flight_map: dict[uuid.UUID, Flight] = {f.id: f for f in flights}

    # Compute per-meal global avg demand (used as a historical feature)
    meal_demand_totals: dict[uuid.UUID, list[int]] = {}
    for (fid, mid), cnt in demand_counts.items():
        meal_demand_totals.setdefault(mid, []).append(cnt)
    meal_avg_demand: dict[uuid.UUID, float] = {
        mid: float(np.mean(vals)) for mid, vals in meal_demand_totals.items()
    }

    X: list[list[float]] = []
    y: list[float] = []

    seen: set[tuple] = set()
    for inv in inventories:
        key = (inv.flight_id, inv.meal_id)
        if key in seen:
            continue
        seen.add(key)

        flight = flight_map.get(inv.flight_id)
        if flight is None:
            continue

        ff = _flight_features(flight)
        avg_d = meal_avg_demand.get(inv.meal_id, 0.0)
        target = float(demand_counts.get(key, 0))

        row = [
            ff["day_of_week"],
            ff["hour_of_day"],
            ff["is_weekend"],
            ff["load_factor"],
            ff["aircraft_enc"],
            ff["duration_h"],
            avg_d,
        ]
        X.append(row)
        y.append(target)

    return X, y


def train_and_evaluate(db: Session) -> dict:
    """
    Train LightGBM regressor and evaluate on a held-out 20% split.

    Writes computed MAE/RMSE/MAPE to model_registry; never hardcodes numbers.
    """
    import lightgbm as lgb

    X, y = _build_dataset(db)

    if len(X) < MIN_TRAIN_ROWS:
        return _upsert_registry(db, status="trained", metrics=None)

    X_arr = np.array(X, dtype=float)
    y_arr = np.array(y, dtype=float)

    # Chronological-ish split: last 20% for evaluation
    split_idx = max(1, int(len(X_arr) * 0.8))
    X_train, X_test = X_arr[:split_idx], X_arr[split_idx:]
    y_train, y_test = y_arr[:split_idx], y_arr[split_idx:]

    model = lgb.LGBMRegressor(
        n_estimators=200,
        learning_rate=0.05,
        num_leaves=31,
        random_state=42,
        deterministic=True,
        force_row_wise=True,
        num_threads=1,
        verbose=-1,
    )
    model.fit(X_train, y_train)

    # Persist artifact
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    with open(MODEL_PATH, "wb") as f:
        pickle.dump(model, f)

    # Evaluate
    if len(X_test) > 0:
        y_pred = model.predict(X_test).tolist()
        metrics_dict = regression_metrics(y_test.tolist(), y_pred)
    else:
        metrics_dict = None

    if metrics_dict:
        metrics_dict["n_train_rows"] = len(X_train)
        metrics_dict["n_test_rows"] = len(X_test)
        metrics_dict["evaluated_at"] = datetime.now(timezone.utc).isoformat()

    return _upsert_registry(db, status="ready", metrics=metrics_dict)


def _load_model():
    """Load the trained LightGBM model from disk, or None if not trained."""
    if not MODEL_PATH.exists():
        return None
    with open(MODEL_PATH, "rb") as f:
        return pickle.load(f)


def forecast(
    db: Session,
    flight_id: uuid.UUID,
    cabin_class: Optional[str] = None,
) -> list[dict]:
    """
    Return per-meal demand forecasts for a flight.

    Falls back to historical average if the model artifact doesn't exist.
    """
    model = _load_model()

    flight = db.scalar(select(Flight).where(Flight.id == flight_id))
    if not flight:
        return []

    ff = _flight_features(flight)

    # Inventory for this flight
    inv_q = select(FlightInventory).where(FlightInventory.flight_id == flight_id)
    if cabin_class:
        inv_q = inv_q.where(FlightInventory.cabin_class == cabin_class)
    inventories = db.execute(inv_q).scalars().all()

    if not inventories:
        return []

    # Historical average demand per meal — MUST match _build_dataset():
    # aggregate qty per (flight, meal), then average those per-flight totals.
    all_items = db.execute(select(OrderItem)).scalars().all()
    all_orders = db.execute(select(PassengerOrder)).scalars().all()
    order_to_flight: dict[uuid.UUID, uuid.UUID] = {o.id: o.flight_id for o in all_orders}

    # Step 1: demand per (flight, meal)
    demand_counts: dict[tuple[uuid.UUID, uuid.UUID], int] = {}
    for item in all_items:
        fid = order_to_flight.get(item.order_id)
        if fid is None:
            continue
        key = (fid, item.meal_id)
        demand_counts[key] = demand_counts.get(key, 0) + item.qty

    # Step 2: list of per-flight totals per meal, then mean
    meal_demand_totals: dict[uuid.UUID, list[int]] = {}
    for (fid, mid), cnt in demand_counts.items():
        meal_demand_totals.setdefault(mid, []).append(cnt)

    meal_avg_demand: dict[uuid.UUID, float] = {
        mid: float(np.mean(vals)) for mid, vals in meal_demand_totals.items()
    }

    # Load meal names
    meal_ids = [inv.meal_id for inv in inventories]
    meals = db.execute(select(MealItem).where(MealItem.id.in_(meal_ids))).scalars().all()
    meal_name_map: dict[uuid.UUID, str] = {m.id: m.name for m in meals}

    results = []
    for inv in inventories:
        avg_d = meal_avg_demand.get(inv.meal_id, 0.0)
        row = [
            ff["day_of_week"],
            ff["hour_of_day"],
            ff["is_weekend"],
            ff["load_factor"],
            ff["aircraft_enc"],
            ff["duration_h"],
            avg_d,
        ]

        if model is not None:
            pred = float(max(0.0, model.predict([row])[0]))
        else:
            pred = avg_d  # fallback: use historical mean

        results.append({
            "meal_id":        str(inv.meal_id),
            "meal_name":      meal_name_map.get(inv.meal_id, "Unknown"),
            "cabin_class":    inv.cabin_class,
            "predicted_demand": round(pred, 1),
            "current_stock":  inv.initial_qty - inv.reserved_qty - inv.served_qty,
            "method":         "lightgbm" if model is not None else "historical_avg",
        })

    return results


def _upsert_registry(db: Session, status: str, metrics: Optional[dict]) -> dict:
    """Insert or update the forecaster entry in model_registry."""
    reg = db.scalar(
        select(ModelRegistry).where(ModelRegistry.model_name == MODEL_NAME)
    )
    now = datetime.now(timezone.utc)
    if reg is None:
        reg = ModelRegistry(
            id=uuid.uuid4(),
            model_name=MODEL_NAME,
            version=MODEL_VERSION,
            status=status,
            metrics=metrics,
            trained_at=now,
        )
        db.add(reg)
    else:
        reg.version = MODEL_VERSION
        reg.status = status
        reg.metrics = metrics
        reg.trained_at = now
    db.commit()
    db.refresh(reg)
    return {
        "model_name": reg.model_name,
        "version":    reg.version,
        "status":     reg.status,
        "metrics":    reg.metrics,
        "trained_at": reg.trained_at.isoformat() if reg.trained_at else None,
    }
