"""
Experiment 1 (complete) + Experiment 1b (WASTE_WEIGHT sweep).

READ-ONLY research harness. Does not modify app, DB, or model_registry.
Reproduces production re-rank  adj = sim*(1 + WASTE_WEIGHT*wp)  inside a
per-flight evaluation, on a single fixed held-out split, for several weights.

Adds vs. the first harness:
  * per-user metric arrays (so a PAIRED significance test is possible)
  * paired stats for the headline 0.00 vs 0.20 contrast (t-test + CI; Wilcoxon if scipy)
  * a weight sweep: WW in {0.0, 0.2, 0.5, 1.0, 2.0}

Run from:  ...\airmeal\backend
    python exp1_recommendation_ablation_full.py
"""

from __future__ import annotations

import warnings
warnings.filterwarnings("ignore")  # silence LightGBM feature-name warnings

import json
import math
import uuid
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from sqlalchemy import select

from app.db.session import SessionLocal
from app.ml.recommender import _cosine_sim, MIN_EVAL_PASSENGERS
from app.ml.evaluation import ndcg_at_k, precision_at_k, recall_at_k
import app.ml.waste as waste_module
from app.ml.data_gen.catalog import ALLERGEN_KEYS
from app.models.meal import FlightInventory, MealItem
from app.models.order import OrderItem, PassengerOrder
from app.models.passenger import PassengerProfile

# Production value is 0.20. Sweep includes it plus stronger weights.
SWEEP_WEIGHTS = [0.0, 0.2, 0.5, 1.0, 2.0]
# Headline paired contrast (production vs off):
CONTRAST = (0.0, 0.2)

RESULTS_DIR = (
    Path(__file__).resolve().parent.parent
    / "Research Assets" / "Results" / "exp1_recommendation_ablation"
)

# optional scipy
try:
    from scipy import stats as _scipy_stats  # type: ignore
    _HAVE_SCIPY = True
except Exception:
    _HAVE_SCIPY = False


def _allergen_conflict(meal: MealItem, allergy_flags: dict) -> bool:
    m = meal.allergen_flags or {}
    return any(allergy_flags.get(a) and m.get(a) for a in ALLERGEN_KEYS)


def _paired_stats(diffs: list[float]) -> dict:
    """Paired statistics on per-user differences (B - A)."""
    n = len(diffs)
    if n == 0:
        return {"n": 0}
    arr = np.array(diffs, dtype=float)
    mean = float(arr.mean())
    sd = float(arr.std(ddof=1)) if n > 1 else 0.0
    se = sd / math.sqrt(n) if n > 1 else 0.0
    # 95% CI (normal approx; fine at this n)
    ci_lo, ci_hi = mean - 1.96 * se, mean + 1.96 * se
    out = {
        "n": n,
        "mean_diff": round(mean, 6),
        "std_diff": round(sd, 6),
        "se_diff": round(se, 6),
        "ci95_low": round(ci_lo, 6),
        "ci95_high": round(ci_hi, 6),
    }
    # paired t by hand (always available)
    if n > 1 and se > 0:
        t = mean / se
        out["t_stat"] = round(float(t), 4)
    else:
        out["t_stat"] = None
    if _HAVE_SCIPY and n > 1:
        try:
            t_s, p_t = _scipy_stats.ttest_rel  # placeholder to avoid lint; real call below
        except Exception:
            pass
        try:
            t_s, p_t = _scipy_stats.ttest_1samp(arr, 0.0)
            out["t_pvalue"] = float(p_t)
        except Exception:
            out["t_pvalue"] = None
        # Wilcoxon needs some nonzero diffs
        try:
            if np.any(arr != 0):
                w_s, p_w = _scipy_stats.wilcoxon(arr)
                out["wilcoxon_stat"] = float(w_s)
                out["wilcoxon_pvalue"] = float(p_w)
            else:
                out["wilcoxon_pvalue"] = None
        except Exception:
            out["wilcoxon_pvalue"] = None
        out["significance_method"] = "scipy (paired t + Wilcoxon)"
    else:
        out["t_pvalue"] = None
        out["wilcoxon_pvalue"] = None
        out["significance_method"] = "numpy CI + hand t-stat (scipy not installed)"
    return out


