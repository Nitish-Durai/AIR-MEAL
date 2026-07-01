# Experiment 1 — Recommendation Ablation (RESULTS)

Run: 2026-06-26T16:19:34.973265+00:00
Evaluation: per-flight (held-out 20% passengers, on their actual flight/cabin)
Waste-signal methods observed: {'forecast_inflight': 1944, 'lightgbm': 3066}

| Metric | A (WW=0.00) | B (WW=0.20) | Δ (B−A) |
|---|---|---|---|
| NDCG@10 | 0.1891 | 0.1878 | -0.0013 |
| Precision@5 | 0.041 | 0.0405 | -0.0005 |
| Recall@10 | 0.2995 | 0.2983 | -0.0012 |
| Mean Top-10 predicted waste | 0.1276 | 0.1282 | 0.0006 |
| n_eval_users | 1279 | 1279 | (same split) |

Values produced by exp1_recommendation_ablation.py from live data. Not hand-edited.
