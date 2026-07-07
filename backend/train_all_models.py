"""One-time script: train/evaluate all four models against the configured DB.

Run once after a reseed so the model registry is populated. Uses the same
module functions the admin retrain endpoint uses.
"""
from app.db.session import SessionLocal
import app.ml.recommender as recommender_module
import app.ml.forecasting as forecasting_module
import app.ml.routing as routing_module
import app.ml.waste as waste_module


def main() -> None:
    db = SessionLocal()
    try:
        print("Training recommender…")
        r = recommender_module.train_and_evaluate(db)
        print("  ", r.get("metrics"))

        print("Training forecaster…")
        f = forecasting_module.train_and_evaluate(db)
        print("  ", f.get("metrics"))

        print("Training waste predictor…")
        w = waste_module.train_and_evaluate(db)
        print("  ", w.get("metrics"))

        print("Evaluating crew router…")
        c = routing_module.evaluate(db)
        print("  ", c.get("metrics"))

        db.commit()
        print("Done. All models trained and committed.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
