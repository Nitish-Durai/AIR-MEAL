"""Synthetic data generator for AirMeal.

Entry point: generate(db, n_flights, n_passengers, n_meals, seed, reset)

Design goals
------------
- Idempotent + seeded: same seed → same data content every run.
- Realistic distributions: nationality↔cuisine correlation, right-skewed ratings,
  Gamma-distributed load factors, epsilon-greedy preference noise (80/20).
- 32-dim embeddings derived from item/passenger attributes (not random vectors).
- No FK / CHECK constraint violations guaranteed before commit.
- All metrics start NULL in model_registry — never seeded with target values.
"""

from __future__ import annotations

import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import numpy as np
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.airline import Airline
from app.models.crew import CrewMember, CrewRole
from app.models.delivery import DeliveryTask, DeliveryStatus
from app.models.feedback import Feedback
from app.models.flight import Flight, FlightSeat, FlightStatus
from app.models.booking import Booking
from app.models.meal import FlightInventory, MealCategory, MealItem
from app.models.ml import ModelRegistry
from app.models.order import OrderItem, OrderStatus, PassengerOrder
from app.models.passenger import Passenger, PassengerProfile

from .catalog import (
    AIRLINES, AIRPORTS, AIRPORT_COUNTRY, AIRCRAFT_CONFIGS, AIRCRAFT_WEIGHTS,
    ALLERGEN_KEYS, CREW_FIRST, CREW_LAST, CUISINE_KEYS,
    DIETARY_KEYS, FEEDBACK_TAGS, FFP_TIERS, FFP_WEIGHTS,
    FIRST_NAMES, LAST_NAMES, MEAL_CATALOG,
    NATIONALITY_CONFIG, NATIONALITY_DIETARY, ALLERGY_PREVALENCE,
    PORTION_PREFS, PORTION_WEIGHTS, PRICE_LEVELS, PRICE_WEIGHTS,
)
from app.ml.data_gen.meal_images import MEAL_IMAGES

EMBEDDING_DIM = 32

# ── Shared synthetic password (all demo passengers/crew use the same) ─────────
# Computed once; argon2 is intentionally slow — reuse the hash string.
_DEMO_HASH: str | None = None
_CREW_HASH: str | None = None
_ADMIN_HASH: str | None = None
_OWNER_HASH: str | None = None

# ---------------------------------------------------------------------------
# Reference epoch for all generated timestamps.
#
# Flight departure/arrival times — and therefore flight STATUS, which is derived
# from them — were previously computed relative to datetime.now(). That made the
# dataset depend on when the generator ran: a flight near a status boundary would
# be "in_flight" on one run and "landed" on the next, which silently changed
# wasted_qty (only landed flights accrue waste) and every time-derived forecaster
# feature. Row counts stayed identical while target values moved, so the two
# LightGBM models were not reproducible across reseeds despite a fixed RNG seed.
#
# Anchoring to a fixed epoch makes the generated dataset a pure function of the
# seed. Override with AIRMEAL_DATA_EPOCH (ISO-8601) only if wall-clock behaviour
# is explicitly wanted.
# ---------------------------------------------------------------------------

_DEFAULT_EPOCH = datetime(2026, 7, 1, 12, 0, 0, tzinfo=timezone.utc)


def _reference_now() -> datetime:
    """Fixed reference time for generated data (see note above)."""
    raw = os.environ.get("AIRMEAL_DATA_EPOCH")
    if raw:
        parsed = datetime.fromisoformat(raw)
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    return _DEFAULT_EPOCH


def _get_demo_hash() -> str:
    global _DEMO_HASH
    if _DEMO_HASH is None:
        print("  Hashing demo passenger password (once)…")
        _DEMO_HASH = hash_password("airmeal123")
    return _DEMO_HASH


def _get_owner_hash() -> str:
    """Password hash for the pinned demo booking owner account."""
    global _OWNER_HASH
    if _OWNER_HASH is None:
        print("  Hashing demo owner password (once)…")
        _OWNER_HASH = hash_password("nitish@2005")
    return _OWNER_HASH


def _get_crew_hash() -> str:
    global _CREW_HASH
    if _CREW_HASH is None:
        print("  Hashing demo crew password (once)…")
        _CREW_HASH = hash_password("crew123")
    return _CREW_HASH


def _get_admin_hash() -> str:
    global _ADMIN_HASH
    if _ADMIN_HASH is None:
        print("  Hashing demo admin password (once)…")
        _ADMIN_HASH = hash_password("admin123")
    return _ADMIN_HASH


# ── Reproducible UUID from the seeded RNG ────────────────────────────────────
def _uid(rng: np.random.Generator) -> uuid.UUID:
    raw = bytearray(rng.integers(0, 256, size=16, dtype=np.uint8).tobytes())
    raw[6] = (raw[6] & 0x0F) | 0x40  # version 4
    raw[8] = (raw[8] & 0x3F) | 0x80  # RFC 4122 variant
    return uuid.UUID(bytes=bytes(raw))


# ── Embedding helpers ─────────────────────────────────────────────────────────
def _l2_normalize(v: np.ndarray) -> np.ndarray:
    n = np.linalg.norm(v)
    return v / n if n > 0 else v


def _meal_embedding(meal: dict, cat_idx: int, rng: np.random.Generator) -> list[float]:
    """32-dim vector. Layout aligned with _passenger_embedding for meaningful cosine.

    Dims 0-7   : cuisine one-hot, weighted (preference-dominant signal)
    Dims 8-14  : dietary flags (positive match with passenger dietary prefs)
    Dim  15    : normalised calories (cap 1000 kcal)
    Dims 16-31 : zero (allergens are a HARD FILTER, not a similarity signal; excluded)
    """
    CUISINE_WEIGHT = 2.0
    v = np.zeros(EMBEDDING_DIM)
    # Dims 0-7: cuisine one-hot (weighted)
    cuisine_idx = CUISINE_KEYS.index(meal["cuisine"]) if meal["cuisine"] in CUISINE_KEYS else 0
    v[cuisine_idx] = CUISINE_WEIGHT
    # Dims 8-14: dietary flags (7 keys)
    for i, k in enumerate(DIETARY_KEYS):
        v[8 + i] = 1.0 if meal["dietary"].get(k) else 0.0
    # Dim 15: normalised calories
    v[15] = min(meal["calories"] / 1000.0, 1.0)
    # Dims 16-31 intentionally left zero (no allergen/noise pollution in similarity space)
    return _l2_normalize(v).tolist()


