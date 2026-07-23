# Experiment 3 - Recoverable Waste and Redirection Sensitivity

Run: 2026-07-23T07:05:44.595004+00:00
Scope: in_flight flights only (the closed loop does not run elsewhere)
Flights: 19 | Inventory rows: 2094 | Actionable rows: 2058

## Recoverable vs committed (measured, assumption-free)

| Quantity | Units | % of forecast |
|---|---|---|
| Total forecast waste | 7443.75 | 100.00 |
| Recoverable (stock remains) | 7414.81 | 99.61 |
| Committed (already reserved/served) | 28.95 | 0.39 |
| Actionable (recoverable and >= 1 unit) | 7389.16 | 99.27 |

## Sensitivity to redirection efficiency

| Efficiency | Waste removed | Residual forecast | % of total | % of recoverable |
|---|---|---|---|---|
| 0.5 | 3694.58 | 3749.17 | 49.63 | 49.83 |
| 0.6 | 4433.49 | 3010.26 | 59.56 | 59.79 |
| 0.7 | 5172.41 | 2271.34 | 69.49 | 69.76 |
| 0.8 | 5911.33 | 1532.43 | 79.41 | 79.72 |
| 0.9 | 6650.24 | 793.51 | 89.34 | 89.69 |
| 1.0 | 7389.16 | 54.6 | 99.27 | 99.65 |

Deployed assumption (0.8): 79.41% of total forecast waste removed.
Band across swept efficiencies: 49.63% - 99.27%.

## By category

| Category | Rows | Forecast | Recoverable | Committed | Recoverable % | Share of forecast % |
|---|---|---|---|---|---|---|
| Beverages | 663 | 2929.65 | 2923.28 | 6.36 | 99.78 | 39.36 |
| Desserts | 363 | 1465.06 | 1465.06 | 0.0 | 100.0 | 19.68 |
| Snacks | 357 | 1219.16 | 1207.08 | 12.07 | 99.01 | 16.38 |
| Starters | 347 | 1014.97 | 1014.97 | 0.0 | 100.0 | 13.64 |
| Main Course | 364 | 814.92 | 804.41 | 10.51 | 98.71 | 10.95 |