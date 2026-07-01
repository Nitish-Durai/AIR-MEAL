"""Alembic environment configuration."""

from logging.config import fileConfig
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine, pool
from alembic import context

# Load backend/.env relative to this file so DATABASE_URL is available
_env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(_env_path)

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Import Base so all models are registered for autogenerate
from app.db.base import Base
import app.models  # noqa: F401 — registers all model classes
from app.core.config import settings  # reads DATABASE_URL from .env

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=settings.DATABASE_URL,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    # Build engine directly from settings so the .env URL is always used,
    # not the literal placeholder in alembic.ini.
    connectable = create_engine(settings.DATABASE_URL, poolclass=pool.NullPool)
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