def _passenger_embedding(
    cuisine_prefs: dict,
    dietary_flags: dict,
    allergy_flags: dict,
    price_sensitivity: str,
    portion_pref: str,
    ffp_tier: str,
    rng: np.random.Generator,
) -> list[float]:
    """32-dim preference vector. Layout IDENTICAL to _meal_embedding.

    Dims 0-7   : cuisine preference scores, weighted (same weight as meal)
    Dims 8-14  : dietary preferences (positive match with meal dietary flags)
    Dim  15    : portion proxy for calorie alignment (large prefers higher-cal)
    Dims 16-31 : zero (allergies handled by hard filter, excluded from similarity)

    Note: allergy_flags, price_sensitivity, ffp_tier are retained as parameters for
    compatibility but no longer enter the similarity space.
    """
    CUISINE_WEIGHT = 2.0
    v = np.zeros(EMBEDDING_DIM)
    # Dims 0-7: cuisine preference scores (weighted, same scale as meal one-hot)
    for i, k in enumerate(CUISINE_KEYS):
        v[i] = CUISINE_WEIGHT * float(cuisine_prefs.get(k, 0.0))
    # Dims 8-14: dietary prefs (7 keys)
    for i, k in enumerate(DIETARY_KEYS):
        v[8 + i] = 1.0 if dietary_flags.get(k) else 0.0
    # Dim 15: portion preference as a calorie-alignment proxy (small=0.2, medium=0.5, large=0.8)
    v[15] = {"small": 0.2, "medium": 0.5, "large": 0.8}.get(portion_pref, 0.5)
    # Dims 16-31 intentionally left zero
    return _l2_normalize(v).tolist()


# ── Rating distribution (right-skewed, mean ≈ 3.8, range 1–5) ────────────────
def _rating(rng: np.random.Generator) -> int:
    return max(1, min(5, int(round(rng.beta(7, 3) * 4 + 1))))


# ── Truncate all tables (--reset) ─────────────────────────────────────────────
_TABLES = (
    "bookings,feedback,delivery_tasks,order_items,passenger_orders,"
    "flight_inventory,flight_seats,flights,passenger_profiles,"
    "passengers,crew_members,meal_items,meal_categories,"
    "model_registry,airlines"
)


def _truncate_all(db: Session) -> None:
    db.execute(text(f"TRUNCATE {_TABLES} RESTART IDENTITY CASCADE"))
    db.flush()
    print("  All tables truncated.")


# ── Individual table generators ───────────────────────────────────────────────

def _gen_airlines(db: Session, rng: np.random.Generator) -> list[Airline]:
    rows = [Airline(id=_uid(rng), name=a["name"], code=a["code"]) for a in AIRLINES]
    db.add_all(rows)
    db.flush()
    return rows


def _gen_meal_categories(db: Session, rng: np.random.Generator) -> list[MealCategory]:
    names = ["Starters", "Main Course", "Desserts", "Beverages", "Snacks"]
    rows = [MealCategory(id=_uid(rng), name=n) for n in names]
    db.add_all(rows)
    db.flush()
    return rows


def _gen_meals(
    db: Session,
    rng: np.random.Generator,
    categories: list[MealCategory],
    n_meals: int,
) -> list[MealItem]:
    cat_map = {c.name: c for c in categories}
    # Use the first n_meals from the catalog (catalog is ordered by category)
    subset = MEAL_CATALOG[:n_meals]
    rows: list[MealItem] = []
    cat_counter: dict[str, int] = {}  # category → counter for cat_idx
    for entry in subset:
        cat_name = entry["category"]
        cat_obj = cat_map[cat_name]
        cat_idx = cat_counter.get(cat_name, 0)
        cat_counter[cat_name] = cat_idx + 1
        meal_id = _uid(rng)
        rows.append(MealItem(
            id=meal_id,
            meal_code=entry["code"],
            category_id=cat_obj.id,
            name=entry["name"],
            cuisine_type=entry["cuisine"],
            ingredients=entry["ingredients"],
            allergen_flags=entry["allergens"],
            dietary_flags=entry["dietary"],
            calories=entry["calories"],
            image_url=MEAL_IMAGES.get(entry["code"]),
            meal_embedding=_meal_embedding(entry, cat_idx, rng),
            is_alcohol=entry.get("alcohol", False),
        ))
    db.add_all(rows)
    db.flush()
    return rows


def _gen_crew(
    db: Session,
    rng: np.random.Generator,
    airlines: list[Airline],
) -> list[CrewMember]:
    crew_hash = _get_crew_hash()
    # 5 crew per airline = 15 total
    crew_roles = [
        CrewRole.purser,
        CrewRole.senior_cabin_crew,
        CrewRole.cabin_crew,
        CrewRole.cabin_crew,
        CrewRole.cabin_crew,
    ]
    zones = ["A", "B", "C"]
    rows: list[CrewMember] = []
    admin_hash = _get_admin_hash()
    emp_counter = 1
    for airline in airlines:
        for i, role in enumerate(crew_roles):
            fn = rng.choice(CREW_FIRST)
            ln = rng.choice(CREW_LAST)
            is_admin = emp_counter == 1
            rows.append(CrewMember(
                id=_uid(rng),
                employee_id=f"EMP{emp_counter:04d}",
                name=f"{fn} {ln}",
                role="admin" if is_admin else role,
                airline_id=airline.id,
                assigned_zone=zones[i % len(zones)],
                hashed_password=admin_hash if is_admin else crew_hash,
                email=(
                    "admin@airmeal.demo" if is_admin
                    else f"crew{emp_counter}@airmeal.demo"
                ),
            ))
            emp_counter += 1
    db.add_all(rows)
    db.flush()
    return rows


