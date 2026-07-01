from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from sqlalchemy import select

# ---- project imports (real code, called exactly as the app does) -------------
from app.db.session import SessionLocal
from app.ml.recommender import _cosine_sim, MIN_EVAL_PASSENGERS
from app.ml.evaluation import mean_ndcg, mean_precision, mean_recall
import app.ml.waste as waste_module
from app.ml.data_gen.catalog import ALLERGEN_KEYS
from app.models.meal import FlightInventory, MealItem
from app.models.order import OrderItem, PassengerOrder
from app.models.passenger import PassengerProfile

# Two ablation arms. 0.20 must match the production constant in recommend().
CONFIGS = {"A_ww_0.00": 0.00, "B_ww_0.20": 0.20}

# Output dir: <repo>/Research Assets/Results/exp1_recommendation_ablation
RESULTS_DIR = (
    Path(__file__).resolve().parent.parent
    / "Research Assets" / "Results" / "exp1_recommendation_ablation"
)


def _allergen_conflict(meal: MealItem, allergy_flags: dict) -> bool:
    m = meal.allergen_flags or {}
    return any(allergy_flags.get(a) and m.get(a) for a in ALLERGEN_KEYS)


def main() -> None:
    db = SessionLocal()
    try:
        # ---- held-out split: replicate train_and_evaluate's deterministic 20% ----
        profiles = db.execute(
            select(PassengerProfile).where(
                PassengerProfile.preference_embedding.isnot(None)
            )
        ).scalars().all()

        if len(profiles) < MIN_EVAL_PASSENGERS * 5:
            print("INSUFFICIENT DATA: fewer than the minimum held-out passengers.")
            return

        split = max(MIN_EVAL_PASSENGERS, len(profiles) // 5)
        held_out = profiles[-split:]
        held_ids = [p.passenger_id for p in held_out]

        # ---- ground truth: each held-out passenger's ordered meals, with the
        #      flight/cabin of those orders (per-flight evaluation anchor) --------
        orders = db.execute(
            select(PassengerOrder).where(PassengerOrder.passenger_id.in_(held_ids))
        ).scalars().all()
        order_to_pf = {o.id: (o.passenger_id, o.flight_id, o.cabin_class) for o in orders}
        order_ids = [o.id for o in orders]

        items = db.execute(
            select(OrderItem).where(OrderItem.order_id.in_(order_ids))
        ).scalars().all()

        # (passenger_id, flight_id, cabin_class) -> set(meal_id ordered there)
        relevant: dict[tuple, set] = {}
        for it in items:
            key = order_to_pf.get(it.order_id)
            if key:
                relevant.setdefault(key, set()).add(it.meal_id)

        prof_by_pid = {p.passenger_id: p for p in held_out}

        # ---- waste signal cache: predict_waste per (flight, cabin), as production does
        waste_cache: dict[tuple, dict] = {}   # (flight_id, cabin) -> {meal_id: wp}
        method_counter: dict[str, int] = {}

        def waste_for(flight_id, cabin):
            key = (flight_id, cabin)
            if key in waste_cache:
                return waste_cache[key]
            wp_map: dict[uuid.UUID, float] = {}
            try:
                preds = waste_module.predict_waste(db, flight_id, cabin)
                for wp in preds:
                    method_counter[wp.get("method", "unknown")] = (
                        method_counter.get(wp.get("method", "unknown"), 0) + 1
                    )
                    try:
                        mid = uuid.UUID(wp["meal_id"])
                    except (ValueError, KeyError, TypeError):
                        continue
                    wp_map[mid] = float(wp.get("waste_pct", 0.0)) / 100.0
            except Exception:
                wp_map = {}
            waste_cache[key] = wp_map
            return wp_map

        # ---- run both arms over the SAME evaluation units --------------------
        per_config = {}
        eval_units = [(pid, fid, cab) for (pid, fid, cab) in relevant.keys()]

        for cfg_name, ww in CONFIGS.items():
            user_recs: list[tuple[list, set]] = []
            top10_waste_vals: list[float] = []

            for (pid, fid, cab) in eval_units:
                gt = relevant[(pid, fid, cab)]
                if not gt:
                    continue
                profile = prof_by_pid.get(pid)
                if profile is None or not profile.preference_embedding:
                    continue
                pref_vec = np.array(profile.preference_embedding, dtype=float)
                allergy = profile.allergy_flags or {}

                # candidate meals = this flight+cabin's inventory (production scope)
                inv = db.execute(
                    select(FlightInventory).where(
                        FlightInventory.flight_id == fid,
                        FlightInventory.cabin_class == cab,
                    )
                ).scalars().all()
                cand_ids = [i.meal_id for i in inv]
                if not cand_ids:
                    continue
                meals = db.execute(
                    select(MealItem).where(MealItem.id.in_(cand_ids))
                ).scalars().all()

                wp_map = waste_for(fid, cab)

                scored = []
                for meal in meals:
                    if _allergen_conflict(meal, allergy):
                        continue
                    if getattr(meal, "is_alcohol", False):
                        continue
                    mvec = (
                        np.array(meal.meal_embedding, dtype=float)
                        if meal.meal_embedding else np.zeros(32, dtype=float)
                    )
                    sim = _cosine_sim(pref_vec, mvec)
                    wp = wp_map.get(meal.id, 0.0)
                    adj = sim * (1.0 + ww * wp)           # production formula
                    scored.append((adj, meal.id, wp))

                if not scored:
                    continue
                scored.sort(key=lambda x: x[0], reverse=True)
                ranked_ids = [mid for _, mid, _ in scored]
                user_recs.append((ranked_ids, gt))
                # mean predicted waste of the Top-10 recommended meals (this arm)
                top10 = scored[:10]
                if top10:
                    top10_waste_vals.append(
                        sum(w for _, _, w in top10) / len(top10)
                    )

            per_config[cfg_name] = {
                "waste_weight": ww,
                "ndcg_at_10": mean_ndcg(user_recs, k=10),
                "precision_at_5": mean_precision(user_recs, k=5),
                "recall_at_10": mean_recall(user_recs, k=10),
                "mean_top10_predicted_waste": (
                    round(sum(top10_waste_vals) / len(top10_waste_vals), 4)
                    if top10_waste_vals else None
                ),
                "n_eval_users": len(user_recs),
            }

        # ---- assemble + write outputs ---------------------------------------
        out = {
            "experiment": "exp1_recommendation_ablation",
            "run_at": datetime.now(timezone.utc).isoformat(),
            "evaluation": "per-flight (held-out 20% passengers, on their actual flight/cabin)",
            "waste_signal_methods_observed": method_counter,
            "configs": per_config,
            "notes": (
                "Re-rank reproduces recommend(): adj = sim*(1+WASTE_WEIGHT*wp), "
                "wp = predict_waste().waste_pct/100. Only WASTE_WEIGHT differs between arms. "
                "Metrics use the project's own mean_ndcg/precision/recall. "
                "Waste method is chosen by each flight's status inside predict_waste()."
            ),
        }

        RESULTS_DIR.mkdir(parents=True, exist_ok=True)
        (RESULTS_DIR / "exp1_results.json").write_text(
            json.dumps(out, indent=2), encoding="utf-8"
        )

        a = per_config.get("A_ww_0.00", {})
        b = per_config.get("B_ww_0.20", {})

        def fmt(x):
            return "n/a" if x is None else f"{x}"

        def delta(bk, ak):
            if b.get(bk) is None or a.get(ak) is None:
                return "n/a"
            return f"{round(b[bk] - a[ak], 4)}"

        md = f"""# Experiment 1 — Recommendation Ablation (RESULTS)

Run: {out['run_at']}
Evaluation: {out['evaluation']}
Waste-signal methods observed: {method_counter}

| Metric | A (WW=0.00) | B (WW=0.20) | Δ (B−A) |
|---|---|---|---|
| NDCG@10 | {fmt(a.get('ndcg_at_10'))} | {fmt(b.get('ndcg_at_10'))} | {delta('ndcg_at_10','ndcg_at_10')} |
| Precision@5 | {fmt(a.get('precision_at_5'))} | {fmt(b.get('precision_at_5'))} | {delta('precision_at_5','precision_at_5')} |
| Recall@10 | {fmt(a.get('recall_at_10'))} | {fmt(b.get('recall_at_10'))} | {delta('recall_at_10','recall_at_10')} |
| Mean Top-10 predicted waste | {fmt(a.get('mean_top10_predicted_waste'))} | {fmt(b.get('mean_top10_predicted_waste'))} | {delta('mean_top10_predicted_waste','mean_top10_predicted_waste')} |
| n_eval_users | {fmt(a.get('n_eval_users'))} | {fmt(b.get('n_eval_users'))} | (same split) |

Values produced by exp1_recommendation_ablation.py from live data. Not hand-edited.
"""
        (RESULTS_DIR / "exp1_results.md").write_text(md, encoding="utf-8")

        tex = f"""\\begin{{table}}[t]
\\centering
\\caption{{Recommendation ablation: effect of waste-aware re-ranking (per-flight evaluation, $n={fmt(b.get('n_eval_users'))}$ users).}}
\\label{{tab:exp1_ablation}}
\\begin{{tabular}}{{lccc}}
\\hline
Metric & WW=0.00 & WW=0.20 & $\\Delta$ \\\\
\\hline
NDCG@10 & {fmt(a.get('ndcg_at_10'))} & {fmt(b.get('ndcg_at_10'))} & {delta('ndcg_at_10','ndcg_at_10')} \\\\
Precision@5 & {fmt(a.get('precision_at_5'))} & {fmt(b.get('precision_at_5'))} & {delta('precision_at_5','precision_at_5')} \\\\
Recall@10 & {fmt(a.get('recall_at_10'))} & {fmt(b.get('recall_at_10'))} & {delta('recall_at_10','recall_at_10')} \\\\
Mean Top-10 pred. waste & {fmt(a.get('mean_top10_predicted_waste'))} & {fmt(b.get('mean_top10_predicted_waste'))} & {delta('mean_top10_predicted_waste','mean_top10_predicted_waste')} \\\\
\\hline
\\end{{tabular}}
\\end{{table}}
"""
        (RESULTS_DIR / "exp1_results_table.tex").write_text(tex, encoding="utf-8")

        print("=== Experiment 1 complete ===")
        print(json.dumps(per_config, indent=2))
        print(f"Waste methods observed: {method_counter}")
        print(f"Outputs written to: {RESULTS_DIR}")

    finally:
        db.close()


if __name__ == "__main__":
    main()
