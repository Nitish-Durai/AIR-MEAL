"""
This conftest.py isolates the test suite from the development database by
forcing all test database connections to use the 'airmeal_test' database.
It includes a safety guard to prevent tests from running against the main
development database.
"""

import os
import pytest
from sqlalchemy import create_engine

# Import the FastAPI app to ensure all models are registered on the Base metadata
import app.main
from app.db.base import Base
from app.core.config import settings
import app.db.session

# 1. Resolve the test database URL
test_url = os.environ.get("TEST_DATABASE_URL")
if not test_url:
    # Derive test database name from settings.DATABASE_URL
    base_url, db_name = settings.DATABASE_URL.rsplit("/", 1)
    if "?" in db_name:
        name_part, query_part = db_name.split("?", 1)
        test_url = f"{base_url}/airmeal_test?{query_part}"
    else:
        test_url = f"{base_url}/airmeal_test"

# 2. Safety Guard Check: Assert the target database is exactly 'airmeal_test'
test_db_name = test_url.rsplit("/", 1)[1]
if "?" in test_db_name:
    test_db_name = test_db_name.split("?", 1)[0]

if test_db_name != "airmeal_test":
    raise RuntimeError(
        f"Refusing to run tests: test database must be named 'airmeal_test', got '{test_db_name}'. "
        "This guard prevents wiping the dev database."
    )

# 3. Create the SQLAlchemy engine for the test database
test_engine = create_engine(test_url, pool_pre_ping=True)

# 4. Create all tables in the test database
Base.metadata.create_all(bind=test_engine)

# 5. Rebind existing SessionLocal and engine to the test engine
app.db.session.engine = test_engine
app.db.session.SessionLocal.configure(bind=test_engine)

# 6. Session-scoped autouse fixture for teardown
@pytest.fixture(scope="session", autouse=True)
def teardown_test_db():
    yield
    Base.metadata.drop_all(bind=test_engine)
