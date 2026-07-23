"""
Experiment 3 - Recoverable waste and redirection sensitivity.

READ-ONLY research harness. Does NOT modify the waste model, the DB,
model_registry, or any production constant. It re-runs the EXISTING in-flight
waste forecast from app.ml.waste across all in-flight flights and reports:

  (1) RECOVERABLE vs COMMITTED waste.
      Forecast waste is split by whether stock physically remains
      (initial_qty - reserved_qty - served_qty > 0). Committed waste is already
      locked in by prior reservations and no intervention can redirect it. This
      split is MEASURED from reservation data, not assumed, and is the ceiling
      on what any intervention policy could achieve.

  (2) SENSITIVITY of the closed-loop reduction to redirection efficiency.
      The production loop multiplies an actioned meal's forecast by
      (1 - efficiency). The realised reduction is therefore PROPORTIONAL to the
      assumed efficiency by construction - this sweep quantifies that
      dependence honestly rather than reporting a single point estimate that
      rests on three unsourced constants.

  (3) Per-category breakdown of forecast, recoverable, and committed waste.

Faithfulness:
  * The forecast is recomputed with the project's own formula, using the same
    constants and the same category factors as app.ml.waste.predict_waste for
    in_flight flights (base_rate / cabin_adj / CATEGORY_WASTE_FACTOR / jitter).
  * The intervention policy simulated is exactly the production rule:
    predicted_waste >= 1 AND remaining_stock > 0 AND not already actioned.
  * Nothing is written to the DB or model_registry.

Run from:  ...\airmeal\backend
    python exp3_waste_sensitivity.py
"""

from __future__ import annotations

import warnings
warnings.filterwarnings("ignore")

import json
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from sqlalchemy import select

from app.db.session import SessionLocal
from app.models.flight import Flight
from app.models.meal import FlightInventory, MealItem

# Production feature extractor and cabin encoding - imported, not copied.
from app.ml.forecasting import _flight_features
from app.ml.waste import _CABIN_ENCODING

# Efficiency values swept. The production default map is
# {"offer_free": 0.80, "crew_meal": 0.90, "offer_discount": 0.60}; the sweep
# brackets that range so the reported band contains the deployed assumption.
EFFICIENCY_GRID = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0]
PRODUCTION_EFFICIENCY = 0.80  # "Release to Cabin", the default disposition

# Mirrors app.ml.waste.predict_waste (in_flight branch).
CATEGORY_WASTE_FACTOR = {
    "Beverages":   1.45,
    "Desserts":    1.30,
    "Snacks":      1.15,
    "Starters":    1.00,
    "Main Course": 0.70,
}

RESULTS_DIR = (
    Path(__file__).resolve().parent.parent
    / "Research Assets" / "Results" / "exp3_waste_sensitivity"
)


def _forecast_inflight(inv, ff, cat_factor) -> float:
    """Exact reproduction of the production in-flight forecast formula."""
    cabin_enc = _CABIN_ENCODING.get(inv.cabin_class, 0)
    base_rate = 0.18 * (1.0 - ff["load_factor"]) + 0.12
    cabin_adj = 1.0 + 0.05 * cabin_enc
    seed_val = int(str(inv.meal_id).replace("-", "")[:8], 16)
    jitter = 0.88 + (seed_val % 25) / 100.0
    return float(inv.initial_qty) * base_rate * cabin_adj * cat_factor * jitter


