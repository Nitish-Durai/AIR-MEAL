from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    DATABASE_URL: str
    JWT_SECRET: str
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    FRONTEND_ORIGIN: str = "http://localhost:3000"
    # Public base URL of the frontend, used to build shareable links (QR codes).
    # Defaults to FRONTEND_ORIGIN when not set separately.
    PUBLIC_FRONTEND_URL: str = "http://localhost:3000"


settings = Settings()
