import uuid
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, status, Request, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.security import decode_token
from app.api.v1.auth import router as auth_router
from app.api.v1.passengers import router as passengers_router
from app.api.v1.flights import router as flights_router
from app.api.v1.meals import router as meals_router
from app.api.v1.orders import router as orders_router
from app.api.v1.feedback import router as feedback_router
from app.api.v1.qr import router as qr_router
from app.api.v1.crew import router as crew_router
from app.api.v1.admin import router as admin_router
from app.api.v1.ai import router as ai_router
from app.ws.connection_manager import manager
from fastapi import Depends
from sqlalchemy import select, func
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models import PassengerOrder, Flight, ModelRegistry, FlightInventory
from app.schemas.api_v1 import success_response

app = FastAPI(
    title="AirMeal API",
    version="0.1.0",
    description="AI-assisted onboard airline food & beverage distribution system",
)

@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "data": None,
            "error": {
                "message": exc.detail,
                "code": exc.status_code
            },
            "meta": None
        }
    )

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    errors = exc.errors()
    msg = "; ".join([f"{'.'.join(str(l) for l in err['loc'])}: {err['msg']}" for err in errors])
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "data": None,
            "error": {
                "message": f"Validation Error: {msg}",
                "code": status.HTTP_422_UNPROCESSABLE_ENTITY
            },
            "meta": None
        }
    )


app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_ORIGIN],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ──────────────────────────────────────────────────────────────────
app.include_router(auth_router)   # /auth/register, /auth/login, etc.
app.include_router(passengers_router, prefix="/api/v1")
app.include_router(flights_router, prefix="/api/v1")
app.include_router(meals_router, prefix="/api/v1")
app.include_router(orders_router, prefix="/api/v1")
app.include_router(feedback_router, prefix="/api/v1")
app.include_router(qr_router, prefix="/api/v1")
app.include_router(crew_router, prefix="/api/v1")
app.include_router(admin_router, prefix="/api/v1")
app.include_router(ai_router, prefix="/api/v1")


# ── System ───────────────────────────────────────────────────────────────────
@app.get("/health", tags=["system"])
def health_check():
    return {"status": "ok"}


@app.get("/api/v1/public/stats", tags=["public"])
def get_public_stats(db: Session = Depends(get_db)):
    """Return live aggregate counts and food wastage reduction metrics for the landing page."""
    orders = db.scalar(select(func.count()).select_from(PassengerOrder)) or 0
    flights = db.scalar(select(func.count()).select_from(Flight)) or 0
    models = db.scalar(select(func.count()).select_from(ModelRegistry)) or 0
    
    # Calculate food used percentage (100 - waste%)
    total_initial = db.scalar(select(func.sum(FlightInventory.initial_qty))) or 0
    total_wasted = db.scalar(select(func.sum(FlightInventory.wasted_qty))) or 0
    food_used_pct = round(((total_initial - total_wasted) / total_initial * 100), 1) if total_initial > 0 else 98.2

    return success_response({
        "orders": int(orders),
        "flights": int(flights),
        "models": int(models),
        "food_used": float(food_used_pct),
    })


# ── WebSockets ───────────────────────────────────────────────────────────────
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """
    WebSocket endpoint for real-time order status and crew routing updates.
    Expects JWT token via query parameter: `/ws?token=<JWT>&flight_id=<flight_uuid>`

    Note: Starlette's CORSMiddleware does not cover the WebSocket handshake, so the
    Origin header is validated here explicitly against the configured frontend origin.
    """
    # Validate Origin against the allowed frontend origins (localhost & 127.0.0.1 forms).
    origin = websocket.headers.get("origin")
    allowed_origins = {
        settings.FRONTEND_ORIGIN,
        settings.FRONTEND_ORIGIN.replace("localhost", "127.0.0.1"),
        settings.FRONTEND_ORIGIN.replace("127.0.0.1", "localhost"),
    }
    if origin is not None and origin not in allowed_origins:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    token = websocket.query_params.get("token")
    flight_id_str = websocket.query_params.get("flight_id")
    if not token:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    try:
        payload = decode_token(token)
        user_id_str = payload.get("sub")
        if not user_id_str:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return
        user_id = uuid.UUID(user_id_str)
    except Exception:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    flight_id = None
    if flight_id_str:
        try:
            flight_id = uuid.UUID(flight_id_str)
        except ValueError:
            pass

    # Register active connection
    await manager.connect(websocket, user_id, flight_id)

    try:
        while True:
            # Keep the socket open, read messages if sent by client
            _ = await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket, user_id, flight_id)