def _gen_passengers(
    db: Session,
    rng: np.random.Generator,
    n_passengers: int,
) -> tuple[list[Passenger], dict]:
    demo_hash = _get_demo_hash()
    nat_names = list(NATIONALITY_CONFIG.keys())
    nat_weights = np.array([NATIONALITY_CONFIG[n]["weight"] for n in nat_names])
    nat_weights /= nat_weights.sum()

    passengers: list[Passenger] = []
    profiles: list[PassengerProfile] = []
    # Keyed by passenger id — used by order gen to avoid lazy-loading .profile
    allergy_flags_by_id: dict = {}
    seen_emails: set[str] = set()
    pnr_counter = 1

    for idx in range(n_passengers):
        # Nationality-based attributes
        nationality = rng.choice(nat_names, p=nat_weights)
        nat_cfg = NATIONALITY_CONFIG[nationality]
        nat_diet = NATIONALITY_DIETARY.get(nationality, {})

        fn = rng.choice(FIRST_NAMES)
        ln = rng.choice(LAST_NAMES)

        # Unique email
        base = f"{fn.lower()}.{ln.lower()}"
        email = f"{base}{idx}@airmeal.demo"
        while email in seen_emails:
            email = f"{base}{idx}_{rng.integers(1000)}@airmeal.demo"
        seen_emails.add(email)

        ffp_tier = rng.choice(FFP_TIERS, p=FFP_WEIGHTS)
        pid = _uid(rng)
        is_medical = rng.random() < 0.02
        has_infant = rng.random() < 0.04
        is_connecting = rng.random() < 0.15
        p = Passenger(
            id=pid,
            pnr=f"PNR{pnr_counter:06d}",
            first_name=fn,
            last_name=ln,
            nationality=nationality,
            email=email,
            hashed_password=demo_hash,
            ffp_tier=ffp_tier,
            is_medical=is_medical,
            has_infant=has_infant,
            is_connecting=is_connecting,
        )
        passengers.append(p)
        pnr_counter += 1

        # ── Dietary flags ─────────────────────────────────────────────────────
        dietary_flags: dict[str, bool] = {}
        for flag in DIETARY_KEYS:
            prob = nat_diet.get(flag, 0.0)
            dietary_flags[flag] = bool(rng.random() < prob)
        # Vegan implies vegetarian
        if dietary_flags.get("vegan"):
            dietary_flags["vegetarian"] = True

        # ── Allergy flags ─────────────────────────────────────────────────────
        allergy_flags: dict[str, bool] = {}
        for allergen, prob in ALLERGY_PREVALENCE.items():
            allergy_flags[allergen] = bool(rng.random() < prob)

        # ── Cuisine preferences with epsilon-greedy noise ─────────────────────
        # 80% of prefs from nationality base; 20% random exploration
        base_prefs = nat_cfg["cuisine_prefs"]
        cuisine_prefs: dict[str, float] = {}
        for cuisine in CUISINE_KEYS:
            base_score = base_prefs.get(cuisine, 0.0)
            if rng.random() < 0.20:  # 20% exploration
                cuisine_prefs[cuisine] = float(rng.random())
            else:
                # Add small noise to base score
                noise = float(rng.normal(0, 0.05))
                cuisine_prefs[cuisine] = float(np.clip(base_score + noise, 0.0, 1.0))

        portion_pref = rng.choice(PORTION_PREFS, p=PORTION_WEIGHTS)
        price_sensitivity = rng.choice(PRICE_LEVELS, p=PRICE_WEIGHTS)

        embedding = _passenger_embedding(
            cuisine_prefs, dietary_flags, allergy_flags,
            price_sensitivity, portion_pref, ffp_tier, rng,
        )

        profiles.append(PassengerProfile(
            id=_uid(rng),
            passenger_id=pid,
            dietary_flags=dietary_flags,
            allergy_flags=allergy_flags,
            cuisine_prefs=cuisine_prefs,
            portion_pref=portion_pref,
            price_sensitivity=price_sensitivity,
            preference_embedding=embedding,
        ))
        allergy_flags_by_id[pid] = allergy_flags

        # Flush in batches to avoid huge pending state
        if (idx + 1) % 500 == 0:
            db.add_all(passengers[-500:])
            db.add_all(profiles[-500:])
            db.flush()
            print(f"    {idx + 1}/{n_passengers} passengers flushed…")

    # Flush remainder
    remainder = len(passengers) % 500
    if remainder:
        db.add_all(passengers[-remainder:])
        db.add_all(profiles[-remainder:])
        db.flush()

    return passengers, allergy_flags_by_id


