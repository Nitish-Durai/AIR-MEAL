# Experiment 3 - Recoverable Waste and Redirection Sensitivity

Run: 2026-07-23T11:33:41.774330+00:00
Scope: in_flight flights only (the closed loop does not run elsewhere)
Flights: 19 | Inventory rows: 2094 | Actionable rows: 214

## Recoverable vs committed (measured, assumption-free)

| Quantity | Units | % of forecast |
|---|---|---|
| Total forecast waste | 1220.3 | 100.00 |
| Recoverable (stock remains) | 913.56 | 74.86 |
| Committed (already reserved/served) | 306.74 | 25.14 |
| Actionable (recoverable and >= 1 unit) | 324.87 | 26.62 |

## Sensitivity to redirection efficiency

| Efficiency | Waste removed | Residual forecast | % of total | % of recoverable |
|---|---|---|---|---|
| 0.5 | 162.43 | 1057.87 | 13.31 | 17.78 |
| 0.6 | 194.92 | 1025.38 | 15.97 | 21.34 |
| 0.7 | 227.41 | 992.89 | 18.64 | 24.89 |
| 0.8 | 259.89 | 960.41 | 21.3 | 28.45 |
| 0.9 | 292.38 | 927.92 | 23.96 | 32.0 |
| 1.0 | 324.87 | 895.43 | 26.62 | 35.56 |

Deployed assumption (0.8): 21.3% of total forecast waste removed.
Band across swept efficiencies: 13.31% - 26.62%.

## By category

| Category | Rows | Forecast | Recoverable | Committed | Recoverable % | Share of forecast % |
|---|---|---|---|---|---|---|
| Beverages | 663 | 482.89 | 360.99 | 121.9 | 74.76 | 39.57 |
| Desserts | 363 | 240.83 | 195.53 | 45.3 | 81.19 | 19.74 |
| Snacks | 357 | 198.21 | 124.53 | 73.68 | 62.83 | 16.24 |
| Starters | 347 | 166.32 | 136.89 | 29.43 | 82.31 | 13.63 |
| Main Course | 364 | 132.05 | 95.62 | 36.43 | 72.41 | 10.82 |