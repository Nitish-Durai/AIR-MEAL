"""Password hashing (argon2) and JWT creation / verification."""

from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings

# argon2 is the strongest scheme; deprecated="auto" transparently re-hashes old entries
pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")


def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def _build_payload(subject: str, email: str, role: str, token_type: str, ttl: timedelta) -> dict:
    return {
        "sub": subject,
        "email": email,
        "role": role,
        "type": token_type,
        "exp": datetime.now(timezone.utc) + ttl,
        "iat": datetime.now(timezone.utc),
    }


def create_access_token(subject: str, email: str, role: str) -> str:
    """15-minute HS256 access token."""
    payload = _build_payload(
        subject, email, role, "access",
        timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token(subject: str, email: str, role: str) -> str:
    """7-day HS256 refresh token."""
    payload = _build_payload(
        subject, email, role, "refresh",
        timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
    )
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    """Decode and verify a JWT. Raises ValueError on any error."""
    try:
        return jwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=[settings.JWT_ALGORITHM],
        )
    except JWTError as exc:
        raise ValueError(f"Invalid token: {exc}") from exc