def _gen_flights_and_seats(
    db: Session,
    rng: np.random.Generator,
    airlines: list[Airline],
    n_flights: int,
) -> tuple[list[Flight], dict[tuple, int]]:
    """Returns (flights, {(flight_id, cabin_class): seat_count})."""
    aircraft_names = list(AIRCRAFT_CONFIGS.keys())
    now = _reference_now()
    flights: list[Flight] = []
    seats: list[FlightSeat] = []
    seat_counts: dict[tuple, int] = {}  # (flight_id, cabin_class) -> n_seats

    for i in range(n_flights):
        airline = airlines[i % len(airlines)]
        aircraft = rng.choice(aircraft_names, p=AIRCRAFT_WEIGHTS)
        config = AIRCRAFT_CONFIGS[aircraft]

        # Origin / destination — no same-airport routes
        origin, dest = rng.choice(AIRPORTS, size=2, replace=False)

        duration_h = float(rng.uniform(2, 12))
        _roll = rng.random()
        if _roll < 0.35:
            # In-flight NOW: departed partway through its duration, arrives in the future.
            elapsed = rng.uniform(0.2, 0.8) * duration_h  # fraction already flown
            dep_time = now - timedelta(hours=elapsed)
            arr_time = dep_time + timedelta(hours=duration_h)
        elif _roll < 0.55:
            # Boarding / scheduled soon: departs in the next 1–24 h.
            dep_time = now + timedelta(hours=float(rng.uniform(1, 24)))
            arr_time = dep_time + timedelta(hours=duration_h)
        elif _roll < 0.75:
            # Scheduled further out: departs 1–20 days from now.
            dep_time = now + timedelta(hours=float(rng.uniform(24, 20 * 24)))
            arr_time = dep_time + timedelta(hours=duration_h)
        else:
            # Landed: arrived in the past 1–20 days.
            arr_time = now - timedelta(hours=float(rng.uniform(1, 20 * 24)))
            dep_time = arr_time - timedelta(hours=duration_h)

        # Load factor ~ Gamma(α=5, scale=0.06) + 0.55 → realistic airline range
        load_factor = float(np.clip(rng.gamma(5, 0.06) + 0.55, 0.30, 1.00))

        # Status derived from timing
        if dep_time > now + timedelta(hours=24):
            status = FlightStatus.scheduled.value
        elif dep_time > now:
            status = FlightStatus.boarding.value
        elif arr_time > now:
            status = FlightStatus.in_flight.value
        else:
            status = FlightStatus.landed.value

        fid = _uid(rng)

        # ── Pinned demo anchor: SV209 (airline "SV", i==9) ─────────────────────
        # All RNG rolls above still executed (so other flights are unaffected),
        # but we override SV209's values to a STABLE in-flight KUL→DOH anchor so
        # the runbook URLs/ID stay valid across every reseed.
        if airline.code == "SV" and i == 9:
            import uuid as _uuidmod
            fid = _uuidmod.UUID("b159aea5-2cf0-4e54-a8b2-183078d41915")
            origin, dest = "KUL", "DOH"
            aircraft = "B777-300ER" if "B777-300ER" in AIRCRAFT_CONFIGS else aircraft
            duration_h = 8.0
            dep_time = now - timedelta(hours=3.0)          # departed 3h ago
            arr_time = dep_time + timedelta(hours=duration_h)  # arrives in ~5h → in_flight
            status = FlightStatus.in_flight.value
            load_factor = 0.82

        flights.append(Flight(
            id=fid,
            flight_number=f"{airline.code}{200 + i}",
            airline_id=airline.id,
            origin=origin,
            destination=dest,
            dep_time=dep_time,
            arr_time=arr_time,
            aircraft_type=aircraft,
            load_factor=load_factor,
            status=status,
        ))

        # Generate seats
        row_map = {"first": "F", "business": "J", "premium_economy": "W", "economy": "Y"}
        col_map = {"first": list("ABCD"), "business": list("ABCD"),
                   "premium_economy": list("ABCDE"), "economy": list("ABCDEF")}
        for cabin_class, n_seats in config.items():
            if n_seats == 0:
                continue
            seat_counts[(fid, cabin_class)] = n_seats
            n_cols = len(col_map[cabin_class])
            n_rows = (n_seats + n_cols - 1) // n_cols
            row_prefix = row_map[cabin_class]
            generated = 0
            for row in range(1, n_rows + 1):
                for col in col_map[cabin_class]:
                    if generated >= n_seats:
                        break
                    seats.append(FlightSeat(
                        id=_uid(rng),
                        flight_id=fid,
                        seat_number=f"{row_prefix}{row}{col}",
                        cabin_class=cabin_class,
                    ))
                    generated += 1

    db.add_all(flights)
    db.flush()
    # Flush seats in chunks
    chunk = 1000
    for i in range(0, len(seats), chunk):
        db.add_all(seats[i:i + chunk])
        db.flush()
    return flights, seat_counts


