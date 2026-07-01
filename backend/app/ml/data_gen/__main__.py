"""CLI entry point for the AirMeal synthetic data generator.

Usage
-----
  python -m app.ml.data_gen [options]

Examples
--------
  # Default run (50 flights, 5000 passengers, 61 meals, seed=42)
  python -m app.ml.data_gen

  # Custom scale
  python -m app.ml.data_gen --flights 20 --passengers 1000 --meals 40 --seed 7

  # Reset and regenerate (idempotent — same seed always gives same data)
  python -m app.ml.data_gen --reset --seed 42
"""

import argparse
import sys
import time

from app.db.session import SessionLocal
from app.ml.data_gen import generate


def _print_table(stats: dict) -> None:
    print("\n+-------------------------+----------+")
    print("| Table                   |    Rows  |")
    print("+-------------------------+----------+")
    for table, count in stats.items():
        print(f"| {table:<23}  | {count:>7,} |")
    print("+-------------------------+----------+")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="AirMeal synthetic data generator",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument("--flights",    type=int, default=50,
                        help="Number of flights to generate")
    parser.add_argument("--passengers", type=int, default=5000,
                        help="Number of passenger accounts")
    parser.add_argument("--meals",      type=int, default=61,
                        help="Number of meal items (max 61)")
    parser.add_argument("--seed",       type=int, default=42,
                        help="NumPy RNG seed (same seed → identical data)")
    parser.add_argument("--reset",      action="store_true",
                        help="TRUNCATE all tables before generating")

    args = parser.parse_args()

    print("=" * 52)
    print("  AirMeal Synthetic Data Generator")
    print("=" * 52)

    t0 = time.perf_counter()
    with SessionLocal() as db:
        try:
            stats = generate(
                db,
                n_flights=args.flights,
                n_passengers=args.passengers,
                n_meals=args.meals,
                seed=args.seed,
                reset=args.reset,
            )
        except RuntimeError as exc:
            print(f"\n[ERROR] {exc}", file=sys.stderr)
            sys.exit(1)

    elapsed = time.perf_counter() - t0
    _print_table(stats)
    print(f"\nOK Done in {elapsed:.1f}s  (seed={args.seed})")
    print("  All synthetic passengers -> password: airmeal123")
    print("  All synthetic crew       -> password: crew123")


if __name__ == "__main__":
    main()
