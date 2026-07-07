"""Passenger profile API endpoints."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

import numpy as np

from app.core.deps import CurrentUser, require_role
from app.db.session import get_db
from app.models.passenger import Passenger, PassengerProfile
from app.ml.data_gen import _passenger_embedding
from app.schemas.api_v1 import (
    PassengerProfileResponse,
    PassengerProfileUpdate,
    ResponseEnvelope,
    success_response,
)

router = APIRouter(prefix="/passengers", tags=["passengers"])


@router.get("/profile", response_model=ResponseEnvelope[PassengerProfileResponse])
def get_profile(
    current_user: CurrentUser = Depends(require_role("passenger")),
    db: Session = Depends(get_db),
) -> dict:
    """Retrieve the passenger profile for the authenticated passenger."""
    profile = db.scalar(
        select(PassengerProfile).where(PassengerProfile.passenger_id == current_user.id)
    )
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Passenger profile not found",
        )
    return success_response(PassengerProfileResponse.model_validate(profile))


@router.put("/profile", response_model=ResponseEnvelope[PassengerProfileResponse])
def update_profile(
    payload: PassengerProfileUpdate,
    current_user: CurrentUser = Depends(require_role("passenger")),
    db: Session = Depends(get_db),
) -> dict:
    """Update onboarding/preference fields for the authenticated passenger."""
    profile = db.scalar(
        select(PassengerProfile).where(PassengerProfile.passenger_id == current_user.id)
    )
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Passenger profile not found",
        )

    # Apply updates
    if payload.dietary_flags is not None:
        profile.dietary_flags = payload.dietary_flags
    if payload.allergy_flags is not None:
        profile.allergy_flags = payload.allergy_flags
    if payload.cuisine_prefs is not None:
        profile.cuisine_prefs = payload.cuisine_prefs
    if payload.portion_pref is not None:
        profile.portion_pref = payload.portion_pref
    if payload.price_sensitivity is not None:
        profile.price_sensitivity = payload.price_sensitivity

    # Recompute the 32-dim preference embedding so the recommender reflects the
    # passenger's updated choices. Uses the same builder as the seed generator.
    passenger = db.scalar(select(Passenger).where(Passenger.id == current_user.id))
    ffp_tier = getattr(passenger, "ffp_tier", None) if passenger else None
    profile.preference_embedding = _passenger_embedding(
        profile.cuisine_prefs or {},
        profile.dietary_flags or {},
        profile.allergy_flags or {},
        profile.price_sensitivity or "mid",
        profile.portion_pref or "medium",
        ffp_tier or "Bronze",
        np.random.default_rng(0),
    )

    db.commit()
    db.refresh(profile)
    return success_response(PassengerProfileResponse.model_validate(profile))
