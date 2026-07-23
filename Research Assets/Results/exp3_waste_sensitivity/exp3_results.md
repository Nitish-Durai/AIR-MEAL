# Experiment 3 - Recoverable Waste and Redirection Sensitivity

Run: 2026-07-23T07:36:08.264601+00:00
Scope: in_flight flights only (the closed loop does not run elsewhere)
Flights: 19 | Inventory rows: 2094 | Actionable rows: 179

## Recoverable vs committed (measured, assumption-free)

| Quantity | Units | % of forecast |
|---|---|---|
| Total forecast waste | 1220.3 | 100.00 |
| Recoverable (stock remains) | 811.45 | 66.5 |
| Committed (already reserved/served) | 408.85 | 33.5 |
| Actionable (recoverable and >= 1 unit) | 277.88 | 22.77 |

## Sensitivity to redirection efficiency

| Efficiency | Waste removed | Residual forecast | % of total | % of recoverable |
|---|---|---|---|---|
| 0.5 | 138.94 | 1081.36 | 11.39 | 17.12 |
| 0.6 | 166.73 | 1053.57 | 13.66 | 20.55 |
| 0.7 | 194.52 | 1025.79 | 15.94 | 23.97 |
| 0.8 | 222.3 | 998.0 | 18.22 | 27.4 |
| 0.9 | 250.09 | 970.21 | 20.49 | 30.82 |
| 1.0 | 277.88 | 942.42 | 22.77 | 34.24 |

Deployed assumption (0.8): 18.22% of total forecast waste removed.
Band across swept efficiencies: 11.39% - 22.77%.

## By category

| Category | Rows | Forecast | Recoverable | Committed | Recoverable % | Share of forecast % |
|---|---|---|---|---|---|---|
| Beverages | 663 | 482.89 | 306.1 | 176.79 | 63.39 | 39.57 |
| Desserts | 363 | 240.83 | 179.53 | 61.3 | 74.55 | 19.74 |
| Snacks | 357 | 198.21 | 113.04 | 85.17 | 57.03 | 16.24 |
| Starters | 347 | 166.32 | 133.1 | 33.22 | 80.03 | 13.63 |
| Main Course | 364 | 132.05 | 79.69 | 52.37 | 60.34 | 10.82 |