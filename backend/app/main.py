from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import socketio
from pathlib import Path

from .database import init_db
from .routers import violations, config, analytics, devices, cameras
from .websocket_manager import sio
from .audio_levels import manager as level_manager


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    level_manager.start_all()
    try:
        yield
    finally:
        level_manager.stop_all()


app = FastAPI(
    title="EchoPatrol Backend Receiver",
    description="Vehicle Excessive Noise & Vibration Detection — Ingestion Layer (V3 spec)",
    version="3.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(violations.router)
app.include_router(config.router)
app.include_router(analytics.router)
app.include_router(devices.router)
app.include_router(cameras.router)

EVIDENCE_DIR = Path(__file__).resolve().parent.parent / "evidence"
EVIDENCE_DIR.mkdir(exist_ok=True)
app.mount("/evidence", StaticFiles(directory=EVIDENCE_DIR), name="evidence")


@app.get("/health")
async def health():
    return {"status": "ok", "service": "echopatrol-backend", "version": "3.0.0"}


asgi = socketio.ASGIApp(sio, other_asgi_app=app, socketio_path="/socket.io")
