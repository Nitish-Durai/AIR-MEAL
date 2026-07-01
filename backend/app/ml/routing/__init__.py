"""Ant Colony Optimization (ACO) crew router for AirMeal.

Solves the cabin delivery routing problem: given a set of delivery tasks
(each with a seat location and priority), find an efficient traversal order.

The ACO implementation uses a simplified pheromone matrix over seat indices.
Priority penalties are applied to ensure high-priority seats are visited early.

Evaluation: compare service time and priority-violation rate vs. a front-to-back
baseline, computed on actual delivery task data. Results written to model_registry.
"""

from __future__ import annotations

import math
import uuid
from datetime import datetime, timezone
from typing import Optional

import numpy as np
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.delivery import DeliveryTask, DeliveryStatus
from app.models.ml import ModelRegistry
from app.models.order import PassengerOrder

MODEL_NAME = "crew_router"
MODEL_VERSION = "1.0.0"

# Priority weights matching the spec
PRIORITY_WEIGHTS = {
    "medical":         10,
    "first":           10,
    "infant":           8,
    "connecting":       7,
    "business":         7,
    "premium_economy":  4,
    "economy":          1,
}

# ACO hyperparameters (tuned for small cabin sizes)
ACO_ANTS = 20
ACO_ITERATIONS = 50
ACO_ALPHA = 1.0   # pheromone influence
ACO_BETA  = 2.0   # heuristic (distance + priority) influence
ACO_RHO   = 0.3   # pheromone evaporation rate
ACO_Q     = 100.0 # pheromone deposit constant

EVAL_MAX_FLIGHTS = 8      # number of flights to sample for evaluation
EVAL_MAX_TASKS_PER_FLIGHT = 60   # cap cabin size per flight to keep ACO fast


# ── Seat distance utilities ───────────────────────────────────────────────────

def _parse_seat(seat: str) -> tuple[int, int]:
    """Convert seat label like 'Y12A' → (row=12, col=0)."""
    col_map = {"A": 0, "B": 1, "C": 2, "D": 3, "E": 4, "F": 5}
    # Strip cabin prefix letter (F/J/Y) if present
    s = seat.strip().upper()
    col_char = s[-1]
    row_str  = s[1:-1] if s[0].isalpha() and not s[0].isdigit() else s[:-1]
    try:
        row = int(row_str)
    except ValueError:
        row = 1
    col = col_map.get(col_char, 0)
    return row, col


def _seat_distance(a: str, b: str) -> float:
    """Approximate physical distance between two seats (rows + aisle penalty)."""
    r1, c1 = _parse_seat(a)
    r2, c2 = _parse_seat(b)
    # 1 unit per row, 0.5 units per column (aisle crossing)
    return abs(r1 - r2) + 0.5 * abs(c1 - c2)


def _tour_cost(
    tour: list[int],
    dist_matrix: np.ndarray,
    priority_scores: list[float],
) -> float:
    """
    Total cost of a tour: total travel distance + priority violation penalty.

    Penalty: for each pair of adjacent tasks, if a lower-priority task precedes
    a higher-priority one, add the difference as a penalty.
    """
    total_dist = 0.0
    priority_penalty = 0.0
    for k in range(len(tour) - 1):
        i, j = tour[k], tour[k + 1]
        total_dist += dist_matrix[i][j]
        if priority_scores[j] > priority_scores[i]:
            priority_penalty += (priority_scores[j] - priority_scores[i]) * 2.0
    return total_dist + priority_penalty


