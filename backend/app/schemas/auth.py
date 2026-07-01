"""Auth request / response schemas."""

import uuid
from datetime import date
from typing import Optional

from pydantic import BaseModel, Field, field_validator


class RegisterRequest(BaseModel):
    pnr: str = Field(min_length=1, max_length=20)
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=8, description="Minimum 8 characters")
    dob: Optional[date] = None
    nationality: Optional[str] = Field(None, max_length=100)
    # Dietary wizard fields — all optional at registration
    dietary_flags: Optional[dict] = None
    allergy_flags: Optional[dict] = None
    cuisine_prefs: Optional[dict] = None
    portion_pref: Optional[str] = Field(None, max_length=20)
    price_sensitivity: Optional[str] = Field(None, max_length=20)

    @field_validator("email")
    @classmethod
    def email_must_contain_at(cls, v: str) -> str:
        if "@" not in v:
            raise ValueError("Not a valid email address")
        return v.lower().strip()

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    role: str
    user_id: uuid.UUID


class RefreshRequest(BaseModel):
    refresh_token: str


class MeResponse(BaseModel):
    id: uuid.UUID
    email: str
    role: str
    name: str
