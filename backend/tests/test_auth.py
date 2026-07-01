"""Phase 2 acceptance test — Auth & Role-Based Access.

Runs against the live Postgres database (must be up on port 5433).
Uses a unique e-mail suffix per test-session so re-runs never collide.
Test data is NOT rolled back (passenger row stays in DB); the prefix makes it
obvious it is test data.
"""

import uuid

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app, raise_server_exceptions=False)

# ── unique credentials for this test run ─────────────────────────────────────
_SUFFIX = uuid.uuid4().hex[:8]
TEST_EMAIL = f"phase2_{_SUFFIX}@airmeal-test.dev"
TEST_PNR = f"P2{_SUFFIX[:8].upper()}"
TEST_PASSWORD = "Secure#Pass123!"


# ── fixtures ─────────────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def registered():
    """Register once; share token pair across tests in this module."""
    r = client.post(
        "/auth/register",
        json={
            "pnr": TEST_PNR,
            "first_name": "Phase2",
            "last_name": "Tester",
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD,
            "dietary_flags": {"vegetarian": True},
            "allergy_flags": {"nuts": False},
        },
    )
    assert r.status_code == 201, f"Register failed: {r.text}"
    return r.json()


# ── tests ─────────────────────────────────────────────────────────────────────

def test_register_returns_passenger_tokens(registered):
    assert registered["role"] == "passenger"
    assert "access_token" in registered
    assert "refresh_token" in registered
    assert "user_id" in registered


def test_login_returns_passenger_tokens():
    r = client.post(
        "/auth/login",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD},
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["role"] == "passenger"
    assert "access_token" in data


def test_login_wrong_password():
    r = client.post(
        "/auth/login",
        json={"email": TEST_EMAIL, "password": "WrongPass999!"},
    )
    assert r.status_code == 401


def test_login_unknown_email():
    r = client.post(
        "/auth/login",
        json={"email": "nobody@nowhere.dev", "password": TEST_PASSWORD},
    )
    assert r.status_code == 401


def test_me_returns_user_info(registered):
    token = registered["access_token"]
    r = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["email"] == TEST_EMAIL
    assert data["role"] == "passenger"
    assert "id" in data


def test_me_rejects_no_token():
    r = client.get("/auth/me")
    assert r.status_code == 401


def test_me_rejects_garbage_token():
    r = client.get("/auth/me", headers={"Authorization": "Bearer not.a.token"})
    assert r.status_code == 401


def test_passenger_token_rejected_on_crew_endpoint(registered):
    """Core RBAC check: passenger → 403 on crew-only route."""
    token = registered["access_token"]
    r = client.get("/auth/crew-check", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403, f"Expected 403, got {r.status_code}: {r.text}"


def test_passenger_token_rejected_on_admin_endpoint(registered):
    token = registered["access_token"]
    r = client.get("/auth/admin-check", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403


def test_refresh_issues_new_access_token(registered):
    refresh = registered["refresh_token"]
    r = client.post("/auth/refresh", json={"refresh_token": refresh})
    assert r.status_code == 200, r.text
    data = r.json()
    assert "access_token" in data
    # A new access token is returned; it may be identical if issued in the same second
    # (same iat).  test_refresh_new_token_works_on_me verifies it is actually usable.


def test_refresh_new_token_works_on_me(registered):
    refresh = registered["refresh_token"]
    r = client.post("/auth/refresh", json={"refresh_token": refresh})
    new_access = r.json()["access_token"]

    r2 = client.get("/auth/me", headers={"Authorization": f"Bearer {new_access}"})
    assert r2.status_code == 200
    assert r2.json()["email"] == TEST_EMAIL


def test_refresh_rejects_access_token_as_refresh(registered):
    """Must not accept an access token where a refresh token is expected."""
    r = client.post(
        "/auth/refresh",
        json={"refresh_token": registered["access_token"]},
    )
    assert r.status_code == 401


def test_duplicate_registration_rejected(registered):
    r = client.post(
        "/auth/register",
        json={
            "pnr": "UNIQUE999",
            "first_name": "Dup",
            "last_name": "User",
            "email": TEST_EMAIL,   # same email
            "password": TEST_PASSWORD,
        },
    )
    assert r.status_code == 409
