"""Phase 4 acceptance tests — REST APIs & WebSockets."""

import concurrent.futures
import uuid
import pytest
from fastapi.testclient import TestClient
from jose import jwt
from sqlalchemy import select, text

from app.main import app
from app.core.config import settings
from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models.flight import Flight, FlightSeat
from app.models.meal import FlightInventory, MealItem
from app.models.passenger import Passenger, PassengerProfile
from app.models.crew import CrewMember, CrewRole
from app.models.order import PassengerOrder, OrderStatus
from app.models.delivery import DeliveryTask

client = TestClient(app, raise_server_exceptions=True)


# ── Fixtures ─────────────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def setup_test_data():
    """Sets up a test flight, seats, crew, meals, and passengers in the database."""
    db = SessionLocal()

    # 1. Create Airline & Flight
    flight_id = uuid.uuid4()
    airline_id = uuid.uuid4()
    
    # We execute inserts directly so we don't depend on other routes
    db.execute(
        text("INSERT INTO airlines (id, name, code) VALUES (:id, 'Test Airline', 'TA') ON CONFLICT DO NOTHING"),
        {"id": airline_id}
    )
    db.execute(
        text("INSERT INTO flights (id, flight_number, airline_id, origin, destination, dep_time, arr_time, status) "
             "VALUES (:id, 'TA101', :airline_id, 'JFK', 'LHR', NOW(), NOW() + INTERVAL '8 hours', 'scheduled')"),
        {"id": flight_id, "airline_id": airline_id}
    )

    # 2. Create Crew Member
    crew_id = uuid.uuid4()
    db.execute(
        text("INSERT INTO crew_members (id, employee_id, name, role, airline_id, assigned_zone, hashed_password, email) "
             "VALUES (:id, 'EMP999', 'Crew Alice', 'cabin_crew', :airline_id, 'A', :pw, 'alice@test.com')"),
        {"id": crew_id, "airline_id": airline_id, "pw": hash_password("crew123")}
    )

    # 3. Create Passenger (Allergen testing)
    passenger_id = uuid.uuid4()
    db.execute(
        text("INSERT INTO passengers (id, pnr, first_name, last_name, email, hashed_password) "
             "VALUES (:id, 'PNR111', 'Bob', 'Allergy', 'bob@test.com', :pw)"),
        {"id": passenger_id, "pw": hash_password("pass123")}
    )
    db.execute(
        text("INSERT INTO passenger_profiles (id, passenger_id, dietary_flags, allergy_flags, cuisine_prefs, portion_pref, price_sensitivity) "
             "VALUES (:id, :passenger_id, '{}', '{\"nuts\": true}', '{}', 'medium', 'mid')"),
        {"id": uuid.uuid4(), "passenger_id": passenger_id}
    )

    # 4. Create another Passenger (Regular testing)
    normal_id = uuid.uuid4()
    db.execute(
        text("INSERT INTO passengers (id, pnr, first_name, last_name, email, hashed_password) "
             "VALUES (:id, 'PNR222', 'Charlie', 'Normal', 'charlie@test.com', :pw)"),
        {"id": normal_id, "pw": hash_password("pass123")}
    )
    db.execute(
        text("INSERT INTO passenger_profiles (id, passenger_id, dietary_flags, allergy_flags, cuisine_prefs, portion_pref, price_sensitivity) "
             "VALUES (:id, :passenger_id, '{}', '{\"nuts\": false}', '{}', 'medium', 'mid')"),
        {"id": uuid.uuid4(), "passenger_id": normal_id}
    )

    # 5. Create Meals
    meal_safe_id = uuid.uuid4()
    db.execute(
        text("INSERT INTO meal_items (id, meal_code, name, allergen_flags) "
             "VALUES (:id, 'MC_SAFE', 'Safe Rice', '{\"nuts\": false}')"),
        {"id": meal_safe_id}
    )

    meal_unsafe_id = uuid.uuid4()
    db.execute(
        text("INSERT INTO meal_items (id, meal_code, name, allergen_flags) "
             "VALUES (:id, 'MC_UNSAFE', 'Nutty Salad', '{\"nuts\": true}')"),
        {"id": meal_unsafe_id}
    )

    # 6. Create Seats
    seat_b = uuid.uuid4()
    db.execute(
        text("INSERT INTO flight_seats (id, flight_id, seat_number, cabin_class) VALUES (:id, :flight_id, '12A', 'business')"),
        {"id": seat_b, "flight_id": flight_id}
    )
    seat_e = uuid.uuid4()
    db.execute(
        text("INSERT INTO flight_seats (id, flight_id, seat_number, cabin_class) VALUES (:id, :flight_id, '34C', 'economy')"),
        {"id": seat_e, "flight_id": flight_id}
    )

    # 7. Create Inventory
    inv_safe_business = uuid.uuid4()
    db.execute(
        text("INSERT INTO flight_inventory (id, flight_id, meal_id, cabin_class, initial_qty, reserved_qty, served_qty, wasted_qty, restock_alert_qty) "
             "VALUES (:id, :flight_id, :meal_id, 'business', 10, 0, 0, 0, 2)"),
        {"id": inv_safe_business, "flight_id": flight_id, "meal_id": meal_safe_id}
    )
    inv_safe_economy = uuid.uuid4()
    db.execute(
        text("INSERT INTO flight_inventory (id, flight_id, meal_id, cabin_class, initial_qty, reserved_qty, served_qty, wasted_qty, restock_alert_qty) "
             "VALUES (:id, :flight_id, :meal_id, 'economy', 1, 0, 0, 0, 0)"),  # Only 1 available for race condition testing!
        {"id": inv_safe_economy, "flight_id": flight_id, "meal_id": meal_safe_id}
    )
    inv_unsafe_business = uuid.uuid4()
    db.execute(
        text("INSERT INTO flight_inventory (id, flight_id, meal_id, cabin_class, initial_qty, reserved_qty, served_qty, wasted_qty, restock_alert_qty) "
             "VALUES (:id, :flight_id, :meal_id, 'business', 5, 0, 0, 0, 1)"),
        {"id": inv_unsafe_business, "flight_id": flight_id, "meal_id": meal_unsafe_id}
    )

    db.commit()
    db.close()

    yield {
        "flight_id": flight_id,
        "passenger_id": passenger_id,
        "normal_id": normal_id,
        "meal_safe_id": meal_safe_id,
        "meal_unsafe_id": meal_unsafe_id,
        "crew_id": crew_id,
    }

    # Cleanup test data after tests finish
    db = SessionLocal()
    db.execute(text("DELETE FROM feedback"))
    db.execute(text("DELETE FROM delivery_tasks"))
    db.execute(text("DELETE FROM order_items"))
    db.execute(text("DELETE FROM passenger_orders"))
    db.execute(text("DELETE FROM flight_inventory"))
    db.execute(text("DELETE FROM flight_seats"))
    db.execute(text("DELETE FROM meal_items"))
    db.execute(text("DELETE FROM passenger_profiles"))
    db.execute(text("DELETE FROM passengers"))
    db.execute(text("DELETE FROM crew_members"))
    db.execute(text("DELETE FROM flights"))
    db.execute(text("DELETE FROM airlines"))
    db.commit()
    db.close()


