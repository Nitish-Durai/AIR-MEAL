"""ModelRegistry — tracks ML model versions and computed metrics."""

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, String, Text, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class ModelRegistry(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "model_registry"

    model_name: Mapped[str] = mapped_column(String(100), nullable=False)
    version: Mapped[str] = mapped_column(String(50), nullable=False)
    # E.g. "untrained", "trained", "evaluating", "ready", "deprecated"
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="untrained")
    # Populated only after evaluation — NEVER seeded with blueprint target numbers
    metrics: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True, default=None)
    trained_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True, default=None
    )
