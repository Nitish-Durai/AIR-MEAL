"""Metric computation utilities for AirMeal ML models.

All functions return real computed numbers — never hardcoded constants.
If evaluation cannot be performed (insufficient data), return None.
"""

from __future__ import annotations

import math
from typing import Optional


def dcg_at_k(relevances: list[float], k: int) -> float:
    """Discounted Cumulative Gain at k."""
    total = 0.0
    for i, rel in enumerate(relevances[:k]):
        total += rel / math.log2(i + 2)  # +2 because positions are 1-indexed
    return total


def ndcg_at_k(recommended: list, relevant_set: set, k: int = 10) -> float:
    """
    NDCG@k for a single user.

    Parameters
    ----------
    recommended : ordered list of item IDs returned by the model
    relevant_set: set of item IDs the user actually interacted with positively
    k           : cutoff
    """
    relevances = [1.0 if item in relevant_set else 0.0 for item in recommended[:k]]
    actual_dcg = dcg_at_k(relevances, k)

    # Ideal DCG: rank all relevant items first
    ideal_relevances = sorted(relevances, reverse=True)
    ideal_dcg = dcg_at_k(ideal_relevances, k)

    if ideal_dcg == 0.0:
        return 0.0
    return actual_dcg / ideal_dcg


def precision_at_k(recommended: list, relevant_set: set, k: int = 5) -> float:
    """Precision@k for a single user."""
    top_k = recommended[:k]
    if not top_k:
        return 0.0
    hits = sum(1 for item in top_k if item in relevant_set)
    return hits / len(top_k)


def recall_at_k(recommended: list, relevant_set: set, k: int = 10) -> float:
    """Recall@k for a single user."""
    if not relevant_set:
        return 0.0
    hits = sum(1 for item in recommended[:k] if item in relevant_set)
    return hits / len(relevant_set)


def mean_ndcg(
    user_recommendations: list[tuple[list, set]], k: int = 10
) -> Optional[float]:
    """
    Mean NDCG@k over all users.

    Parameters
    ----------
    user_recommendations : list of (recommended_ids, relevant_ids_set)
    """
    if not user_recommendations:
        return None
    scores = [ndcg_at_k(rec, rel, k) for rec, rel in user_recommendations]
    return round(sum(scores) / len(scores), 4)


def mean_precision(
    user_recommendations: list[tuple[list, set]], k: int = 5
) -> Optional[float]:
    if not user_recommendations:
        return None
    scores = [precision_at_k(rec, rel, k) for rec, rel in user_recommendations]
    return round(sum(scores) / len(scores), 4)


def mean_recall(
    user_recommendations: list[tuple[list, set]], k: int = 10
) -> Optional[float]:
    if not user_recommendations:
        return None
    scores = [recall_at_k(rec, rel, k) for rec, rel in user_recommendations]
    return round(sum(scores) / len(scores), 4)


def regression_metrics(
    y_true: list[float], y_pred: list[float]
) -> Optional[dict[str, float]]:
    """
    Compute MAE, RMSE, and MAPE for regression outputs.

    Returns None if inputs are empty or mismatched.
    """
    if not y_true or not y_pred or len(y_true) != len(y_pred):
        return None

    n = len(y_true)
    mae = sum(abs(t - p) for t, p in zip(y_true, y_pred)) / n
    rmse = math.sqrt(sum((t - p) ** 2 for t, p in zip(y_true, y_pred)) / n)

    # MAPE: skip zero targets to avoid division by zero
    nonzero = [(t, p) for t, p in zip(y_true, y_pred) if t != 0.0]
    mape = (
        (sum(abs(t - p) / abs(t) for t, p in nonzero) / len(nonzero) * 100.0)
        if nonzero
        else None
    )

    return {
        "mae":  round(mae, 4),
        "rmse": round(rmse, 4),
        "mape": round(mape, 2) if mape is not None else None,
    }


def psi(
    baseline: list[float],
    current: list[float],
    n_bins: int = 10,
) -> Optional[float]:
    """
    Population Stability Index — simple feature-drift estimate.

    Returns None if either distribution is empty.
    """
    if not baseline or not current:
        return None

    import numpy as np  # deferred import — only needed when PSI is called
    b = np.array(baseline, dtype=float)
    c = np.array(current, dtype=float)

    min_v, max_v = b.min(), b.max()
    if min_v == max_v:
        return 0.0

    bins = np.linspace(min_v, max_v, n_bins + 1)
    b_counts, _ = np.histogram(b, bins=bins)
    c_counts, _ = np.histogram(c, bins=bins)

    eps = 1e-6
    b_pct = (b_counts + eps) / (len(b) + eps * n_bins)
    c_pct = (c_counts + eps) / (len(c) + eps * n_bins)

    psi_value = float(np.sum((b_pct - c_pct) * np.log(b_pct / c_pct)))
    return round(psi_value, 4)