@pytest.fixture
def passenger_token(setup_test_data):
    """Authenticate and get access token for allergic passenger Bob."""
    r = client.post("/auth/login", json={"email": "bob@test.com", "password": "pass123"})
    assert r.status_code == 200
    return r.json()["access_token"]


@pytest.fixture
def normal_token(setup_test_data):
    """Authenticate and get access token for regular passenger Charlie."""
    r = client.post("/auth/login", json={"email": "charlie@test.com", "password": "pass123"})
    assert r.status_code == 200
    return r.json()["access_token"]


@pytest.fixture
def crew_token(setup_test_data):
    """Authenticate and get access token for Crew Alice."""
    r = client.post("/auth/login", json={"email": "alice@test.com", "password": "crew123"})
    assert r.status_code == 200
    return r.json()["access_token"]


# ── Tests ────────────────────────────────────────────────────────────────────

def test_passenger_profile_crud(passenger_token):
    # GET profile
    r = client.get("/api/v1/passengers/profile", headers={"Authorization": f"Bearer {passenger_token}"})
    assert r.status_code == 200
    data = r.json()["data"]
    assert data["allergy_flags"]["nuts"] is True

    # PUT profile
    r = client.put(
        "/api/v1/passengers/profile",
        json={"portion_pref": "large", "price_sensitivity": "premium"},
        headers={"Authorization": f"Bearer {passenger_token}"},
    )
    assert r.status_code == 200
    assert r.json()["data"]["portion_pref"] == "large"
    assert r.json()["data"]["price_sensitivity"] == "premium"


