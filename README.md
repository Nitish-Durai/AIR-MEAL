# AirMeal

AI-assisted onboard airline food & beverage distribution system.  
Single-machine research demo — Next.js 15 frontend · FastAPI backend · PostgreSQL 16.

---

## Prerequisites

| Tool | Version |
|------|---------|
| Docker Desktop | 4.x+ (for Postgres) |
| Python | 3.11+ |
| Node.js | 18+ |
| npm | 9+ |

---

## First-time setup

### 1. Clone and enter the project

```bash
cd airmeal
```

### 2. Copy environment files

```bash
# Root (docker-compose credentials)
copy .env.example .env

# Backend
copy backend\.env.example backend\.env

# Frontend
copy frontend\.env.local.example frontend\.env.local
```

### 3. Install backend dependencies

```bash
cd backend
pip install -r requirements.txt
cd ..
```

### 4. Install frontend dependencies

```bash
cd frontend
npm install
cd ..
```

---

## Run order (every session)

Run each command in its own terminal tab/window, **in this order**:

### Terminal 1 — Database

```bash
# From: airmeal/
docker compose up -d
```

Wait until `docker compose ps` shows `airmeal_db` as **healthy**.

```bash
docker compose ps
```

### Terminal 2 — Backend

```bash
# From: airmeal/backend/
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Verify: `GET http://localhost:8000/health` → `{"status":"ok"}`

### Terminal 3 — Frontend

```bash
# From: airmeal/frontend/
npm run dev
```

Open: http://localhost:3000  
The landing page will show **"API Connected"** (green) when the backend is reachable.

---

## Database migrations (Phase 1+)

```bash
# From: airmeal/backend/
alembic upgrade head
```

---

## Seed data (Phase 3+)

```bash
# From: airmeal/backend/
python -m app.ml.data_gen --flights 50 --seed 42
```

Use `--reset` to wipe and re-seed:

```bash
python -m app.ml.data_gen --flights 50 --seed 42 --reset
```

---

## Demo script (15-minute flow — available after Phase 9)

1. **Admin** — log in → create a flight → load inventory (CSV) → assign crew → trigger AI retrain → confirm computed metrics appear on model card.
2. **Passenger** — register → complete dietary wizard → browse menu → see AI recommendations → place an order → watch live tracking.
3. **Crew** — log in → see the incoming order as a prioritised task → refresh route (ACO sequence updates) → mark delivered → confirm passenger tracking flips to "Delivered".

---

## Architecture notes

- **No microservices, no cloud.** One FastAPI process, one Next.js dev server, one Postgres container.
- **ML stack:** LightGBM (demand forecast + waste), NumPy cosine similarity (recommender), ACO (crew routing). All models train locally and store artifacts in `backend/app/ml/artifacts/` (gitignored).
- **Allergen safety** is enforced server-side at order placement — the frontend filter is UX-only.
- **Metrics** (NDCG, MAE, waste %, etc.) are computed at runtime from trained models and real data. They are never hardcoded.

### Future work (explicitly out of scope for this demo)
Microservices split · Kafka · Kubernetes · AWS · MongoDB · Redis · Kong · React Native crew app · Federated learning · Edge/ONNX quantization · pgvector.
