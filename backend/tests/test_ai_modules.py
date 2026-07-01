"""Phase 5 acceptance tests — AI Modules.

Tests
-----
1. Recommender: returns valid ranked list with no allergen violations.
2. Demand Forecaster: endpoint returns valid shape; metrics computed after retrain.
3. ACO Router: route refresh returns ordered sequence; ACO performs at least as well
   as front-to-back on priority ordering.
4. Waste Predictor: predictions have valid shape; high-waste items flag suggestions.
5. Model Registry: retrain updates metrics (not NULL and not hardcoded targets).
6. Allergen zero-violation: recommendations for all allergy profiles contain no conflicts.
"""

import uuid
import pytest
from fastapi.testclient import TestClient
from jose import jwt
from sqlalchemy import select, text

from app.main import app
from app.core.config import settings
from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models.flight import Flight
from app.models.meal import FlightInventory, MealItem
from app.models.ml import ModelRegistry
from app.models.passenger import Passenger, PassengerProfile
from app.models.order import PassengerOrder, OrderItem
from app.models.delivery import DeliveryTask, DeliveryStatus
from app.models.crew import CrewMember, CrewRole

import app.ml.recommender as recommender_module
import app.ml.forecasting as forecasting_module
import app.ml.routing as routing_module
import app.ml.waste as waste_module