def test_allergen_gate_enforcement(passenger_token, normal_token, setup_test_data):
    # Bob (allergic to nuts) tries to order MC_UNSAFE (contains nuts)
    payload = {
        "flight_id": str(setup_test_data["flight_id"]),
        "seat_number": "12A",
        "cabin_class": "business",
        "items": [{"meal_id": str(setup_test_data["meal_unsafe_id"]), "qty": 1}],
    }
    r = client.post(
        "/api/v1/orders",
        json=payload,
        headers={"Authorization": f"Bearer {passenger_token}"},
    )
    # Allergen gate must block order placement with a 409 Conflict
    assert r.status_code == 409, r.text
    assert "Allergen conflict" in r.json()["error"]["message"]

    # Charlie (not allergic to nuts) can order it successfully
    r = client.post(
        "/api/v1/orders",
        json=payload,
        headers={"Authorization": f"Bearer {normal_token}"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["data"]["status"] == "received"


def test_meal_allergen_check_endpoint(passenger_token, setup_test_data):
    # Bob checks Safe Rice
    r = client.get(
        f"/api/v1/meals/{setup_test_data['meal_safe_id']}/allergen-check",
        headers={"Authorization": f"Bearer {passenger_token}"},
    )
    assert r.status_code == 200
    assert r.json()["data"]["is_safe"] is True

    # Bob checks Nutty Salad
    r = client.get(
        f"/api/v1/meals/{setup_test_data['meal_unsafe_id']}/allergen-check",
        headers={"Authorization": f"Bearer {passenger_token}"},
    )
    assert r.status_code == 200
    assert r.json()["data"]["is_safe"] is False
    assert "nuts" in r.json()["data"]["conflicting_allergens"]


def test_qr_flow_resolution_and_guest_ordering(setup_test_data):
    # 1. Simulate signing a QR code seat token for flight at seat 34C (Economy)
    payload = {
        "type": "qr_code",
        "flight_id": str(setup_test_data["flight_id"]),
        "seat_number": "34C",
        "cabin_class": "economy",
    }
    qr_token = jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)

    # 2. Resolve the QR token
    r = client.get(f"/api/v1/qr/resolve?code={qr_token}")
    assert r.status_code == 200, r.text
    res = r.json()["data"]
    assert res["seat_number"] == "34C"
    assert res["cabin_class"] == "economy"
    guest_token = res["token"]

    # 3. Use the guest token to browse menu
    r = client.get(
        f"/api/v1/flights/{setup_test_data['flight_id']}/menu?cabin_class=economy",
        headers={"Authorization": f"Bearer {guest_token}"},
    )
    assert r.status_code == 200
    assert len(r.json()["data"]) > 0

    # 4. Place order as guest
    order_payload = {
        "flight_id": str(setup_test_data["flight_id"]),
        "seat_number": "34C",
        "cabin_class": "economy",
        "items": [{"meal_id": str(setup_test_data["meal_safe_id"]), "qty": 1}],
    }
    r = client.post(
        "/api/v1/orders",
        json=order_payload,
        headers={"Authorization": f"Bearer {guest_token}"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["data"]["cabin_class"] == "economy"


def test_crew_dashboard_and_task_prioritization(crew_token, normal_token, setup_test_data):
    # Place standard economy order
    client.post(
        "/api/v1/orders",
        json={
            "flight_id": str(setup_test_data["flight_id"]),
            "seat_number": "34C",
            "cabin_class": "economy",
            "items": [{"meal_id": str(setup_test_data["meal_safe_id"]), "qty": 1}],
        },
        headers={"Authorization": f"Bearer {normal_token}"},
    )

    # Place high priority business order
    client.post(
        "/api/v1/orders",
        json={
            "flight_id": str(setup_test_data["flight_id"]),
            "seat_number": "12A",
            "cabin_class": "business",
            "items": [{"meal_id": str(setup_test_data["meal_safe_id"]), "qty": 1}],
        },
        headers={"Authorization": f"Bearer {normal_token}"},
    )

    # Fetch crew dashboard
    r = client.get("/api/v1/crew/dashboard", headers={"Authorization": f"Bearer {crew_token}"})
    assert r.status_code == 200
    tasks = r.json()["data"]
    
    # Assert business order (higher priority = 5.0) appears before economy order (priority = 1.0)
    assert len(tasks) >= 2
    priorities = [t["priority_score"] for t in tasks]
    assert priorities == sorted(priorities, reverse=True)


def test_websocket_order_status_dispatch(normal_token, setup_test_data, crew_token):
    # 1. Connect to websocket in-process
    # Setup WS connection for passenger (normal_token)
    ws_client = TestClient(app)
    with ws_client.websocket_connect(f"/ws?token={normal_token}") as websocket:
        # Place order
        order_payload = {
            "flight_id": str(setup_test_data["flight_id"]),
            "seat_number": "12A",
            "cabin_class": "business",
            "items": [{"meal_id": str(setup_test_data["meal_safe_id"]), "qty": 1}],
        }
        r = client.post(
            "/api/v1/orders",
            json=order_payload,
            headers={"Authorization": f"Bearer {normal_token}"},
        )
        assert r.status_code == 200
        order_id = r.json()["data"]["id"]

        # WebSocket must receive initial ORDER_STATUS_UPDATE on creation
        ws_msg = websocket.receive_json()
        assert ws_msg["event"] == "ORDER_STATUS_UPDATE"
        assert ws_msg["data"]["id"] == order_id
        assert ws_msg["data"]["status"] == "received"

        # 2. Update status from crew endpoint
        # Get crew dashboard task ID
        dash_r = client.get("/api/v1/crew/dashboard", headers={"Authorization": f"Bearer {crew_token}"})
        task = next(t for t in dash_r.json()["data"] if t["order_id"] == order_id)
        
        # Crew marks task as confirmed, then preparing, then en_route
        # Step 1: confirmed
        r_update = client.put(
            f"/api/v1/tasks/{task['id']}/status",
            json={"status": "confirmed"},
            headers={"Authorization": f"Bearer {crew_token}"},
        )
        assert r_update.status_code == 200
        ws_msg_confirmed = websocket.receive_json()
        assert ws_msg_confirmed["event"] == "ORDER_STATUS_UPDATE"
        assert ws_msg_confirmed["data"]["status"] == "confirmed"

        # Step 2: preparing
        r_update = client.put(
            f"/api/v1/tasks/{task['id']}/status",
            json={"status": "preparing"},
            headers={"Authorization": f"Bearer {crew_token}"},
        )
        assert r_update.status_code == 200
        ws_msg_preparing = websocket.receive_json()
        assert ws_msg_preparing["event"] == "ORDER_STATUS_UPDATE"
        assert ws_msg_preparing["data"]["status"] == "preparing"

        # Step 3: en_route
        r_update = client.put(
            f"/api/v1/tasks/{task['id']}/status",
            json={"status": "en_route"},
            headers={"Authorization": f"Bearer {crew_token}"},
        )
        assert r_update.status_code == 200
        ws_msg_en_route = websocket.receive_json()
        assert ws_msg_en_route["event"] == "ORDER_STATUS_UPDATE"
        assert ws_msg_en_route["data"]["status"] == "en_route"


def test_concurrent_inventory_race_condition(setup_test_data):
    """
    Test concurrency: Spawns multiple threads trying to claim the last
    remaining stock unit. Exactly one should succeed, others return 409.
    """
    db = SessionLocal()
    # Reset inventory of Safe Rice in Economy to exactly 1
    db.execute(
        text("UPDATE flight_inventory SET initial_qty = 1, reserved_qty = 0, served_qty = 0 "
             "WHERE flight_id = :fid AND meal_id = :mid AND cabin_class = 'economy'"),
        {"fid": setup_test_data["flight_id"], "mid": setup_test_data["meal_safe_id"]}
    )
    db.commit()
    db.close()

    # Login 5 different passengers (or simulate requests)
    # We will generate tokens for passengers
    tokens = []
    db = SessionLocal()
    for i in range(5):
        pid = uuid.uuid4()
        email = f"concurrent_{i}@test.com"
        db.execute(
            text("INSERT INTO passengers (id, pnr, first_name, last_name, email, hashed_password) "
                 "VALUES (:id, :pnr, 'Conc', 'Pass', :email, 'hash')"),
            {"id": pid, "pnr": f"PNRC{i}", "email": email}
        )
        db.execute(
            text("INSERT INTO passenger_profiles (id, passenger_id, dietary_flags, allergy_flags, cuisine_prefs, portion_pref, price_sensitivity) "
                 "VALUES (:id, :passenger_id, '{}', '{}', '{}', 'medium', 'mid')"),
            {"id": uuid.uuid4(), "passenger_id": pid}
        )
        tokens.append(jwt.encode({"sub": str(pid), "email": email, "role": "passenger", "type": "access"}, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM))
    db.commit()
    db.close()

    order_payload = {
        "flight_id": str(setup_test_data["flight_id"]),
        "seat_number": "34C",
        "cabin_class": "economy",
        "items": [{"meal_id": str(setup_test_data["meal_safe_id"]), "qty": 1}],
    }

    def place_order_request(token):
        return client.post(
            "/api/v1/orders",
            json=order_payload,
            headers={"Authorization": f"Bearer {token}"},
        )

    # Dispatch requests in parallel
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
        responses = list(executor.map(place_order_request, tokens))

    # Assert exactly 1 response has HTTP 200, and 4 responses have HTTP 409
    success_count = sum(1 for r in responses if r.status_code == 200)
    conflict_count = sum(1 for r in responses if r.status_code == 409)

    assert success_count == 1, f"Expected 1 successful order, got {success_count}. Responses: {[r.status_code for r in responses]}"
    assert conflict_count == 4, f"Expected 4 conflict orders, got {conflict_count}. Responses: {[r.status_code for r in responses]}"

    # Clean up generated passenger accounts
    db = SessionLocal()
    db.execute(text("DELETE FROM passenger_profiles WHERE passenger_id IN (SELECT id FROM passengers WHERE email LIKE 'concurrent_%')"))
    db.execute(text("DELETE FROM passengers WHERE email LIKE 'concurrent_%'"))
    db.commit()
    db.close()
