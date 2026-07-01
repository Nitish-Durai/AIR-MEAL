"""AI model management endpoints.

Routes
------
GET  /ai/models                   — list all model registry entries
GET  /ai/models/{name}            — get a single model's card
POST /ai/models/{name}/retrain    — (admin) retrain a model synchronously + refresh metrics
GET  /ai/models/{name}/drift      — simple PSI drift estimate (or "not yet evaluated")
GET  /flights/{id}/recommendations — passenger recommendations with "why" explanation
GET  /analytics/demand-forecast    — admin demand forecast for a flight
POST /crew/route/refresh           — crew ACO route refresh
GET  /flights/{id}/waste-analysis  — crew waste predictions for a flight
"""

from __future__ import annotations

import uuid
from typing import Optional
from pydantic import BaseModel

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser, require_role
from app.db.session import get_db
from app.models.ml import ModelRegistry
from app.models.waste_intervention import WasteIntervention
from app.schemas.api_v1 import ResponseEnvelope, success_response
import app.ml.recommender as recommender_module
import app.ml.forecasting as forecasting_module
import app.ml.routing as routing_module
import app.ml.waste as waste_module

router = APIRouter(tags=["ai"])

# ── Model name validation ─────────────────────────────────────────────────────

VALID_MODELS = {"recommender", "forecaster", "crew_router", "waste_predictor"}


def _get_registry_entry(db: Session, name: str) -> ModelRegistry:
    reg = db.scalar(select(ModelRegistry).where(ModelRegistry.model_name == name))
    if not reg:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Model '{name}' not found in registry",
        )
    return reg


def _format_registry(reg: ModelRegistry) -> dict:
    return {
        "model_name": reg.model_name,
        "version":    reg.version,
        "status":     reg.status,
        "metrics":    reg.metrics if reg.metrics else "Not yet evaluated",
        "trained_at": reg.trained_at.isoformat() if reg.trained_at else None,
        "created_at": reg.created_at.isoformat() if hasattr(reg, "created_at") and reg.created_at else None,
    }


# ── Model registry ─────────────────────────────────────────────────────────────

@router.get("/ai/models", response_model=ResponseEnvelope[list])
def list_models(
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role("admin")),
) -> dict:
    """List all model registry entries."""
    rows = db.execute(select(ModelRegistry)).scalars().all()
    return success_response([_format_registry(r) for r in rows])


@router.get("/ai/models/{name}", response_model=ResponseEnvelope[dict])
def get_model(
    name: str,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role("admin")),
) -> dict:
    """Get a single model's card."""
    if name not in VALID_MODELS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown model name. Valid: {sorted(VALID_MODELS)}",
        )
    reg = _get_registry_entry(db, name)
    return success_response(_format_registry(reg))


@router.post("/ai/models/{name}/retrain", response_model=ResponseEnvelope[dict])
def retrain_model(
    name: str,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role("admin")),
) -> dict:
    """
    Synchronously retrain the specified model and refresh computed metrics.

    This is intentionally synchronous for the local demo — no task queue needed.
    """
    if name not in VALID_MODELS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown model name. Valid: {sorted(VALID_MODELS)}",
        )

    if name == "recommender":
        result = recommender_module.train_and_evaluate(db)
    elif name == "forecaster":
        result = forecasting_module.train_and_evaluate(db)
    elif name == "crew_router":
        result = routing_module.evaluate(db)
    elif name == "waste_predictor":
        result = waste_module.train_and_evaluate(db)
    else:
        raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED,
                            detail="Retrain not implemented for this model")

    # Format metrics for response
    if result.get("metrics") is None:
        result["metrics"] = "Not yet evaluated"

    return success_response(result)