def aco_route(
    seat_numbers: list[str],
    priority_scores: list[float],
) -> list[int]:
    """
    Run ACO to find an optimised delivery order.

    Parameters
    ----------
    seat_numbers    : seat labels for each task
    priority_scores : priority value for each task (higher = more urgent)

    Returns
    -------
    Ordered list of task indices (0-based) representing the delivery sequence.
    """
    n = len(seat_numbers)
    if n == 0:
        return []
    if n == 1:
        return [0]

    # Precompute distance matrix
    dist = np.zeros((n, n))
    for i in range(n):
        for j in range(n):
            dist[i][j] = _seat_distance(seat_numbers[i], seat_numbers[j]) if i != j else 0.0

    # Heuristic: inverse distance * priority advantage
    # Avoid division by zero for same-seat entries
    eps = 1e-9
    heuristic = np.zeros((n, n))
    for i in range(n):
        for j in range(n):
            if i != j:
                d = dist[i][j] if dist[i][j] > 0 else eps
                # Bias towards high-priority next stop
                heuristic[i][j] = (1.0 / d) * (1.0 + priority_scores[j] / 10.0)

    pheromone = np.ones((n, n))
    best_tour: list[int] = list(range(n))
    best_cost = _tour_cost(best_tour, dist, priority_scores)

    rng = np.random.default_rng(42)

    for _ in range(ACO_ITERATIONS):
        all_tours: list[list[int]] = []
        all_costs: list[float] = []

        for ant in range(ACO_ANTS):
            # Start from a random node
            start = int(rng.integers(0, n))
            visited = {start}
            tour = [start]

            while len(tour) < n:
                current = tour[-1]
                unvisited = [j for j in range(n) if j not in visited]
                if not unvisited:
                    break
                # Probability distribution over unvisited nodes
                scores = np.array([
                    (pheromone[current][j] ** ACO_ALPHA) *
                    (heuristic[current][j] ** ACO_BETA)
                    for j in unvisited
                ])
                total = scores.sum()
                if total == 0:
                    probs = np.ones(len(unvisited)) / len(unvisited)
                else:
                    probs = scores / total

                next_node = int(rng.choice(unvisited, p=probs))
                tour.append(next_node)
                visited.add(next_node)

            cost = _tour_cost(tour, dist, priority_scores)
            all_tours.append(tour)
            all_costs.append(cost)

            if cost < best_cost:
                best_cost = cost
                best_tour = tour[:]

        # Pheromone evaporation
        pheromone *= (1 - ACO_RHO)

        # Pheromone deposit
        for tour, cost in zip(all_tours, all_costs):
            deposit = ACO_Q / (cost + eps)
            for k in range(len(tour) - 1):
                i, j = tour[k], tour[k + 1]
                pheromone[i][j] += deposit
                pheromone[j][i] += deposit  # symmetric

    return best_tour


# ── Public endpoint function ───────────────────────────────────────────────────

def refresh_route(
    db: Session,
    flight_id: uuid.UUID,
    crew_id: Optional[uuid.UUID] = None,
) -> list[dict]:
    """
    Run ACO over pending/in-progress delivery tasks for a flight.

    Returns ordered task list with route_position assigned.
    """
    q = (
        select(DeliveryTask)
        .join(PassengerOrder, DeliveryTask.order_id == PassengerOrder.id)
        .where(
            PassengerOrder.flight_id == flight_id,
            DeliveryTask.status.in_([
                DeliveryStatus.pending.value,
                DeliveryStatus.in_progress.value,
            ]),
        )
    )
    if crew_id:
        q = q.where(DeliveryTask.crew_id == crew_id)

    tasks = db.execute(q).scalars().unique().all()
    if not tasks:
        return []

    # Load priority scores from orders
    order_ids = [t.order_id for t in tasks]
    orders = db.execute(
        select(PassengerOrder).where(PassengerOrder.id.in_(order_ids))
    ).scalars().all()
    priority_map: dict[uuid.UUID, float] = {o.id: o.priority_score for o in orders}

    # Map order_id -> cabin_class for grouping.
    cabin_map: dict[uuid.UUID, str] = {o.id: (o.cabin_class or "economy") for o in orders}
    # Group task indices by cabin.
    from collections import defaultdict
    by_cabin: dict[str, list[int]] = defaultdict(list)
    for idx, t in enumerate(tasks):
        by_cabin[cabin_map.get(t.order_id, "economy")].append(idx)
    results = []
    # Run ACO independently within each cabin; number positions per cabin.
    for cabin, idxs in by_cabin.items():
        seat_numbers = [tasks[i].seat_number or "Y1A" for i in idxs]
        priority_scores = [priority_map.get(tasks[i].order_id, 1.0) for i in idxs]
        optimised_order = aco_route(seat_numbers, priority_scores)
        for route_pos, local_idx in enumerate(optimised_order, start=1):
            task = tasks[idxs[local_idx]]
            task.route_position = route_pos
            results.append({
                "task_id":        str(task.id),
                "order_id":       str(task.order_id),
                "seat_number":    task.seat_number,
                "cabin_class":    cabin,
                "route_position": route_pos,
                "priority_score": priority_scores[local_idx],
                "status":         task.status,
            })
    db.commit()
    return results


