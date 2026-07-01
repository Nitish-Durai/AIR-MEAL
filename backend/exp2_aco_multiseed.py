"""
Experiment 2 — ACO multi-seed evaluation.

READ-ONLY research harness. Does NOT modify the routing algorithm, the DB,
model_registry, or any production constant. It re-runs the EXISTING evaluation
logic from app.ml.routing across 10 independent random seeds and reports the
distribution of route-cost improvement and priority-violation reduction.

Faithfulness:
  * Cost, distance, baseline, and violation counting all use the project's own
    functions imported from app.ml.routing (_tour_cost, _seat_distance,
    _parse_seat, ACO_* hyperparameters).
  * The ONLY thing that changes per run is the ACO random seed. The flight/task
    sample is deterministic in evaluate() (flights ranked by completed-task count;
    first EVAL_MAX_TASKS_PER_FLIGHT tasks), so it is held constant across seeds.
    Reported variance is therefore ACO stochasticity only, not sampling noise.

Run from:  ...\airmeal\backend
    python exp2_aco_multiseed.py
"""

from __future__ import annotations

import warnings
warnings.filterwarnings("ignore")

import json
import math
import uuid
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from sqlalchemy import select

from app.db.session import SessionLocal
from app.models.delivery import DeliveryTask, DeliveryStatus
from app.models.order import PassengerOrder

# Import the project's REAL routing primitives (read-only).
from app.ml.routing import (
    _tour_cost,
    _seat_distance,
    _parse_seat,
    ACO_ANTS,
    ACO_ITERATIONS,
    ACO_ALPHA,
    ACO_BETA,
    ACO_RHO,
    ACO_Q,
    EVAL_MAX_FLIGHTS,
    EVAL_MAX_TASKS_PER_FLIGHT,
)

SEEDS = [42, 43, 44, 45, 46, 47, 48, 49, 50, 51]  # 10 independent seeds

RESULTS_DIR = (
    Path(__file__).resolve().parent.parent
    / "Research Assets" / "Results" / "exp2_aco_multiseed"
)


def _aco_route_seeded(seat_numbers, priority_scores, seed):
    """
    EXACT copy of app.ml.routing.aco_route, with the only change being that the
    RNG seed is a parameter instead of the hardcoded 42. All cost/heuristic math
    is identical; _tour_cost and _seat_distance are the project's own functions.
    """
    n = len(seat_numbers)
    if n == 0:
        return []
    if n == 1:
        return [0]

    dist = np.zeros((n, n))
    for i in range(n):
        for j in range(n):
            dist[i][j] = _seat_distance(seat_numbers[i], seat_numbers[j]) if i != j else 0.0

    eps = 1e-9
    heuristic = np.zeros((n, n))
    for i in range(n):
        for j in range(n):
            if i != j:
                d = dist[i][j] if dist[i][j] > 0 else eps
                heuristic[i][j] = (1.0 / d) * (1.0 + priority_scores[j] / 10.0)

    pheromone = np.ones((n, n))
    best_tour = list(range(n))
    best_cost = _tour_cost(best_tour, dist, priority_scores)

    rng = np.random.default_rng(seed)   # <-- ONLY change vs production

    for _ in range(ACO_ITERATIONS):
        all_tours, all_costs = [], []
        for _ant in range(ACO_ANTS):
            start = int(rng.integers(0, n))
            visited = {start}
            tour = [start]
            while len(tour) < n:
                current = tour[-1]
                unvisited = [j for j in range(n) if j not in visited]
                if not unvisited:
                    break
                scores = np.array([
                    (pheromone[current][j] ** ACO_ALPHA) *
                    (heuristic[current][j] ** ACO_BETA)
                    for j in unvisited
                ])
                total = scores.sum()
                probs = (np.ones(len(unvisited)) / len(unvisited)
                         if total == 0 else scores / total)
                next_node = int(rng.choice(unvisited, p=probs))
                tour.append(next_node)
                visited.add(next_node)
            cost = _tour_cost(tour, dist, priority_scores)
            all_tours.append(tour)
            all_costs.append(cost)
            if cost < best_cost:
                best_cost = cost
                best_tour = tour[:]
        pheromone *= (1 - ACO_RHO)
        for tour, cost in zip(all_tours, all_costs):
            deposit = ACO_Q / (cost + eps)
            for k in range(len(tour) - 1):
                i, j = tour[k], tour[k + 1]
                pheromone[i][j] += deposit
                pheromone[j][i] += deposit
    return best_tour