def _gen_inventory(
    db: Session,
    rng: np.random.Generator,
    flights: list[Flight],
    meals: list[MealItem],
    seat_counts: dict[tuple, int],
) -> dict[tuple, FlightInventory]:
    """Stock a random subset of meals per flight×cabin. Returns lookup dict."""
    inv_map: dict[tuple, FlightInventory] = {}  # (flight_id, meal_id, cabin_class)
    rows: list[FlightInventory] = []

    # How many distinct meals per cabin (realistic subset of catalog)
    n_stocked = {"economy": 34, "premium_economy": 32, "business": 30, "first": 28}
    # ── Demand-proportional stocking ──────────────────────────────────────
    # Loading a flat quantity per meal regardless of passenger count produces
    # implausible over-catering: nearly every meal ends the flight with surplus,
    # so any waste-reduction figure becomes an artefact of the loading policy
    # rather than a property of the system. Real caterers uplift against a
    # forecast passenger load plus a service-level margin that guards against
    # stock-outs.
    #
    # Expected demand per cabin = seats x load_factor x order rate x mean items
    # per order. That budget is spread across the stocked meals and scaled by
    # OVERCATER_MARGIN, which is a calibration parameter tuned so the realised
    # waste fraction falls within the range reported in published cabin-waste
    # audits. The tuned value is reported in the paper.
    ORDER_RATE_ASSUMED = 0.70    # mirrors ORDER_RATE in _gen_orders_tasks_feedback
    MEAN_ITEMS_PER_ORDER = 1.5   # ITEMS_PER_ORDER is uniform on (1, 2)
    OVERCATER_MARGIN = 1.25      # calibration knob — see note above
    MIN_QTY_PER_MEAL = 2         # never stock a meal at zero

    # Indices of non-alcohol and all meals, for pool selection
    alcohol_mask = [bool(getattr(m, "is_alcohol", False)) for m in meals]
    alcohol_idxs = [i for i, a in enumerate(alcohol_mask) if a]
    non_alcohol_idxs = [i for i, a in enumerate(alcohol_mask) if not a]
    # Group NON-ALCOHOL meal indices by category (so every category is represented).
    from collections import defaultdict
    cat_to_idxs = defaultdict(list)
    for i in non_alcohol_idxs:
        cat_to_idxs[getattr(meals[i], "category_id", None)].append(i)
    PER_CAT_MIN = 5  # guarantee at least this many per category per cabin (if available)
    for flight in flights:
        intl = AIRPORT_COUNTRY.get(flight.origin) != AIRPORT_COUNTRY.get(flight.destination)
        for cabin_class in ["economy", "premium_economy", "business", "first"]:
            n_seats = seat_counts.get((flight.id, cabin_class), 0)
            if n_seats == 0:
                continue
            target = n_stocked[cabin_class]
            chosen = set()
            # 1) On international flights, always include all alcohol.
            if intl:
                chosen.update(alcohol_idxs)
            # 2) Guarantee a minimum from each non-alcohol category.
            for cat, idxs in cat_to_idxs.items():
                take = min(PER_CAT_MIN, len(idxs))
                if take > 0:
                    pick = rng.choice(idxs, size=take, replace=False)
                    chosen.update(int(x) for x in pick)
            # 3) Fill any remaining slots with random non-alcohol meals.
            remaining = target - len(chosen)
            if remaining > 0:
                pool = [i for i in non_alcohol_idxs if i not in chosen]
                if pool:
                    fill = rng.choice(pool, size=min(remaining, len(pool)), replace=False)
                    chosen.update(int(x) for x in fill)
            chosen_idxs = list(chosen)
            # Uplift against forecast demand for THIS cabin on THIS flight,
            # spread across the meals actually stocked, plus the margin.
            _expected_items = (
                n_seats
                * (flight.load_factor or 0.8)
                * ORDER_RATE_ASSUMED
                * MEAN_ITEMS_PER_ORDER
            )
            _per_meal = (_expected_items * OVERCATER_MARGIN) / max(1, len(chosen_idxs))
            qty = max(MIN_QTY_PER_MEAL, int(np.ceil(_per_meal)))
            for idx in chosen_idxs:
                meal = meals[int(idx)]
                inv = FlightInventory(
                    id=_uid(rng),
                    flight_id=flight.id,
                    meal_id=meal.id,
                    cabin_class=cabin_class,
                    initial_qty=qty,
                    reserved_qty=0,
                    served_qty=0,
                    wasted_qty=0,
                    restock_alert_qty=max(3, qty // 4),
                )
                rows.append(inv)
                inv_map[(flight.id, meal.id, cabin_class)] = inv

    chunk = 500
    for i in range(0, len(rows), chunk):
        db.add_all(rows[i:i + chunk])
        db.flush()

    return inv_map


def _gen_orders_tasks_feedback(
    db: Session,
    rng: np.random.Generator,
    flights: list[Flight],
    passengers: list[Passenger],
    allergy_flags_by_id: dict,
    meals: list[MealItem],
    crew: list[CrewMember],
    inv_map: dict[tuple, FlightInventory],
    seat_counts: dict[tuple, int],
) -> dict[str, int]:
    """Generate orders, items, delivery tasks, and feedback. Returns row counts."""
    def _seat_row(seat: str) -> int:
        # seat like "Y32C" / "W4A" / "J2B" -> 32 / 4 / 2
        digits = "".join(ch for ch in seat if ch.isdigit())
        return int(digits) if digits else 0

    ORDER_RATE = 0.70          # fraction of assigned passengers who place an order
    ITEMS_PER_ORDER = (1, 2)   # uniform range
    FEEDBACK_RATE = 0.80       # fraction of delivered orders that have feedback

    # Pre-build lookup: stocked meal IDs per (flight_id, cabin_class)
    stocked: dict[tuple, list[MealItem]] = {}
    meal_by_id = {m.id: m for m in meals}

    # Stable per-meal popularity weights (Zipf-like): a few meals far more popular.
    # Deterministic in meal order -> reproducible across runs with the same seed.
    _n_meals = len(meals)
    _ranks = np.arange(1, _n_meals + 1)
    _zipf = 1.0 / np.power(_ranks, 0.8)   # exponent 0.8 = moderate skew
    # Shuffle the weight-to-meal assignment deterministically via rng so popularity
    # isn't just catalog order, but stays reproducible under the fixed seed.
    _perm = rng.permutation(_n_meals)
    meal_popularity = {meals[_perm[i]].id: float(_zipf[i]) for i in range(_n_meals)}

    for (fid, mid, cc), _inv in inv_map.items():
        key = (fid, cc)
        stocked.setdefault(key, []).append(meal_by_id[mid])

    # Status distribution per flight status
    STATUS_DIST: dict[str, list] = {
        FlightStatus.scheduled.value: [OrderStatus.received.value] * 10,
        FlightStatus.boarding.value:  [OrderStatus.received.value] * 5
                                     + [OrderStatus.confirmed.value] * 5,
        FlightStatus.in_flight.value: [OrderStatus.confirmed.value] * 2
                                     + [OrderStatus.preparing.value] * 3
                                     + [OrderStatus.en_route.value] * 3
                                     + [OrderStatus.delivered.value] * 2,
        FlightStatus.landed.value:    [OrderStatus.delivered.value] * 8
                                     + [OrderStatus.cancelled.value] * 2,
    }

    # Cabin priority scores
    CABIN_PRIORITY = {"first": 10.0, "business": 7.0, "premium_economy": 4.0, "economy": 1.0}

    all_orders: list[PassengerOrder] = []
    all_items: list[OrderItem] = []
    all_tasks: list[DeliveryTask] = []
    all_feedback: list[Feedback] = []

    # Track served/reserved per inventory slot for post-processing
    served_acc: dict[tuple, int] = {}   # (flight_id, meal_id, cabin_class)
    reserved_acc: dict[tuple, int] = {}

    passenger_pool = passengers.copy()

    for flight in flights:
        cabin_classes = [cc for cc in ["economy", "premium_economy", "business", "first"]
                         if seat_counts.get((flight.id, cc), 0) > 0]
        if not cabin_classes:
            continue

        status_pool = STATUS_DIST.get(flight.status, STATUS_DIST[FlightStatus.landed.value])

        # Sample passengers for this flight
        total_seats = sum(seat_counts.get((flight.id, cc), 0) for cc in cabin_classes)
        n_passengers_on_flight = int(total_seats * (flight.load_factor or 0.8))
        n_passengers_on_flight = min(n_passengers_on_flight, len(passenger_pool))
        if n_passengers_on_flight == 0:
            continue

        assigned_idxs = rng.choice(len(passenger_pool), size=n_passengers_on_flight,
                                   replace=False)

        # Crew for this flight's airline
        flight_crew = [c for c in crew if c.airline_id == flight.airline_id]
        if not flight_crew:
            flight_crew = crew  # fallback
        # Serving crew = those who actually deliver meals (cabin + senior cabin crew)
        serving_crew = []
        for c in flight_crew:
            r = getattr(c, "role", None)
            r_str = getattr(r, "value", r)
            if r_str in ("cabin_crew", "senior_cabin_crew"):
                serving_crew.append(c)
        if not serving_crew:
            serving_crew = flight_crew  # fallback if roles differ

        for p_idx in assigned_idxs:
            if rng.random() > ORDER_RATE:
                continue

            passenger = passenger_pool[int(p_idx)]

            # Cabin class weighted by FFP tier
            tier_cabin = {"Platinum": "first", "Gold": "business",
                          "Silver": "premium_economy", "Bronze": "economy"}
            preferred_cabin = tier_cabin.get(passenger.ffp_tier, "economy")
            if preferred_cabin not in cabin_classes:
                preferred_cabin = cabin_classes[-1]  # economy fallback

            # Seat number (synthetic — just label, not from flight_seats table)
            row_label = {"first": "F", "business": "J", "premium_economy": "W", "economy": "Y"}[preferred_cabin]
            seat_num = f"{row_label}{rng.integers(1, 40)}{rng.choice(list('ABCDEF'))}"

            order_status = rng.choice(status_pool)
            # Max-wins priority: highest of cabin score and any applicable special-needs score
            priority = CABIN_PRIORITY[preferred_cabin]
            if passenger.is_medical:
                priority = max(priority, 10.0)
            if passenger.has_infant:
                priority = max(priority, 7.0)
            if passenger.is_connecting:
                priority = max(priority, 6.0)

            # Zone-based: divide rows among serving crew; this seat's row -> owner
            _row = _seat_row(seat_num)
            _n_zones = max(1, len(serving_crew))
            # Assign rows in contiguous blocks (zone size ~ rows per crew). Use modulo
            # on a coarse block so nearby rows share a crew member.
            _zone_idx = min(_n_zones - 1, (_row // 8) % _n_zones)
            zone_crew = serving_crew[_zone_idx]

            assigned_crew = zone_crew if order_status in (
                OrderStatus.en_route.value, OrderStatus.delivered.value,
                OrderStatus.preparing.value,
            ) else None

            oid = _uid(rng)
            order = PassengerOrder(
                id=oid,
                flight_id=flight.id,
                passenger_id=passenger.id,
                seat_number=seat_num,
                cabin_class=preferred_cabin,
                status=order_status,
                priority_score=round(priority, 2),
                assigned_crew_id=assigned_crew.id if assigned_crew else None,
            )
            all_orders.append(order)

            # ── Order items (1–2 meals) ───────────────────────────────────────
            available = stocked.get((flight.id, preferred_cabin), [])
            if not available:
                continue  # no inventory for this cabin on this flight

            # Look up allergy flags from pre-built dict (avoids lazy-load)
            allergy_flags = allergy_flags_by_id.get(passenger.id, {})

            # Filter: remove allergen conflicts and zero-stock candidates
            def _safe(m: MealItem) -> bool:
                inv_key = (flight.id, m.id, preferred_cabin)
                inv = inv_map.get(inv_key)
                if inv is None:
                    return False
                # Check remaining capacity
                used = served_acc.get(inv_key, 0) + reserved_acc.get(inv_key, 0)
                if inv.initial_qty - used < 1:
                    return False
                # Hard allergen gate
                meal_allergens = m.allergen_flags or {}
                for allergen, has_allergy in allergy_flags.items():
                    if has_allergy and meal_allergens.get(allergen):
                        return False
                return True

            safe_meals = [m for m in available if _safe(m)]
            if not safe_meals:
                safe_meals = available[:3]  # last-resort: ignore capacity (still safe allergen)

            # Popularity-weighted selection from safe_meals
            _w = np.array([meal_popularity.get(m.id, 1.0) for m in safe_meals], dtype=float)
            _w_sum = _w.sum()
            if _w_sum <= 0:
                _probs = None
            else:
                _probs = _w / _w_sum
            n_items = int(rng.integers(ITEMS_PER_ORDER[0], ITEMS_PER_ORDER[1] + 1))
            n_items = min(n_items, len(safe_meals))
            chosen_meals = rng.choice(safe_meals, size=n_items, replace=False, p=_probs)

            for meal in chosen_meals:
                all_items.append(OrderItem(
                    id=_uid(rng),
                    order_id=oid,
                    meal_id=meal.id,
                    qty=1,
                    customisations=None,
                ))
                inv_key = (flight.id, meal.id, preferred_cabin)
                if order_status == OrderStatus.delivered.value:
                    served_acc[inv_key] = served_acc.get(inv_key, 0) + 1
                elif order_status != OrderStatus.cancelled.value:
                    reserved_acc[inv_key] = reserved_acc.get(inv_key, 0) + 1

            # ── Delivery task ─────────────────────────────────────────────────
            if order_status not in (OrderStatus.received.value,
                                    OrderStatus.cancelled.value):
                task_status_map = {
                    OrderStatus.confirmed.value: DeliveryStatus.pending.value,
                    OrderStatus.preparing.value: DeliveryStatus.pending.value,
                    OrderStatus.en_route.value:  DeliveryStatus.in_progress.value,
                    OrderStatus.delivered.value: DeliveryStatus.completed.value,
                }
                all_tasks.append(DeliveryTask(
                    id=_uid(rng),
                    order_id=oid,
                    crew_id=zone_crew.id,
                    seat_number=seat_num,
                    route_position=int(rng.integers(1, 50)),
                    status=task_status_map.get(order_status,
                                               DeliveryStatus.pending.value),
                ))

            # ── Feedback (delivered orders only) ──────────────────────────────
            if (order_status == OrderStatus.delivered.value
                    and rng.random() < FEEDBACK_RATE):
                overall = _rating(rng)
                n_tags = int(rng.integers(0, 4))
                tags = list(rng.choice(FEEDBACK_TAGS, size=n_tags, replace=False))
                all_feedback.append(Feedback(
                    id=_uid(rng),
                    order_id=oid,
                    overall_rating=overall,
                    taste_rating=_rating(rng),
                    temp_rating=_rating(rng),
                    portion_rating=_rating(rng),
                    speed_rating=_rating(rng),
                    tags=tags,
                    free_text=None,
                    sentiment_score=None,
                ))

    # ── Bulk flush all generated rows ────────────────────────────────────────
    def _flush_chunks(items: list, label: str, size: int = 500) -> None:
        for i in range(0, len(items), size):
            db.add_all(items[i:i + size])
            db.flush()
        print(f"    {len(items)} {label} inserted.")

    _flush_chunks(all_orders, "orders")
    _flush_chunks(all_items, "order items")
    _flush_chunks(all_tasks, "delivery tasks")
    _flush_chunks(all_feedback, "feedback rows")

    # ── Post-process inventory: set served_qty / reserved_qty ─────────────────
    for key, count in served_acc.items():
        inv = inv_map.get(key)
        if inv and inv.served_qty + count <= inv.initial_qty:
            inv.served_qty += count
    for key, count in reserved_acc.items():
        inv = inv_map.get(key)
        if inv and inv.served_qty + inv.reserved_qty + count <= inv.initial_qty:
            inv.reserved_qty += count

    # ── Generate realistic post-flight waste for landed flights ────────────────
    flight_status_map = {f.id: f.status for f in flights}
    for key, inv in inv_map.items():
        flight_id = key[0]
        cabin_class = key[2]
        status = flight_status_map.get(flight_id)
        if status in (FlightStatus.landed.value, "landed", "completed"):
            leftover = inv.initial_qty - inv.reserved_qty - inv.served_qty
            if leftover > 0:
                # Plausible waste fraction using Beta distribution (mean ~0.3-0.5)
                if cabin_class == "economy":
                    a, b = 2.0, 2.5  # mean ~0.44
                elif cabin_class == "premium_economy":
                    a, b = 2.0, 3.0  # mean ~0.40
                elif cabin_class == "business":
                    a, b = 2.0, 3.7  # mean ~0.35
                else:  # first
                    a, b = 2.0, 4.7  # mean ~0.30
                
                fraction = rng.beta(a, b)
                
                # Allow a minority of rows (e.g. 15%) to be genuinely 0
                if rng.random() < 0.15:
                    wasted = 0
                else:
                    wasted = int(round(fraction * leftover))
                
                inv.wasted_qty = max(0, min(wasted, leftover))
            else:
                inv.wasted_qty = 0
        else:
            inv.wasted_qty = 0

    db.flush()

    return {
        "orders":         len(all_orders),
        "order_items":    len(all_items),
        "delivery_tasks": len(all_tasks),
        "feedback":       len(all_feedback),
    }


def _gen_bookings(
    db: Session,
    rng: "np.random.Generator",
    flights: list["Flight"],
    passengers: list["Passenger"],
    seat_counts: dict[tuple, int],
) -> dict[str, Any]:
    """Assign passengers to REAL seats and persist Booking rows.

    Source of truth for 'who is on which flight in which seat'. Deterministic
    under the shared rng. Pins one demo booking: PNR AIRMEAL1 -> SV209 -> Y12C.
    """
    from app.models.flight import FlightSeat as _FlightSeat

    DEMO_PNR = "SV2K9C"
    DEMO_LAST_NAME = "Durai"
    DEMO_FIRST_NAME = "Nitish"
    DEMO_EMAIL = "nitish@gmail.com"
    SV209_ID = uuid.UUID("b159aea5-2cf0-4e54-a8b2-183078d41915")
    DEMO_SEAT = "Y12C"

    # Load all real seats grouped by flight
    all_seats = db.scalars(select(_FlightSeat)).all()
    seats_by_flight: dict[uuid.UUID, list] = {}
    for s in all_seats:
        seats_by_flight.setdefault(s.flight_id, []).append(s)
    # Stable seat order per flight for reproducibility
    for fid in seats_by_flight:
        seats_by_flight[fid].sort(key=lambda s: s.seat_number)

    bookings: list[Booking] = []
    # Real-airline record locators: 6 chars, uppercase letters+digits, no ambiguous chars.
    _PNR_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # excludes I,O,0,1 to avoid confusion
    _used_pnrs: set[str] = {DEMO_PNR}

    def _make_pnr() -> str:
        while True:
            code = "".join(_PNR_ALPHABET[int(k)] for k in rng.integers(0, len(_PNR_ALPHABET), size=6))
            if code not in _used_pnrs:
                _used_pnrs.add(code)
                return code

    used_passenger_idxs: set[int] = set()
    pool_size = len(passengers)

    # Reserve one passenger as the pinned demo passenger (first passenger).
    # This account owns the pinned demo booking (SV2K9C). Boarding enforces
    # that the authenticated account is the passenger the booking was issued
    # to, so the demo login and the demo booking must be the same identity.
    demo_passenger = passengers[0]
    demo_passenger.first_name = DEMO_FIRST_NAME
    demo_passenger.last_name = DEMO_LAST_NAME
    demo_passenger.pnr = DEMO_PNR
    demo_passenger.email = DEMO_EMAIL
    demo_passenger.hashed_password = _get_owner_hash()
    used_passenger_idxs.add(0)

    for flight in flights:
        seats = seats_by_flight.get(flight.id, [])
        if not seats:
            continue
        n_take = int(len(seats) * (flight.load_factor or 0.8))
        n_take = max(0, min(n_take, len(seats)))
        if n_take == 0:
            continue

        # Choose seats deterministically (first n_take in sorted order)
        chosen_seats = seats[:n_take]

        # Choose passengers for this flight (deterministic sample, skip already-used)
        available_idxs = [i for i in range(pool_size) if i not in used_passenger_idxs]
        if len(available_idxs) < len(chosen_seats):
            # Not enough unique passengers left; allow reuse across flights beyond this point
            available_idxs = list(range(pool_size))
        pick = rng.choice(len(available_idxs), size=len(chosen_seats), replace=False)
        picked_idxs = [available_idxs[int(k)] for k in pick]

        for seat, p_idx in zip(chosen_seats, picked_idxs):
            passenger = passengers[p_idx]
            used_passenger_idxs.add(p_idx)
            bookings.append(Booking(
                id=_uid(rng),
                pnr=_make_pnr(),
                passenger_id=passenger.id,
                flight_id=flight.id,
                seat_number=seat.seat_number,
                cabin_class=seat.cabin_class,
            ))

    # Pin the demo booking: AIRMEAL1 -> SV209 -> Y12C (overrides any seat clash).
    # Remove any booking that grabbed SV209/Y12C or the demo passenger, then add the pin.
    bookings = [
        b for b in bookings
        if not (b.flight_id == SV209_ID and b.seat_number == DEMO_SEAT)
        and b.passenger_id != demo_passenger.id
    ]
    bookings.append(Booking(
        id=_uid(rng),
        pnr=DEMO_PNR,
        passenger_id=demo_passenger.id,
        flight_id=SV209_ID,
        seat_number=DEMO_SEAT,
        cabin_class="economy",
    ))

    db.add_all(bookings)
    db.flush()
    return {"bookings": len(bookings)}


def _gen_model_registry(db: Session) -> None:
    """Seed four model entries with NULL metrics — never pre-populate numbers."""
    models = [
        ("recommender",    "Content-collaborative hybrid (NumPy cosine)"),
        ("forecaster",     "LightGBM demand forecaster"),
        ("crew_router",    "Ant Colony Optimization router"),
        ("waste_predictor","LightGBM waste predictor"),
    ]
    rows = [
        ModelRegistry(
            model_name=name,
            version="0.0.0",
            status="untrained",
            metrics=None,      # populated only after a real retrain
            trained_at=None,
        )
        for name, _desc in models
    ]
    db.add_all(rows)
    db.flush()


# ── Public API ────────────────────────────────────────────────────────────────

def generate(
    db: Session,
    *,
    n_flights: int = 50,
    n_passengers: int = 5000,
    n_meals: int = 65,
    seed: int = 42,
    reset: bool = False,
) -> dict[str, Any]:
    """
    Populate all AirMeal tables with synthetic data.

    Parameters
    ----------
    db           : SQLAlchemy Session (caller is responsible for commit/rollback).
    n_flights    : Number of flights to generate.
    n_passengers : Number of passenger accounts to generate.
    n_meals      : Number of meal items to load from the catalog (max 65).
    seed         : NumPy RNG seed — same seed → same data.
    reset        : If True, TRUNCATE all tables before generating.

    Returns
    -------
    dict with row counts for each table.
    """
    rng = np.random.default_rng(seed)
    n_meals = min(n_meals, 65)

    if reset:
        print("Resetting tables…")
        _truncate_all(db)
    else:
        existing = db.scalar(select(func.count()).select_from(Airline))
        if existing and existing > 0:
            raise RuntimeError(
                "Data already exists. Use --reset to truncate and regenerate."
            )

    print(f"Generating: {n_flights} flights | {n_passengers} passengers | {n_meals} meals | seed={seed}")

    print("  Airlines…")
    airlines = _gen_airlines(db, rng)

    print("  Meal categories…")
    categories = _gen_meal_categories(db, rng)

    print("  Meal items…")
    meals = _gen_meals(db, rng, categories, n_meals)

    print("  Crew members…")
    crew = _gen_crew(db, rng, airlines)

    print("  Passengers + profiles…")
    passengers, allergy_flags_by_id = _gen_passengers(db, rng, n_passengers)

    print("  Flights + seats…")
    flights, seat_counts = _gen_flights_and_seats(db, rng, airlines, n_flights)

    print("  Inventory…")
    inv_map = _gen_inventory(db, rng, flights, meals, seat_counts)

    print("  Orders, items, tasks, feedback…")
    order_stats = _gen_orders_tasks_feedback(
        db, rng, flights, passengers, allergy_flags_by_id, meals, crew, inv_map, seat_counts
    )
    print("  Bookings…")
    booking_stats = _gen_bookings(db, rng, flights, passengers, seat_counts)
    print("  Model registry…")
    _gen_model_registry(db)

    db.commit()

    stats = {
        "airlines":       len(airlines),
        "meal_categories": len(categories),
        "meal_items":     len(meals),
        "crew_members":   len(crew),
        "passengers":     len(passengers),
        "flights":        len(flights),
        "flight_seats":   sum(seat_counts.values()),
        "flight_inventory": len(inv_map),
        **order_stats,
        **booking_stats,
        "model_registry": 4,
    }
    return stats