def main() -> None:
    db = SessionLocal()
    try:
        # ---- fixed held-out split (same logic as train_and_evaluate) ----
        profiles = db.execute(
            select(PassengerProfile).where(
                PassengerProfile.preference_embedding.isnot(None)
            )
        ).scalars().all()
        if len(profiles) < MIN_EVAL_PASSENGERS * 5:
            print("INSUFFICIENT DATA"); return
        split = max(MIN_EVAL_PASSENGERS, len(profiles) // 5)
        held_out = profiles[-split:]
        held_ids = [p.passenger_id for p in held_out]
        prof_by_pid = {p.passenger_id: p for p in held_out}

        # ---- ground truth keyed by (passenger, flight, cabin) ----
        orders = db.execute(
            select(PassengerOrder).where(PassengerOrder.passenger_id.in_(held_ids))
        ).scalars().all()
        order_to_pf = {o.id: (o.passenger_id, o.flight_id, o.cabin_class) for o in orders}
        items = db.execute(
            select(OrderItem).where(OrderItem.order_id.in_([o.id for o in orders]))
        ).scalars().all()
        relevant: dict[tuple, set] = {}
        for it in items:
            key = order_to_pf.get(it.order_id)
            if key:
                relevant.setdefault(key, set()).add(it.meal_id)
        eval_units = [k for k in relevant.keys() if relevant[k]]

        # ---- waste signal cache (production semantics) ----
        waste_cache: dict[tuple, dict] = {}
        method_counter: dict[str, int] = {}

        def waste_for(fid, cab):
            key = (fid, cab)
            if key in waste_cache:
                return waste_cache[key]
            wp_map = {}
            try:
                for wp in waste_module.predict_waste(db, fid, cab):
                    m = wp.get("method", "unknown")
                    method_counter[m] = method_counter.get(m, 0) + 1
                    try:
                        mid = uuid.UUID(wp["meal_id"])
                    except (ValueError, KeyError, TypeError):
                        continue
                    wp_map[mid] = float(wp.get("waste_pct", 0.0)) / 100.0
            except Exception:
                wp_map = {}
            waste_cache[key] = wp_map
            return wp_map

        # ---- pre-load candidate meals + sims ONCE per unit (sim is weight-independent) ----
        # For each eval unit we store: list of (sim, meal_id, wp), and the ground-truth set.
        units = []
        for (pid, fid, cab) in eval_units:
            profile = prof_by_pid.get(pid)
            if profile is None or not profile.preference_embedding:
                continue
            pref_vec = np.array(profile.preference_embedding, dtype=float)
            allergy = profile.allergy_flags or {}
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
            triples = []
            for meal in meals:
                if _allergen_conflict(meal, allergy):
                    continue
                if getattr(meal, "is_alcohol", False):
                    continue
                mvec = (np.array(meal.meal_embedding, dtype=float)
                        if meal.meal_embedding else np.zeros(32, dtype=float))
                sim = _cosine_sim(pref_vec, mvec)
                wp = wp_map.get(meal.id, 0.0)
                triples.append((sim, meal.id, wp))
            if triples:
                units.append((triples, relevant[(pid, fid, cab)]))

        n_users = len(units)

        # ---- evaluate every weight; keep PER-USER arrays ----
        sweep = {}
        per_user = {}  # ww -> {"ndcg":[...], "prec":[...], "rec":[...], "waste":[...]}
        for ww in SWEEP_WEIGHTS:
            ndcgs, precs, recs, wastes = [], [], [], []
            for triples, gt in units:
                scored = [(sim * (1.0 + ww * wp), mid, wp) for (sim, mid, wp) in triples]
                scored.sort(key=lambda x: x[0], reverse=True)
                ranked = [mid for _, mid, _ in scored]
                ndcgs.append(ndcg_at_k(ranked, gt, 10))
                precs.append(precision_at_k(ranked, gt, 5))
                recs.append(recall_at_k(ranked, gt, 10))
                top10 = scored[:10]
                wastes.append(sum(w for _, _, w in top10) / len(top10) if top10 else 0.0)
            per_user[ww] = {"ndcg": ndcgs, "prec": precs, "rec": recs, "waste": wastes}
            sweep[f"WW={ww}"] = {
                "waste_weight": ww,
                "ndcg_at_10": round(float(np.mean(ndcgs)), 4),
                "precision_at_5": round(float(np.mean(precs)), 4),
                "recall_at_10": round(float(np.mean(recs)), 4),
                "mean_top10_predicted_waste": round(float(np.mean(wastes)), 4),
                "n_eval_users": n_users,
            }

        # ---- paired significance for the headline contrast (0.0 vs 0.2) ----
        a_ww, b_ww = CONTRAST
        sig = {}
        for metric in ("ndcg", "prec", "rec", "waste"):
            a = per_user[a_ww][metric]
            b = per_user[b_ww][metric]
            diffs = [bi - ai for ai, bi in zip(a, b)]
            sig[metric] = {
                "mean_A": round(float(np.mean(a)), 6),
                "mean_B": round(float(np.mean(b)), 6),
                **_paired_stats(diffs),
            }

        out = {
            "experiment": "exp1_recommendation_ablation_full",
            "run_at": datetime.now(timezone.utc).isoformat(),
            "evaluation": "per-flight (held-out 20% passengers, on their actual flight/cabin)",
            "n_eval_users": n_users,
            "waste_signal_methods_observed": method_counter,
            "sweep": sweep,
            "paired_significance_0.0_vs_0.2": sig,
            "scipy_available": _HAVE_SCIPY,
            "notes": (
                "adj = sim*(1+WASTE_WEIGHT*wp); only WASTE_WEIGHT varies. Metrics use the "
                "project's own ndcg_at_k/precision_at_k/recall_at_k. Per-user arrays drive "
                "a PAIRED test (same users, two conditions). With large n, a significant "
                "p-value may still be a practically small effect; report effect size AND "
                "significance together. Production WASTE_WEIGHT stays 0.20 (unchanged)."
            ),
        }

        RESULTS_DIR.mkdir(parents=True, exist_ok=True)
        (RESULTS_DIR / "exp1_full_results.json").write_text(
            json.dumps(out, indent=2), encoding="utf-8"
        )

        # sweep table (md)
        lines = ["# Experiment 1 (complete) + WW sweep\n",
                 f"Run: {out['run_at']}  ·  n_eval_users: {n_users}",
                 f"Waste methods: {method_counter}",
                 f"Significance: {sig['ndcg'].get('significance_method')}\n",
                 "| WASTE_WEIGHT | NDCG@10 | Precision@5 | Recall@10 | Mean Top-10 waste |",
                 "|---|---|---|---|---|"]
        for ww in SWEEP_WEIGHTS:
            r = sweep[f"WW={ww}"]
            lines.append(f"| {ww} | {r['ndcg_at_10']} | {r['precision_at_5']} | "
                         f"{r['recall_at_10']} | {r['mean_top10_predicted_waste']} |")
        lines.append("\n## Paired significance (0.0 vs 0.2), per user\n")
        lines.append("| Metric | mean A | mean B | mean Δ | 95% CI | t | p (t) | p (Wilcoxon) |")
        lines.append("|---|---|---|---|---|---|---|---|")
        name = {"ndcg":"NDCG@10","prec":"Precision@5","rec":"Recall@10","waste":"Top-10 waste"}
        for k in ("ndcg","prec","rec","waste"):
            s = sig[k]
            ci = f"[{s.get('ci95_low')}, {s.get('ci95_high')}]"
            lines.append(f"| {name[k]} | {s.get('mean_A')} | {s.get('mean_B')} | "
                         f"{s.get('mean_diff')} | {ci} | {s.get('t_stat')} | "
                         f"{s.get('t_pvalue')} | {s.get('wilcoxon_pvalue')} |")
        (RESULTS_DIR / "exp1_full_results.md").write_text("\n".join(lines), encoding="utf-8")

        print("=== Experiment 1 (full) complete ===")
        print(f"n_eval_users = {n_users}")
        print(f"waste methods = {method_counter}")
        print(f"scipy available = {_HAVE_SCIPY}")
        print(json.dumps(sweep, indent=2))
        print("paired significance (0.0 vs 0.2):")
        print(json.dumps(sig, indent=2))
        print(f"\nOutputs -> {RESULTS_DIR}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