def _count_violations(order, priority_scores):
    return sum(
        1 for k in range(len(order) - 1)
        if priority_scores[order[k + 1]] > priority_scores[order[k]]
    )


def _evaluate_for_seed(flight_data_list, seed):
    """Replicates evaluate()'s aggregation for one seed over the fixed sample."""
    sum_aco_cost = sum_base_cost = 0.0
    sum_aco_viol = sum_base_viol = 0
    total_tasks = 0

    for flight_data in flight_data_list:
        n = len(flight_data)
        if n == 0:
            continue
        seat_numbers = [t.seat_number or "Y1A" for t, _ in flight_data]
        priority_scores = [o.priority_score for _, o in flight_data]

        aco_order = _aco_route_seeded(seat_numbers, priority_scores, seed)
        baseline_order = sorted(range(n), key=lambda i: _parse_seat(seat_numbers[i]))

        dist_matrix = np.zeros((n, n))
        for i in range(n):
            for j in range(n):
                dist_matrix[i][j] = _seat_distance(seat_numbers[i], seat_numbers[j])

        sum_aco_cost += _tour_cost(aco_order, dist_matrix, priority_scores)
        sum_base_cost += _tour_cost(baseline_order, dist_matrix, priority_scores)
        sum_aco_viol += _count_violations(aco_order, priority_scores)
        sum_base_viol += _count_violations(baseline_order, priority_scores)
        total_tasks += n

    cost_impr = (round((sum_base_cost - sum_aco_cost) / sum_base_cost * 100.0, 2)
                 if sum_base_cost > 0 else 0.0)
    viol_red = (round((sum_base_viol - sum_aco_viol) / sum_base_viol * 100.0, 2)
                if sum_base_viol > 0 else 0.0)
    return {
        "seed": seed,
        "aco_tour_cost": round(sum_aco_cost, 2),
        "baseline_tour_cost": round(sum_base_cost, 2),
        "cost_improvement_pct": cost_impr,
        "aco_priority_violations": sum_aco_viol,
        "baseline_priority_violations": sum_base_viol,
        "violation_reduction_pct": viol_red,
        "n_tasks_evaluated": total_tasks,
    }