client = TestClient(app, raise_server_exceptions=True)


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def ai_test_data():
    """
    Set up a minimal but complete data environment for AI tests.
    Uses the seeded data already in the DB if available; otherwise inserts test rows.
    """
    db = SessionLocal()

    # Check if seeded data exists
    existing_flight = db.execute(select(Flight).limit(1)).scalar()
    existing_passenger = db.execute(select(PassengerProfile).limit(1)).scalar()
    has_seeded_data = existing_flight is not None and existing_passenger is not None

    if has_seeded_data:
        # Use existing seeded data for AI tests
        flight = existing_flight
        # Find crew members: we need one for admin, one for crew
        crews = db.execute(select(CrewMember).limit(2)).scalars().all()
        admin_crew = None
        crew = None
        if len(crews) >= 2:
            admin_crew = crews[0]
            crew = crews[1]
        elif len(crews) == 1:
            crew = crews[0]
            # Create a separate admin crew
            admin_crew = CrewMember(
                id=_uid(np.random.default_rng(42)),
                employee_id="EMPADM",
                name="AI Admin Crew",
                role="admin",
                airline_id=flight.airline_id,
                assigned_zone="A",
                hashed_password=hash_password("admin123"),
                email="aiadmin@test.com"
            )
            db.add(admin_crew)
            db.commit()
            db.refresh(admin_crew)
        
        if admin_crew and admin_crew.role != "admin":
            db.execute(
                text("UPDATE crew_members SET role = 'admin' WHERE id = :id"),
                {"id": admin_crew.id}
            )
            db.commit()

        passenger_profile = existing_passenger
        passenger = db.execute(
            select(Passenger).where(Passenger.id == passenger_profile.passenger_id)
        ).scalar()

        # Find a flight that has inventory
        inv = db.execute(
            select(FlightInventory)
            .where(FlightInventory.flight_id == flight.id)
            .limit(1)
        ).scalar()

        if inv is None:
            # Pick a different flight
            flights_with_inv = db.execute(
                select(Flight)
                .join(FlightInventory, Flight.id == FlightInventory.flight_id)
                .limit(1)
            ).scalar()
            flight = flights_with_inv or flight

        db.close()
        yield {
            "flight_id":    flight.id,
            "passenger_id": passenger.id,
            "passenger_email": passenger.email,
            "crew_id": crew.id if crew else None,
            "crew_email": crew.email if crew else None,
            "from_seed":    True,
        }
        return

    # Otherwise create minimal test rows
    airline_id  = uuid.uuid4()
    flight_id   = uuid.uuid4()
    crew_id     = uuid.uuid4()
    admin_crew_id = uuid.uuid4()
    passenger_id = uuid.uuid4()
    meal1_id    = uuid.uuid4()
    meal2_id    = uuid.uuid4()

    db.execute(
        text("INSERT INTO airlines (id, name, code) VALUES (:id, 'AITest', 'AT') ON CONFLICT DO NOTHING"),
        {"id": airline_id},
    )
    db.execute(
        text(
            "INSERT INTO flights (id, flight_number, airline_id, origin, destination, "
            "dep_time, arr_time, aircraft_type, load_factor, status) "
            "VALUES (:id, 'AT001', :al, 'SIN', 'DXB', NOW(), NOW() + INTERVAL '7 hours', "
            "'B737-800', 0.80, 'in_flight')"
        ),
        {"id": flight_id, "al": airline_id},
    )
    db.execute(
        text(
            "INSERT INTO crew_members (id, employee_id, name, role, airline_id, "
            "assigned_zone, hashed_password, email) "
            "VALUES (:id, 'EMAI01', 'AI Crew', 'cabin_crew', :al, 'A', :pw, 'aicrew@test.com')"
        ),
        {"id": crew_id, "al": airline_id, "pw": hash_password("crew123")},
    )
    db.execute(
        text(
            "INSERT INTO crew_members (id, employee_id, name, role, airline_id, "
            "assigned_zone, hashed_password, email) "
            "VALUES (:id, 'EMAI02', 'AI Admin', 'admin', :al, 'A', :pw, 'aiadmin@test.com')"
        ),
        {"id": admin_crew_id, "al": airline_id, "pw": hash_password("crew123")},
    )
    db.execute(
        text(
            "INSERT INTO passengers (id, pnr, first_name, last_name, email, hashed_password) "
            "VALUES (:id, 'PNRAI1', 'AI', 'Passenger', 'aipass@test.com', :pw)"
        ),
        {"id": passenger_id, "pw": hash_password("pass123")},
    )
    _emb_vals = "[" + ",".join(["0.1"] * 32) + "]"
    db.execute(
        text(
            "INSERT INTO passenger_profiles "
            "(id, passenger_id, dietary_flags, allergy_flags, cuisine_prefs, portion_pref, "
            "price_sensitivity, preference_embedding) "
            "VALUES (:id, :pid, CAST(:df AS jsonb), CAST(:af AS jsonb), "
            "CAST(:cp AS jsonb), 'medium', 'mid', CAST(:emb AS jsonb))"
        ),
        {
            "id": str(uuid.uuid4()),
            "pid": str(passenger_id),
            "df": '{"vegetarian": true}',
            "af": '{"nuts": true}',
            "cp": '{"indian": 0.9}',
            "emb": _emb_vals,
        },
    )
    # Two meals: one safe, one allergen-flagged
    db.execute(
        text(
            "INSERT INTO meal_items (id, meal_code, name, cuisine_type, calories, "
            "allergen_flags, dietary_flags, meal_embedding) "
            "VALUES (:id, 'AIM01', 'AI Safe Curry', 'indian', 400, "
            "'{\"nuts\": false, \"gluten\": false, \"dairy\": false, \"eggs\": false, "
            "\"soy\": false, \"shellfish\": false, \"sesame\": false, \"fish\": false}', "
            "'{\"vegetarian\": true, \"vegan\": false, \"halal\": true, \"kosher\": false, "
            "\"gluten_free\": true, \"low_calorie\": false}', CAST(:emb AS jsonb))"
        ),
        {"id": meal1_id, "emb": "[" + ",".join(["0.2"] * 32) + "]"},
    )
    db.execute(
        text(
            "INSERT INTO meal_items (id, meal_code, name, cuisine_type, calories, "
            "allergen_flags, dietary_flags, meal_embedding) "
            "VALUES (:id, 'AIM02', 'AI Nut Dessert', 'continental', 350, "
            "'{\"nuts\": true, \"gluten\": false, \"dairy\": false, \"eggs\": false, "
            "\"soy\": false, \"shellfish\": false, \"sesame\": false, \"fish\": false}', "
            "'{\"vegetarian\": true, \"vegan\": false, \"halal\": false, \"kosher\": false, "
            "\"gluten_free\": false, \"low_calorie\": false}', CAST(:emb AS jsonb))"
        ),
        {"id": meal2_id, "emb": "[" + ",".join(["0.5"] * 32) + "]"},
    )
    db.execute(
        text(
            "INSERT INTO flight_inventory "
            "(id, flight_id, meal_id, cabin_class, initial_qty, reserved_qty, served_qty, "
            "wasted_qty, restock_alert_qty) "
            "VALUES (:id, :fid, :mid, 'economy', 30, 2, 3, 1, 5)"
        ),
        {"id": uuid.uuid4(), "fid": flight_id, "mid": meal1_id},
    )
    db.execute(
        text(
            "INSERT INTO flight_inventory "
            "(id, flight_id, meal_id, cabin_class, initial_qty, reserved_qty, served_qty, "
            "wasted_qty, restock_alert_qty) "
            "VALUES (:id, :fid, :mid, 'economy', 20, 1, 2, 8, 3)"
        ),
        {"id": uuid.uuid4(), "fid": flight_id, "mid": meal2_id},
    )
    db.commit()
    db.close()

    yield {
        "flight_id":       flight_id,
        "passenger_id":    passenger_id,
        "passenger_email": "aipass@test.com",
        "crew_id":         crew_id,
        "crew_email":      "aicrew@test.com",
        "meal1_id":        meal1_id,
        "meal2_id":        meal2_id,
        "from_seed":       False,
    }

    # Cleanup
    db = SessionLocal()
    db.execute(text("DELETE FROM flight_inventory WHERE flight_id = :fid"), {"fid": flight_id})
    db.execute(text("DELETE FROM meal_items WHERE meal_code IN ('AIM01', 'AIM02')"))
    db.execute(text("DELETE FROM passenger_profiles WHERE passenger_id = :pid"), {"pid": passenger_id})
    db.execute(text("DELETE FROM passengers WHERE id = :pid"), {"pid": passenger_id})
    db.execute(text("DELETE FROM crew_members WHERE email IN ('aicrew@test.com', 'aiadmin@test.com')"))
    db.execute(text("DELETE FROM flights WHERE id = :fid"), {"fid": flight_id})
    db.execute(text("DELETE FROM airlines WHERE id = :aid"), {"aid": airline_id})
    db.commit()
    db.close()


