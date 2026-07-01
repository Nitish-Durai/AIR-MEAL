"""Feedback API endpoints."""

import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser, require_role
from app.db.session import get_db
from app.models.feedback import Feedback
from app.models.order import OrderStatus, PassengerOrder
from app.schemas.api_v1 import (
    FeedbackCreateRequest,
    FeedbackResponse,
    ResponseEnvelope,
    success_response,
)

router = APIRouter(prefix="/feedback", tags=["feedback"])


@router.post("", response_model=ResponseEnvelope[FeedbackResponse])
def create_feedback(
    payload: FeedbackCreateRequest,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_role("passenger")),
) -> dict:
    """Submit rating review feedback for a delivered order."""
    # Verify order exists
    order = db.scalar(select(PassengerOrder).where(PassengerOrder.id == payload.order_id))
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Order not found",
        )

    # Verify ownership
    if order.passenger_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot leave feedback on another passenger's order",
        )

    # Verify order status is delivered
    if order.status != OrderStatus.delivered.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Can only submit feedback for delivered orders",
        )

    # Verify feedback doesn't already exist for this order
    existing_feedback = db.scalar(select(Feedback).where(Feedback.order_id == payload.order_id))
    if existing_feedback:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Feedback already submitted for this order",
        )

    feedback = Feedback(
        id=uuid.uuid4(),
        order_id=payload.order_id,
        overall_rating=payload.overall_rating,
        taste_rating=payload.taste_rating,
        temp_rating=payload.temp_rating,
        portion_rating=payload.portion_pref if hasattr(payload, "portion_pref") else payload.portion_rating,  # Fallback just in case
        speed_rating=payload.speed_rating,
        tags=payload.tags or [],
        free_text=payload.free_text,
    )
    # Ensure correct name matching on portion rating field
    # (Pydantic model has portion_rating, model field has portion_rating)
    if hasattr(payload, "portion_rating"):
        feedback.portion_rating = payload.portion_rating

    db.add(feedback)
    db.commit()
    db.refresh(feedback)

    return success_response(FeedbackResponse.model_validate(feedback))