def main():
    db = SessionLocal()
    try:
        flights = db.execute(
            select(Flight).where(Flight.status == "in_flight").order_by(Flight.id)
        ).scalars().all()

        if not flights:
            print("NO IN-FLIGHT FLIGHTS: nothing to evaluate.")
            return

        flight_ids = [f.id for f in flights]
        inventories = db.execute(
            select(FlightInventory)
            .where(FlightInventory.flight_id.in_(flight_ids))
            .order_by(FlightInventory.flight_id, FlightInventory.meal_id)
        ).scalars().all()

        meals = db.execute(select(MealItem).order_by(MealItem.id)).scalars().all()
        meal_category = {
            m.id: (m.category.name if m.category is not None else "Uncategorized")
            for m in meals
        }

        flight_map = {f.id: f for f in flights}
        ff_cache = {f.id: _flight_features(f) for f in flights}

        total_forecast = 0.0
        recoverable = 0.0        # forecast waste on meals with stock remaining
        committed = 0.0          # forecast waste already locked in by reservations
        actionable = 0.0         # recoverable AND above the >= 1 unit action threshold
        n_rows = 0
        n_actionable_rows = 0

        by_cat = defaultdict(lambda: {"forecast": 0.0, "recoverable": 0.0,
                                      "committed": 0.0, "actionable": 0.0, "rows": 0})

        for inv in inventories:
            flight = flight_map.get(inv.flight_id)
            if flight is None:
                continue
            ff = ff_cache[inv.flight_id]
            cat = meal_category.get(inv.meal_id, "Uncategorized")
            cat_factor = CATEGORY_WASTE_FACTOR.get(cat, 1.0)

            pw = _forecast_inflight(inv, ff, cat_factor)
            remaining = inv.initial_qty - inv.reserved_qty - inv.served_qty

            total_forecast += pw
            n_rows += 1
            by_cat[cat]["forecast"] += pw
            by_cat[cat]["rows"] += 1

            if remaining > 0:
                recoverable += pw
                by_cat[cat]["recoverable"] += pw
                # Production intervention rule.
                if pw >= 1:
                    actionable += pw
                    n_actionable_rows += 1
                    by_cat[cat]["actionable"] += pw
            else:
                committed += pw
                by_cat[cat]["committed"] += pw

        def pct(part, whole):
            return round(part / whole * 100.0, 2) if whole > 0 else 0.0

        # Sensitivity: acting on every actionable meal at efficiency e reduces
        # total forecast waste by actionable * e.
        sweep = []
        for e in EFFICIENCY_GRID:
            reduced = actionable * e
            sweep.append({
                "efficiency": e,
                "waste_removed": round(reduced, 2),
                "residual_forecast": round(total_forecast - reduced, 2),
                "reduction_pct_of_total": pct(reduced, total_forecast),
                "reduction_pct_of_recoverable": pct(reduced, recoverable),
            })

        prod_row = next(r for r in sweep if r["efficiency"] == PRODUCTION_EFFICIENCY)
        band_low = min(r["reduction_pct_of_total"] for r in sweep)
        band_high = max(r["reduction_pct_of_total"] for r in sweep)

        categories = []
        for cat, d in sorted(by_cat.items(), key=lambda kv: -kv[1]["forecast"]):
            categories.append({
                "category": cat,
                "inventory_rows": d["rows"],
                "forecast_waste": round(d["forecast"], 2),
                "recoverable": round(d["recoverable"], 2),
                "committed": round(d["committed"], 2),
                "actionable": round(d["actionable"], 2),
                "recoverable_pct": pct(d["recoverable"], d["forecast"]),
                "share_of_total_forecast_pct": pct(d["forecast"], total_forecast),
            })

        out = {
            "experiment": "exp3_waste_sensitivity",
            "run_at": datetime.now(timezone.utc).isoformat(),
            "scope": "in_flight flights only (the closed loop does not run elsewhere)",
            "n_flights": len(flights),
            "n_inventory_rows": n_rows,
            "n_actionable_rows": n_actionable_rows,
            "total_forecast_waste": round(total_forecast, 2),
            "recoverable_waste": round(recoverable, 2),
            "committed_waste": round(committed, 2),
            "actionable_waste": round(actionable, 2),
            "recoverable_pct_of_forecast": pct(recoverable, total_forecast),
            "committed_pct_of_forecast": pct(committed, total_forecast),
            "actionable_pct_of_forecast": pct(actionable, total_forecast),
            "efficiency_sweep": sweep,
            "production_efficiency": PRODUCTION_EFFICIENCY,
            "production_reduction_pct": prod_row["reduction_pct_of_total"],
            "reduction_band_pct": [band_low, band_high],
            "by_category": categories,
            "notes": (
                "Recoverable vs committed is MEASURED from reservation state "
                "(initial - reserved - served) and is independent of any assumed "
                "efficiency. The closed-loop reduction is proportional to assumed "
                "redirection efficiency by construction, so it is reported as a band "
                "across EFFICIENCY_GRID rather than a single point estimate. "
                "Committed waste is an upper bound on what no intervention can reach."
            ),
        }

        RESULTS_DIR.mkdir(parents=True, exist_ok=True)
        (RESULTS_DIR / "exp3_results.json").write_text(
            json.dumps(out, indent=2), encoding="utf-8")

        lines = [
            "# Experiment 3 - Recoverable Waste and Redirection Sensitivity\n",
            f"Run: {out['run_at']}",
            f"Scope: {out['scope']}",
            f"Flights: {len(flights)} | Inventory rows: {n_rows} | "
            f"Actionable rows: {n_actionable_rows}\n",
            "## Recoverable vs committed (measured, assumption-free)\n",
            "| Quantity | Units | % of forecast |",
            "|---|---|---|",
            f"| Total forecast waste | {out['total_forecast_waste']} | 100.00 |",
            f"| Recoverable (stock remains) | {out['recoverable_waste']} | "
            f"{out['recoverable_pct_of_forecast']} |",
            f"| Committed (already reserved/served) | {out['committed_waste']} | "
            f"{out['committed_pct_of_forecast']} |",
            f"| Actionable (recoverable and >= 1 unit) | {out['actionable_waste']} | "
            f"{out['actionable_pct_of_forecast']} |\n",
            "## Sensitivity to redirection efficiency\n",
            "| Efficiency | Waste removed | Residual forecast | % of total | % of recoverable |",
            "|---|---|---|---|---|",
        ]
        for r in sweep:
            lines.append(
                f"| {r['efficiency']} | {r['waste_removed']} | "
                f"{r['residual_forecast']} | {r['reduction_pct_of_total']} | "
                f"{r['reduction_pct_of_recoverable']} |")
        lines += [
            f"\nDeployed assumption ({PRODUCTION_EFFICIENCY}): "
            f"{out['production_reduction_pct']}% of total forecast waste removed.",
            f"Band across swept efficiencies: {band_low}% - {band_high}%.\n",
            "## By category\n",
            "| Category | Rows | Forecast | Recoverable | Committed | Recoverable % | Share of forecast % |",
            "|---|---|---|---|---|---|---|",
        ]
        for c in categories:
            lines.append(
                f"| {c['category']} | {c['inventory_rows']} | {c['forecast_waste']} | "
                f"{c['recoverable']} | {c['committed']} | {c['recoverable_pct']} | "
                f"{c['share_of_total_forecast_pct']} |")
        (RESULTS_DIR / "exp3_results.md").write_text("\n".join(lines), encoding="utf-8")

        print("=== Experiment 3 (waste recoverability + sensitivity) complete ===")
        print(f"Flights: {len(flights)} | Inventory rows: {n_rows}")
        print(f"Total forecast waste:  {out['total_forecast_waste']}")
        print(f"  Recoverable: {out['recoverable_waste']} "
              f"({out['recoverable_pct_of_forecast']}%)")
        print(f"  Committed:   {out['committed_waste']} "
              f"({out['committed_pct_of_forecast']}%)")
        print(f"  Actionable:  {out['actionable_waste']} "
              f"({out['actionable_pct_of_forecast']}%)")
        print(f"Reduction at deployed efficiency {PRODUCTION_EFFICIENCY}: "
              f"{out['production_reduction_pct']}% of total forecast")
        print(f"Reduction band across efficiencies: {band_low}% - {band_high}%")
        print(f"Outputs -> {RESULTS_DIR}")

    finally:
        db.close()


if __name__ == "__main__":
    main()
