"""Meals API endpoints."""

import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser, require_role
from app.db.session import get_db
from app.models.meal import MealItem
from app.models.passenger import PassengerProfile
from app.schemas.api_v1 import (
    MealAllergenCheckResponse,
    ResponseEnvelope,
    success_response,
)

router = APIRouter(prefix="/meals", tags=["meals"])


@router.get("/{id}/allergen-check", response_model=ResponseEnvelope[MealAllergenCheckResponse])
def check_meal_allergens(
    id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role("passenger")),
) -> dict:
    """Check if a specific meal has allergens that conflict with the passenger's allergies."""
    meal = db.scalar(select(MealItem).where(MealItem.id == id))
    if not meal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Meal not found",
        )

    profile = db.scalar(
        select(PassengerProfile).where(PassengerProfile.passenger_id == current_user.id)
    )
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Passenger profile not found",
        )

    allergy_flags = profile.allergy_flags or {}
    meal_allergens = meal.allergen_flags or {}

    conflicting = []
    for allergen, is_allergic in allergy_flags.items():
        if is_allergic and meal_allergens.get(allergen):
            conflicting.append(allergen)

    is_safe = len(conflicting) == 0

    res = MealAllergenCheckResponse(
        meal_id=id,
        passenger_id=current_user.id,
        is_safe=is_safe,
        conflicting_allergens=conflicting,
    )
    return success_response(res)