# ── Evaluation ────────────────────────────────────────────────────────────────

def evaluate(db: Session) -> dict:
    """
    Compute service-time and priority-violation metrics vs. front-to-back baseline.

    Uses a per-flight, bounded-sample version of completed delivery tasks.
    """
    # Load all completed delivery tasks with their orders
    results = db.execute(
        select(DeliveryTask, PassengerOrder)
        .join(PassengerOrder, DeliveryTask.order_id == PassengerOrder.id)
        .where(DeliveryTask.status == DeliveryStatus.completed.value)
    ).all()

    if len(results) < 5:
        return _upsert_registry(db, status="trained", metrics=None)

    # Group the completed tasks by flight_id
    flight_tasks: dict[uuid.UUID, list[tuple[DeliveryTask, PassengerOrder]]] = {}
    for task, order in results:
        flight_tasks.setdefault(order.flight_id, []).append((task, order))

    # Select up to EVAL_MAX_FLIGHTS flights with the most completed tasks
    sorted_flights = sorted(
        flight_tasks.keys(),
        key=lambda fid: len(flight_tasks[fid]),
        reverse=True
    )
    sampled_flights = sorted_flights[:EVAL_MAX_FLIGHTS]

    sum_aco_cost = 0.0
    sum_baseline_cost = 0.0
    sum_aco_violations = 0
    sum_baseline_violations = 0
    total_tasks_evaluated = 0

    for fid in sampled_flights:
        flight_data = flight_tasks[fid][:EVAL_MAX_TASKS_PER_FLIGHT]
        n = len(flight_data)
        if n == 0:
            continue

        seat_numbers = [task.seat_number or "Y1A" for task, _ in flight_data]
        priority_scores = [order.priority_score for _, order in flight_data]

        # ACO tour
        aco_order = aco_route(seat_numbers, priority_scores)

        # Baseline: front-to-back (sort by seat row)
        baseline_order = sorted(
            range(n),
            key=lambda i: _parse_seat(seat_numbers[i]),
        )

        # Build distance matrix for this flight
        dist_matrix = np.zeros((n, n))
        for i in range(n):
            for j in range(n):
                dist_matrix[i][j] = _seat_distance(seat_numbers[i], seat_numbers[j])

        aco_cost = _tour_cost(aco_order, dist_matrix, priority_scores)
        baseline_cost = _tour_cost(baseline_order, dist_matrix, priority_scores)

        # Priority violations
        def _count_violations(order: list[int]) -> int:
            count = 0
            for k in range(len(order) - 1):
                if priority_scores[order[k + 1]] > priority_scores[order[k]]:
                    count += 1
            return count

        aco_violations = _count_violations(aco_order)
        baseline_violations = _count_violations(baseline_order)

        sum_aco_cost += aco_cost
        sum_baseline_cost += baseline_cost
        sum_aco_violations += aco_violations
        sum_baseline_violations += baseline_violations
        total_tasks_evaluated += n

    cost_improvement_pct = (
        round((sum_baseline_cost - sum_aco_cost) / sum_baseline_cost * 100.0, 2)
        if sum_baseline_cost > 0 else 0.0
    )
    violation_reduction_pct = (
        round((sum_baseline_violations - sum_aco_violations) / sum_baseline_violations * 100.0, 2)
        if sum_baseline_violations > 0 else 0.0
    )

    metrics = {
        "aco_tour_cost":             round(sum_aco_cost, 2),
        "baseline_tour_cost":        round(sum_baseline_cost, 2),
        "cost_improvement_pct":      cost_improvement_pct,
        "aco_priority_violations":   sum_aco_violations,
        "baseline_priority_violations": sum_baseline_violations,
        "violation_reduction_pct":   violation_reduction_pct,
        "n_tasks_evaluated":         total_tasks_evaluated,
        "n_flights_evaluated":       len(sampled_flights),
        "evaluated_at":              datetime.now(timezone.utc).isoformat(),
    }
    return _upsert_registry(db, status="ready", metrics=metrics)


def _upsert_registry(db: Session, status: str, metrics: Optional[dict]) -> dict:
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