@router.get("/ai/models/{name}/drift", response_model=ResponseEnvelope[dict])
def get_model_drift(
    name: str,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role("admin")),
) -> dict:
    """
    Return a simple PSI drift estimate for the model's primary feature,
    comparing training-time distribution vs. recent data.

    Currently implemented for the forecaster (demand distribution) and
    waste predictor (waste distribution). Others return 'Not yet evaluated'.
    """
    if name not in VALID_MODELS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown model name. Valid: {sorted(VALID_MODELS)}",
        )

    reg = _get_registry_entry(db, name)
    if reg.status == "untrained" or reg.metrics is None:
        return success_response({"psi": "Not yet evaluated", "interpretation": None})

    from app.ml.evaluation import psi
    from app.models.meal import FlightInventory
    from app.models.order import OrderItem

    drift_result: dict = {"model_name": name, "psi": None, "interpretation": None}

    if name in ("forecaster", "waste_predictor"):
        # Compare first half vs second half of inventory wasted_qty distribution
        rows = db.execute(select(FlightInventory)).scalars().all()
        if rows and len(rows) >= 10:
            values = [float(r.wasted_qty) for r in rows]
            mid = len(values) // 2
            psi_val = psi(values[:mid], values[mid:])
            drift_result["psi"] = psi_val
            if psi_val is not None:
                if psi_val < 0.1:
                    interp = "No significant drift (PSI < 0.1)"
                elif psi_val < 0.25:
                    interp = "Moderate drift detected — consider retraining (PSI 0.1–0.25)"
                else:
                    interp = "Significant drift detected — retraining recommended (PSI > 0.25)"
                drift_result["interpretation"] = interp
        else:
            drift_result["psi"] = "Not yet evaluated"
    else:
        drift_result["psi"] = "Not yet evaluated"

    return success_response(drift_result)


# ── Passenger recommendations ─────────────────────────────────────────────────

@router.get("/flights/{flight_id}/recommendations", response_model=ResponseEnvelope[list])
def get_recommendations(
    flight_id: uuid.UUID,
    top_n: int = Query(default=10, ge=1, le=50),
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role("passenger")),
) -> dict:
    """
    Return AI-ranked meal recommendations for a passenger on a specific flight.

    Post-filters allergen conflicts and zero-stock items.
    Each result includes a short 'why' explanation.
    """
    passenger_id = current_user.id
    # Determine cabin class from the most recent order on this flight,
    # or default to economy
    from app.models.order import PassengerOrder
    last_order = db.scalar(
        select(PassengerOrder)
        .where(
            PassengerOrder.flight_id == flight_id,
            PassengerOrder.passenger_id == passenger_id,
        )
        .order_by(PassengerOrder.created_at.desc())  # type: ignore[union-attr]
    )
    cabin_class = last_order.cabin_class if last_order else "economy"

    recs = recommender_module.recommend(
        db=db,
        flight_id=flight_id,
        passenger_id=passenger_id,
        cabin_class=cabin_class,
        top_n=top_n,
    )
    return success_response(recs)


# ── Demand forecast ───────────────────────────────────────────────────────────

@router.get("/analytics/demand-forecast", response_model=ResponseEnvelope[list])
def get_demand_forecast(
    flight_id: uuid.UUID = Query(..., description="Flight UUID"),
    cabin_class: Optional[str] = Query(default=None, description="Filter by cabin class"),
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role("admin")),
) -> dict:
    """Return per-meal demand forecasts for a flight (admin only)."""
    forecasts = forecasting_module.forecast(db, flight_id, cabin_class)
    return success_response(forecasts)


# ── Crew route refresh ────────────────────────────────────────────────────────

@router.post("/crew/route/refresh", response_model=ResponseEnvelope[list])
def refresh_crew_route(
    flight_id: uuid.UUID = Query(..., description="Flight UUID"),
    crew_id: Optional[uuid.UUID] = Query(default=None, description="Filter by crew member"),
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role("crew")),
) -> dict:
    """
    Re-run ACO optimiser over pending tasks for the given flight (and optionally
    a specific crew member). Returns the new ordered delivery sequence.
    """
    route = routing_module.refresh_route(db, flight_id, crew_id)
    return success_response(route)


# ── Waste analysis ────────────────────────────────────────────────────────────