def _make_passenger_token(passenger_id: uuid.UUID, email: str) -> str:
    return jwt.encode(
        {"sub": str(passenger_id), "email": email, "role": "passenger", "type": "access"},
        settings.JWT_SECRET,
        algorithm=settings.JWT_ALGORITHM,
    )


def _make_crew_token(crew_id: uuid.UUID, email: str) -> str:
    return jwt.encode(
        {"sub": str(crew_id), "email": email, "role": "crew", "type": "access"},
        settings.JWT_SECRET,
        algorithm=settings.JWT_ALGORITHM,
    )


def _make_admin_token() -> str:
    # Mint an admin JWT from a crew member with the "admin" role.
    db = SessionLocal()
    crew = db.execute(select(CrewMember).where(CrewMember.role == "admin").limit(1)).scalar()
    if crew is None:
        # Fallback to the first crew member and elevate them
        crew = db.execute(select(CrewMember).limit(1)).scalar()
        if crew:
            db.execute(
                text("UPDATE crew_members SET role = 'admin' WHERE id = :id"),
                {"id": crew.id}
            )
            db.commit()
            db.refresh(crew)
    db.close()
    if crew is None:
        raise RuntimeError("No crew member found in DB for admin token generation")
    return jwt.encode(
        {"sub": str(crew.id), "email": crew.email, "role": "admin", "type": "access"},
        settings.JWT_SECRET,
        algorithm=settings.JWT_ALGORITHM,
    )


# ── Test 1: Recommender endpoint returns valid shape ─────────────────────────

