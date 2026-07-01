"""NumPy cosine-similarity recommender for AirMeal.

Algorithm
---------
1. Load passenger preference embedding and all meal embeddings from DB.
2. Compute cosine similarity between the passenger vector and each meal vector.
3. Hard post-filter: remove allergen-conflicting items and zero-stock items.
4. Rank by similarity; attach a brief "why" explanation for each top result.
5. Evaluation: NDCG@10, Precision@5, Recall@10 on a held-out 20% split of
   passengers (those whose orders form the ground-truth relevant set).
   Results are written to model_registry; if insufficient data, leave NULL.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

import numpy as np
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ml.data_gen.catalog import ALLERGEN_KEYS, CUISINE_KEYS
from app.ml.evaluation import mean_ndcg, mean_precision, mean_recall
import app.ml.waste as waste_module
from app.models.meal import FlightInventory, MealItem
from app.models.ml import ModelRegistry
from app.models.order import OrderItem, PassengerOrder
from app.models.passenger import PassengerProfile

MODEL_NAME = "recommender"
MODEL_VERSION = "1.0.0"

# Minimum number of passengers in held-out split before we compute metrics
MIN_EVAL_PASSENGERS = 5


def _cosine_sim(a: np.ndarray, b: np.ndarray) -> float:
    """Cosine similarity between two L2-normalised (or arbitrary) vectors."""
    denom = np.linalg.norm(a) * np.linalg.norm(b)
    if denom == 0:
        return 0.0
    return float(np.dot(a, b) / denom)


def _why_string(meal: MealItem, passenger_profile: PassengerProfile, sim: float) -> str:
    """Generate a specific, evidence-based explanation for a recommendation."""
    reasons = []
    # Cuisine match (strong vs moderate)
    prefs: dict = passenger_profile.cuisine_prefs or {}
    cuisine = (meal.cuisine_type or "").replace("_", " ")
    raw_cuisine = meal.cuisine_type or ""
    if raw_cuisine in prefs:
        pref_val = prefs[raw_cuisine]
        if pref_val >= 0.6:
            reasons.append(f"matches your love of {cuisine} cuisine")
        elif pref_val >= 0.4:
            reasons.append(f"aligns with your {cuisine} taste")
    # Dietary match (now includes jain + low_calorie)
    p_diet: dict = passenger_profile.dietary_flags or {}
    m_diet: dict = meal.dietary_flags or {}
    diet_labels = {
        "jain": "Jain-friendly (no onion/garlic)",
        "vegetarian": "vegetarian-friendly",
        "vegan": "vegan-friendly",
        "halal": "halal-certified",
        "gluten_free": "gluten-free",
        "low_calorie": "low-calorie",
    }
    for k, label in diet_labels.items():
        if p_diet.get(k) and m_diet.get(k):
            reasons.append(f"fits your {label} preference")
            break
    # Portion fit
    cals = meal.calories or 0
    if passenger_profile.portion_pref == "small" and 0 < cals < 300:
        reasons.append("a lighter portion as you prefer")
    elif passenger_profile.portion_pref == "large" and cals > 500:
        reasons.append("a generous portion as you prefer")
    # Always end with the concrete similarity signal
    pct = int(round(sim * 100))
    if reasons:
        return "Recommended because it " + " and ".join(reasons[:2]) + f" - a {pct}% match to your profile."
    return f"A {pct}% match to your taste profile, based on your cuisine and dietary choices."


def recommend(
    db: Session,
    flight_id: uuid.UUID,
    passenger_id: uuid.UUID,
    cabin_class: str,
    top_n: int = 10,
) -> list[dict]:
    """
    Return top-N ranked meal recommendations with allergen/stock post-filter.

    Returns
    -------
    List of dicts: {meal_id, meal_code, name, score, why, calories, allergen_flags}
    """
    # Load passenger profile
    profile = db.scalar(
        select(PassengerProfile).where(PassengerProfile.passenger_id == passenger_id)
    )

    # Load meals with available stock for this flight+cabin
    available_inv = db.execute(
        select(FlightInventory).where(
            FlightInventory.flight_id == flight_id,
            FlightInventory.cabin_class == cabin_class,
        )
    ).scalars().all()

    # Build stock lookup (has_stock) from inventory.
    stock_lookup: dict[uuid.UUID, bool] = {}
    inv_meal_ids: list[uuid.UUID] = []
    for inv in available_inv:
        remaining = inv.initial_qty - inv.reserved_qty - inv.served_qty
        stock_lookup[inv.meal_id] = remaining > 0
        inv_meal_ids.append(inv.meal_id)

    # Waste-pressure now comes from the WASTE PREDICTOR (model-driven demand shaping),
    # not a raw stock ratio. We use each meal's predicted waste fraction of stock.
    # This is the explicit recommender <- waste-model link.
    waste_pressure: dict[uuid.UUID, float] = {}
    try:
        waste_preds = waste_module.predict_waste(db, flight_id, cabin_class)
        for wp in waste_preds:
            try:
                mid = uuid.UUID(wp["meal_id"])
            except (ValueError, KeyError, TypeError):
                continue
            waste_pressure[mid] = float(wp.get("waste_pct", 0.0)) / 100.0
    except Exception:
        # If the waste model is unavailable, fall back to no boost (pure preference).
        waste_pressure = {}

    # Relative boost threshold: flag a meal only when its predicted waste is clearly
    # above the flight's average, so the "reduce waste" signal highlights the genuinely
    # higher-waste items rather than every meal. 1.05× mean = modestly above average.
    if waste_pressure:
        _wp_vals = list(waste_pressure.values())
        _wp_mean = sum(_wp_vals) / len(_wp_vals)
        boost_threshold = _wp_mean * 1.05
    else:
        boost_threshold = 1.0  # nothing qualifies when no waste data

    if not inv_meal_ids:
        return []

    # Load meal items
    meals = db.execute(
        select(MealItem).where(MealItem.id.in_(inv_meal_ids))
    ).scalars().all()

    # Allergen hard-filter
    allergy_flags: dict = {}
    if profile:
        allergy_flags = profile.allergy_flags or {}

    def _allergen_conflict(meal: MealItem) -> bool:
        m_allergens: dict = meal.allergen_flags or {}
        for allergen in ALLERGEN_KEYS:
            if allergy_flags.get(allergen) and m_allergens.get(allergen):
                return True
        return False

    # Build passenger embedding
    if profile and profile.preference_embedding:
        pref_vec = np.array(profile.preference_embedding, dtype=float)
    else:
        # Fallback: uniform vector (no personalization)
        pref_vec = np.ones(32, dtype=float) / np.sqrt(32)

    # Score meals
    scored: list[tuple[float, float, bool, MealItem]] = []
    for meal in meals:
        # Skip allergen conflicts
        if _allergen_conflict(meal):
            continue
        # Skip zero-stock
        if not stock_lookup.get(meal.id, False):
            continue
        # Skip alcohol — never appropriate as a personalized recommendation
        if getattr(meal, "is_alcohol", False):
            continue

        if meal.meal_embedding:
            meal_vec = np.array(meal.meal_embedding, dtype=float)
        else:
            meal_vec = np.zeros(32, dtype=float)

        sim = _cosine_sim(pref_vec, meal_vec)
        # Model-driven demand shaping: up-rank meals the WASTE MODEL predicts are at
        # higher risk of going unused, among meals the passenger already matches well.
        # WASTE_WEIGHT bounds the effect so cosine preference still dominates ordering.
        # adj is used ONLY for ranking; raw sim is preserved for the displayed match %.
        WASTE_WEIGHT = 0.20
        wp = waste_pressure.get(meal.id, 0.0)
        adj = sim * (1.0 + WASTE_WEIGHT * wp)
        # Flag a meal as "boosted" when the waste signal is meaningful enough to matter.
        boosted = wp >= boost_threshold
        scored.append((adj, sim, boosted, meal))

    # Sort descending by the waste-adjusted score
    scored.sort(key=lambda x: x[0], reverse=True)

    results = []
    for adj, sim, boosted, meal in scored[:top_n]:
        why = _why_string(meal, profile, sim) if profile else "Highly popular on this route"
        results.append({
            "meal_id":       str(meal.id),
            "meal_code":     meal.meal_code,
            "name":          meal.name,
            "score":         round(sim, 4),
            "why":           why,
            "calories":      meal.calories,
            "allergen_flags": meal.allergen_flags or {},
            "dietary_flags":  meal.dietary_flags or {},
            "waste_boosted":  bool(boosted),
        })

    return results


# ── Training / Evaluation ──────────────────────────────────────────────────────

def train_and_evaluate(db: Session) -> dict:
    """
    Compute held-out NDCG@10, Precision@5, Recall@10 on a 20% passenger split.

    The "ground truth" for each held-out passenger is the set of meals they
    actually ordered (from passenger_orders + order_items).

    Updates model_registry and returns the computed metrics dict.
    """
    # Collect all passenger profiles with embeddings
    profiles = db.execute(
        select(PassengerProfile).where(PassengerProfile.preference_embedding.isnot(None))
    ).scalars().all()

    if len(profiles) < MIN_EVAL_PASSENGERS * 5:
        # Not enough data for a meaningful hold-out
        return _upsert_registry(db, status="trained", metrics=None)

    # 20% held-out split (deterministic — use last 20% by insertion order)
    split = max(MIN_EVAL_PASSENGERS, len(profiles) // 5)
    held_out = profiles[-split:]

    # Build ground-truth: passenger_id → set of meal_ids they ordered
    passenger_ids = [p.passenger_id for p in held_out]

    orders = db.execute(
        select(PassengerOrder).where(PassengerOrder.passenger_id.in_(passenger_ids))
    ).scalars().all()
    order_ids = [o.id for o in orders]

    items = db.execute(
        select(OrderItem).where(OrderItem.order_id.in_(order_ids))
    ).scalars().all()

    # Map: order_id → passenger_id
    order_to_passenger: dict[uuid.UUID, uuid.UUID] = {o.id: o.passenger_id for o in orders}

    # Map: passenger_id → set of meal_ids (relevant ground truth)
    relevant_by_passenger: dict[uuid.UUID, set[uuid.UUID]] = {}
    for item in items:
        pid = order_to_passenger.get(item.order_id)
        if pid:
            relevant_by_passenger.setdefault(pid, set()).add(item.meal_id)

    # Load ALL meals (cross-flight evaluation — we rank all meals, not per-flight)
    all_meals = db.execute(select(MealItem)).scalars().all()
    all_meal_ids = [m.id for m in all_meals]

    if not all_meals:
        return _upsert_registry(db, status="trained", metrics=None)

    # Pre-compute meal embeddings
    meal_vecs: dict[uuid.UUID, np.ndarray] = {}
    for meal in all_meals:
        if meal.meal_embedding:
            meal_vecs[meal.id] = np.array(meal.meal_embedding, dtype=float)
        else:
            meal_vecs[meal.id] = np.zeros(32, dtype=float)

    user_recs: list[tuple[list, set]] = []

    for profile in held_out:
        pid = profile.passenger_id
        relevant = relevant_by_passenger.get(pid, set())
        if not relevant:
            continue  # Skip users with no ground-truth orders

        if profile.preference_embedding:
            pref_vec = np.array(profile.preference_embedding, dtype=float)
        else:
            pref_vec = np.ones(32, dtype=float) / np.sqrt(32)

        allergy_flags: dict = profile.allergy_flags or {}

        # Score all meals (no flight/stock filter for evaluation)
        scored = []
        for meal in all_meals:
            m_allergens: dict = meal.allergen_flags or {}
            allergen_hit = any(
                allergy_flags.get(a) and m_allergens.get(a) for a in ALLERGEN_KEYS
            )
            if allergen_hit:
                continue
            sim = _cosine_sim(pref_vec, meal_vecs[meal.id])
            scored.append((sim, meal.id))

        scored.sort(reverse=True)
        recommended_ids = [mid for _, mid in scored]
        user_recs.append((recommended_ids, relevant))

    if not user_recs:
        return _upsert_registry(db, status="trained", metrics=None)

    ndcg = mean_ndcg(user_recs, k=10)
    prec = mean_precision(user_recs, k=5)
    rec  = mean_recall(user_recs, k=10)

    metrics = {
        "ndcg_at_10":     ndcg,
        "precision_at_5": prec,
        "recall_at_10":   rec,
        "n_eval_users":   len(user_recs),
        "evaluated_at":   datetime.now(timezone.utc).isoformat(),
    }
    return _upsert_registry(db, status="ready", metrics=metrics)


def _upsert_registry(db: Session, status: str, metrics: Optional[dict]) -> dict:
    """Insert or update the recommender entry in model_registry."""
    reg = db.scalar(
        select(ModelRegistry).where(ModelRegistry.model_name == MODEL_NAME)
    )
    now = datetime.now(timezone.utc)
    if reg is None:
        reg = ModelRegistry(
            id=uuid.uuid4(),
            model_name=MODEL_NAME,
            version=MODEL_VERSION,
            status=status,
            metrics=metrics,
            trained_at=now,
        )
        db.add(reg)
    else:
        reg.version = MODEL_VERSION
        reg.status = status
        reg.metrics = metrics
        reg.trained_at = now
    db.commit()
    db.refresh(reg)
    return {
        "model_name": reg.model_name,
        "version":    reg.version,
        "status":     reg.status,
        "metrics":    reg.metrics,
        "trained_at": reg.trained_at.isoformat() if reg.trained_at else None,
    }