@router.get("/flights/{flight_id}/waste-analysis", response_model=ResponseEnvelope[list])
def get_waste_analysis(
    flight_id: uuid.UUID,
    cabin_class: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role("crew")),
) -> dict:
    """
    Return waste predictions per meal for a flight.

    Items above the waste threshold include an intervention suggestion.
    Accessible by crew and admin.
    """
    predictions = waste_module.predict_waste(db, flight_id, cabin_class)
    return success_response(predictions)


@router.get("/flights/{flight_id}/waste-analysis/admin", response_model=ResponseEnvelope[list])
def get_waste_analysis_admin(
    flight_id: uuid.UUID,
    cabin_class: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role("admin")),
) -> dict:
    """Same as crew waste analysis but accessible by admin role."""
    predictions = waste_module.predict_waste(db, flight_id, cabin_class)
    return success_response(predictions)


class WasteInterventionRequest(BaseModel):
    meal_id: uuid.UUID
    cabin_class: str
    action: str  # "offer_free" | "offer_discount" | "crew_meal"



@router.post("/flights/{flight_id}/waste-interventions", response_model=ResponseEnvelope[dict])
def set_waste_intervention(
    flight_id: uuid.UUID,
    body: WasteInterventionRequest,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role("crew")),
) -> dict:
    """
    Record (or update) a crew waste-reduction decision for a flagged meal:
    offer it free, offer it at a discount, or reassign it as a crew meal.
    Upserts on (flight_id, meal_id, cabin_class).
    """
    if body.action not in ("offer_free", "offer_discount", "crew_meal"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="action must be one of: offer_free, offer_discount, crew_meal",
        )
    existing = db.scalar(
        select(WasteIntervention).where(
            WasteIntervention.flight_id == flight_id,
            WasteIntervention.meal_id == body.meal_id,
            WasteIntervention.cabin_class == body.cabin_class,
        )
    )
    if existing:
        existing.action = body.action
        existing.created_by = current_user.id
    else:
        existing = WasteIntervention(
            id=uuid.uuid4(),
            flight_id=flight_id,
            meal_id=body.meal_id,
            cabin_class=body.cabin_class,
            action=body.action,
            created_by=current_user.id,
        )
        db.add(existing)
    db.commit()
    db.refresh(existing)
    return success_response({
        "id": str(existing.id),
        "flight_id": str(existing.flight_id),
        "meal_id": str(existing.meal_id),
        "cabin_class": existing.cabin_class,
        "action": existing.action,
    })


@router.delete("/flights/{flight_id}/waste-interventions", response_model=ResponseEnvelope[dict])
def delete_waste_intervention(
    flight_id: uuid.UUID,
    meal_id: Optional[uuid.UUID] = None,
    cabin_class: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role("crew")),
) -> dict:
    """
    Revert crew waste-reduction decisions.
    - If meal_id + cabin_class query params are provided: delete that single intervention.
    - If both are omitted: delete ALL interventions for the flight (reset all).
    """
    q = select(WasteIntervention).where(WasteIntervention.flight_id == flight_id)
    if meal_id is not None and cabin_class is not None:
        q = q.where(
            WasteIntervention.meal_id == meal_id,
            WasteIntervention.cabin_class == cabin_class,
        )
    rows = db.scalars(q).all()
    deleted = len(rows)
    for r in rows:
        db.delete(r)
    db.commit()
    return success_response({"deleted": deleted})



@router.get("/flights/{flight_id}/waste-interventions", response_model=ResponseEnvelope[list[dict]])
def list_waste_interventions(
    flight_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role("crew")),
) -> dict:
    """Return all recorded waste-intervention decisions for a flight."""
    rows = db.scalars(
        select(WasteIntervention).where(WasteIntervention.flight_id == flight_id)
    ).all()
    return success_response([
        {
            "id": str(r.id),
            "meal_id": str(r.meal_id),
            "cabin_class": r.cabin_class,
            "action": r.action,
        }
        for r in rows
    ])