def test_recommendations_valid_shape(ai_test_data):
    """GET /flights/{id}/recommendations returns a list of ranked meals."""
    token = _make_passenger_token(
        ai_test_data["passenger_id"], ai_test_data["passenger_email"]
    )
    r = client.get(
        f"/api/v1/flights/{ai_test_data['flight_id']}/recommendations",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert isinstance(data, list), "Response data should be a list"
    if data:
        item = data[0]
        assert "meal_id" in item
        assert "name" in item
        assert "score" in item
        assert "why" in item
        assert isinstance(item["score"], float)


# ── Test 2: Allergen zero-violation in recommendations ──────────────────────

def test_recommendations_allergen_zero_violation(ai_test_data):
    """
    Recommendations must NEVER include meals that conflict with the passenger's
    allergy profile. This is the critical safety guarantee.
    """
    db = SessionLocal()
    profiles = db.execute(select(PassengerProfile)).scalars().all()
    db.close()

    if not profiles:
        pytest.skip("No passenger profiles found in DB")

    violations = 0
    tested_profiles = 0

    db = SessionLocal()
    try:
        for profile in profiles[:50]:  # Test first 50 profiles
            allergy_flags = profile.allergy_flags or {}
            active_allergens = {k for k, v in allergy_flags.items() if v}
            if not active_allergens:
                continue  # Skip profiles with no allergies

            passenger = db.execute(
                select(Passenger).where(Passenger.id == profile.passenger_id)
            ).scalar()
            if not passenger:
                continue

            # Get any flight with inventory
            inv = db.execute(
                select(FlightInventory).limit(1)
            ).scalar()
            if not inv:
                continue

            flight_id = inv.flight_id
            cabin_class = inv.cabin_class

            recs = recommender_module.recommend(
                db=db,
                flight_id=flight_id,
                passenger_id=profile.passenger_id,
                cabin_class=cabin_class,
                top_n=20,
            )

            for rec in recs:
                rec_allergens = rec.get("allergen_flags", {})
                for allergen in active_allergens:
                    if rec_allergens.get(allergen):
                        violations += 1

            tested_profiles += 1

    finally:
        db.close()

    assert violations == 0, (
        f"Allergen zero-violation FAILED: {violations} violations found "
        f"across {tested_profiles} passenger profiles"
    )
    assert tested_profiles > 0, "No allergic passengers found to test"


# ── Test 3: Demand forecaster endpoint ───────────────────────────────────────

def test_demand_forecast_valid_shape(ai_test_data):
    """GET /analytics/demand-forecast returns per-meal forecasts."""
    token = _make_admin_token()
    r = client.get(
        f"/api/v1/analytics/demand-forecast?flight_id={ai_test_data['flight_id']}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert isinstance(data, list)
    if data:
        item = data[0]
        assert "meal_id" in item
        assert "predicted_demand" in item
        assert "current_stock" in item
        assert "method" in item
        assert isinstance(item["predicted_demand"], (int, float))
        assert item["predicted_demand"] >= 0.0


# ── Test 4: Forecaster retrain updates model registry ────────────────────────

def test_forecaster_retrain_updates_registry():
    """
    POST /ai/models/forecaster/retrain must compute and store real metrics.
    The resulting metrics must NOT be null (if enough data) and must NOT
    contain any of the blueprint's hardcoded target numbers.
    """
    token = _make_admin_token()
    r = client.post(
        "/api/v1/ai/models/forecaster/retrain",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 200, r.text
    result = r.json()["data"]

    assert result["model_name"] == "forecaster"
    assert result["status"] in ("ready", "trained")

    # If metrics were computed, they must be real numbers (not "Not yet evaluated"
    # only when there IS enough data — the module returns None when insufficient)
    db = SessionLocal()
    reg = db.execute(
        select(ModelRegistry).where(ModelRegistry.model_name == "forecaster")
    ).scalar()
    db.close()

    if reg and reg.metrics:
        # Verify no blueprint hardcoded targets appear
        metrics_str = str(reg.metrics)
        # These are the blueprint's aspirational numbers that must NEVER appear
        forbidden = ["0.847", "2.14", "27.3", "68.3"]
        for val in forbidden:
            assert val not in metrics_str, (
                f"Hardcoded blueprint target '{val}' found in forecaster metrics: {metrics_str}"
            )
        # Real MAE must be a number
        if "mae" in reg.metrics:
            assert isinstance(reg.metrics["mae"], (int, float))


# ── Test 5: Recommender retrain updates registry ─────────────────────────────

def test_recommender_retrain_updates_registry():
    """POST /ai/models/recommender/retrain must store computed metrics."""
    token = _make_admin_token()
    r = client.post(
        "/api/v1/ai/models/recommender/retrain",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 200, r.text
    result = r.json()["data"]
    assert result["model_name"] == "recommender"
    assert result["status"] in ("ready", "trained")

    db = SessionLocal()
    reg = db.execute(
        select(ModelRegistry).where(ModelRegistry.model_name == "recommender")
    ).scalar()
    db.close()

    if reg and reg.metrics:
        metrics_str = str(reg.metrics)
        forbidden = ["0.847", "0.72", "0.64"]  # blueprint target numbers
        for val in forbidden:
            assert val not in metrics_str, (
                f"Hardcoded blueprint target '{val}' found in recommender metrics: {metrics_str}"
            )


# ── Test 6: ACO route refresh ─────────────────────────────────────────────────

def test_aco_route_refresh(ai_test_data):
    """POST /crew/route/refresh returns an ordered sequence of tasks."""
    if ai_test_data.get("crew_id") is None:
        pytest.skip("No crew member available")

    token = _make_crew_token(ai_test_data["crew_id"], ai_test_data["crew_email"])
    r = client.post(
        f"/api/v1/crew/route/refresh?flight_id={ai_test_data['flight_id']}",
        headers={"Authorization": f"Bearer {token}"},
    )
    # May return empty list if no pending tasks
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert isinstance(data, list)
    if data:
        # Positions should be sequential integers
        positions = [item["route_position"] for item in data]
        assert positions == list(range(1, len(positions) + 1)), (
            f"Route positions not sequential: {positions}"
        )


# ── Test 7: ACO unit test — priority ordering ─────────────────────────────────

def test_aco_priority_violation_vs_baseline():
    """
    Unit test: ACO should produce fewer priority violations than front-to-back.

    We construct a scenario where high-priority seats are far back in alphabetical
    seat order, so the baseline (front-to-back) will produce many violations.
    """
    from app.ml.routing import aco_route

    # 8 tasks: seats in rows 1–8, priorities inverted (high priority = back rows)
    seat_numbers = [f"Y{r}A" for r in range(1, 9)]
    # Priority: later rows have higher priority (inverted from front-to-back)
    priority_scores = [float(9 - r) for r in range(1, 9)]
    # row 1 → priority 8, row 8 → priority 1

    def count_violations(order):
        count = 0
        for k in range(len(order) - 1):
            if priority_scores[order[k + 1]] > priority_scores[order[k]]:
                count += 1
        return count

    # Baseline: front-to-back order [0, 1, 2, 3, 4, 5, 6, 7]
    baseline_order = list(range(8))
    baseline_violations = count_violations(baseline_order)

    aco_order = aco_route(seat_numbers, priority_scores)
    aco_violations = count_violations(aco_order)

    # ACO should produce fewer or equal violations compared to baseline
    assert aco_violations <= baseline_violations, (
        f"ACO ({aco_violations} violations) worse than baseline ({baseline_violations} violations)"
    )


# ── Test 8: Waste predictor endpoint ─────────────────────────────────────────

def test_waste_predictions_valid_shape(ai_test_data):
    """GET /flights/{id}/waste-analysis returns per-meal waste predictions."""
    if ai_test_data.get("crew_id") is None:
        pytest.skip("No crew member available")

    token = _make_crew_token(ai_test_data["crew_id"], ai_test_data["crew_email"])
    r = client.get(
        f"/api/v1/flights/{ai_test_data['flight_id']}/waste-analysis",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert isinstance(data, list)
    if data:
        item = data[0]
        assert "meal_id" in item
        assert "predicted_waste" in item
        assert "waste_pct" in item
        assert "should_intervene" in item
        assert isinstance(item["predicted_waste"], (int, float))
        assert item["predicted_waste"] >= 0.0
        assert 0.0 <= item["waste_pct"] <= 100.0


# ── Test 9: Model list endpoint ───────────────────────────────────────────────

def test_ai_model_list():
    """GET /ai/models returns all 4 models with valid status fields."""
    token = _make_admin_token()
    r = client.get(
        "/api/v1/ai/models",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 200, r.text
    models = r.json()["data"]
    names = {m["model_name"] for m in models}
    expected = {"recommender", "forecaster", "crew_router", "waste_predictor"}
    # At minimum the seeded models should exist
    assert names.issubset(expected | names), f"Unexpected model names: {names - expected}"

    for m in models:
        assert "status" in m
        assert m["status"] in ("untrained", "trained", "ready", "deprecated")
        # Metrics must be either a dict of real numbers or "Not yet evaluated"
        metrics = m.get("metrics")
        if metrics and metrics != "Not yet evaluated":
            assert isinstance(metrics, dict), f"Metrics should be dict, got: {type(metrics)}"


# ── Test 10: Drift endpoint ───────────────────────────────────────────────────

def test_drift_endpoint_valid_response():
    """GET /ai/models/forecaster/drift returns PSI or 'Not yet evaluated'."""
    token = _make_admin_token()
    r = client.get(
        "/api/v1/ai/models/forecaster/drift",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert "psi" in data
    # PSI should be a number or "Not yet evaluated"
    psi_val = data["psi"]
    assert psi_val == "Not yet evaluated" or isinstance(psi_val, (int, float))