def main():
    db = SessionLocal()
    try:
        # Build the SAME deterministic sample evaluate() uses, ONCE.
        rows = db.execute(
            select(DeliveryTask, PassengerOrder)
            .join(PassengerOrder, DeliveryTask.order_id == PassengerOrder.id)
            .where(DeliveryTask.status == DeliveryStatus.completed.value)
        ).all()

        if len(rows) < 5:
            print("INSUFFICIENT DATA: fewer than 5 completed delivery tasks.")
            return

        flight_tasks = {}
        for task, order in rows:
            flight_tasks.setdefault(order.flight_id, []).append((task, order))

        sorted_flights = sorted(flight_tasks.keys(),
                                key=lambda fid: len(flight_tasks[fid]), reverse=True)
        sampled = sorted_flights[:EVAL_MAX_FLIGHTS]
        flight_data_list = [flight_tasks[fid][:EVAL_MAX_TASKS_PER_FLIGHT] for fid in sampled]
        n_flights = len(sampled)

        # Run every seed over the identical sample.
        per_seed = [_evaluate_for_seed(flight_data_list, s) for s in SEEDS]

        cost_vals = [r["cost_improvement_pct"] for r in per_seed]
        viol_vals = [r["violation_reduction_pct"] for r in per_seed]

        def summarize(vals):
            arr = np.array(vals, dtype=float)
            n = len(arr)
            mean = float(arr.mean())
            sd = float(arr.std(ddof=1)) if n > 1 else 0.0
            se = sd / math.sqrt(n) if n > 1 else 0.0
            return {
                "mean": round(mean, 3),
                "std": round(sd, 3),
                "min": round(float(arr.min()), 2),
                "max": round(float(arr.max()), 2),
                "ci95_low": round(mean - 1.96 * se, 3),
                "ci95_high": round(mean + 1.96 * se, 3),
                "n_seeds": n,
            }

        out = {
            "experiment": "exp2_aco_multiseed",
            "run_at": datetime.now(timezone.utc).isoformat(),
            "seeds": SEEDS,
            "n_flights_evaluated": n_flights,
            "n_tasks_evaluated": per_seed[0]["n_tasks_evaluated"] if per_seed else 0,
            "sample_is_fixed_across_seeds": True,
            "baseline_is_deterministic": True,
            "cost_improvement_pct": summarize(cost_vals),
            "violation_reduction_pct": summarize(viol_vals),
            "per_seed": per_seed,
            "notes": (
                "Re-runs app.ml.routing evaluation across 10 seeds. Only the ACO RNG "
                "seed varies; flight/task sample and baseline are identical every run, "
                "so reported variance is ACO stochasticity alone. Cost/distance/violation "
                "math uses the project's own imported functions. Nothing written to DB or "
                "model_registry; production seed (42) and constants unchanged. Seed 42 row "
                "should reproduce the registry's single-run figures."
            ),
        }

        RESULTS_DIR.mkdir(parents=True, exist_ok=True)
        (RESULTS_DIR / "exp2_results.json").write_text(
            json.dumps(out, indent=2), encoding="utf-8")

        c, v = out["cost_improvement_pct"], out["violation_reduction_pct"]
        lines = [
            "# Experiment 2 — ACO Multi-Seed Evaluation (RESULTS)\n",
            f"Run: {out['run_at']}",
            f"Seeds: {SEEDS}",
            f"Flights evaluated: {n_flights} · Tasks: {out['n_tasks_evaluated']} "
            f"· sample fixed across seeds (variance = ACO stochasticity only)\n",
            "## Summary\n",
            "| Metric | Mean | Std | 95% CI | Min | Max |",
            "|---|---|---|---|---|---|",
            f"| Route-cost improvement (%) | {c['mean']} | {c['std']} | "
            f"[{c['ci95_low']}, {c['ci95_high']}] | {c['min']} | {c['max']} |",
            f"| Priority-violation reduction (%) | {v['mean']} | {v['std']} | "
            f"[{v['ci95_low']}, {v['ci95_high']}] | {v['min']} | {v['max']} |\n",
            "## Per-seed results\n",
            "| Seed | Cost impr. (%) | Violation red. (%) | ACO cost | Baseline cost |",
            "|---|---|---|---|---|",
        ]
        for r in per_seed:
            lines.append(
                f"| {r['seed']} | {r['cost_improvement_pct']} | "
                f"{r['violation_reduction_pct']} | {r['aco_tour_cost']} | "
                f"{r['baseline_tour_cost']} |")
        (RESULTS_DIR / "exp2_results.md").write_text("\n".join(lines), encoding="utf-8")

        print("=== Experiment 2 (ACO multi-seed) complete ===")
        print(f"Flights: {n_flights} · Tasks: {out['n_tasks_evaluated']} · Seeds: {len(SEEDS)}")
        print(f"Route-cost improvement: mean {c['mean']}% ± {c['std']} "
              f"(95% CI [{c['ci95_low']}, {c['ci95_high']}])")
        print(f"Violation reduction:    mean {v['mean']}% ± {v['std']} "
              f"(95% CI [{v['ci95_low']}, {v['ci95_high']}])")
        print(f"Outputs -> {RESULTS_DIR}")

    finally:
        db.close()


if __name__ == "__main__":
    main()
