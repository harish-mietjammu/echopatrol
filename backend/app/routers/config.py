from fastapi import APIRouter, Query
from pydantic import BaseModel, Field
from typing import List

from ..database import get_db
from ..models import EdgeConfig

router = APIRouter(prefix="/api/v1", tags=["config"])


class ConfigUpdate(BaseModel):
    audio_threshold_db: float = Field(..., ge=0, le=200)
    vibration_threshold_g: float = Field(..., ge=0, le=20)
    cooldown_seconds: int = Field(..., ge=1, le=60)
    active_frequency_range: List[int]


DEFAULTS = EdgeConfig(device_id="__default__")


async def _load(device_id: str) -> EdgeConfig:
    db = await get_db()
    try:
        async with db.execute(
            "SELECT * FROM device_configs WHERE device_id = ?", (device_id,)
        ) as cur:
            row = await cur.fetchone()
    finally:
        await db.close()
    if row is None:
        return EdgeConfig(device_id=device_id)
    return EdgeConfig(
        device_id=device_id,
        audio_threshold_db=row["audio_threshold_db"],
        vibration_threshold_g=row["vibration_threshold_g"],
        cooldown_seconds=row["cooldown_seconds"],
        active_frequency_range=[row["active_freq_low"], row["active_freq_high"]],
    )


@router.get("/config", response_model=EdgeConfig)
async def get_edge_configuration(device_id: str = Query(...)):
    return await _load(device_id)


@router.put("/config", response_model=EdgeConfig)
async def update_edge_configuration(device_id: str, update: ConfigUpdate):
    low, high = update.active_frequency_range[0], update.active_frequency_range[-1]
    db = await get_db()
    try:
        await db.execute(
            """
            INSERT INTO device_configs (
                device_id, audio_threshold_db, vibration_threshold_g,
                cooldown_seconds, active_freq_low, active_freq_high
            ) VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(device_id) DO UPDATE SET
                audio_threshold_db=excluded.audio_threshold_db,
                vibration_threshold_g=excluded.vibration_threshold_g,
                cooldown_seconds=excluded.cooldown_seconds,
                active_freq_low=excluded.active_freq_low,
                active_freq_high=excluded.active_freq_high,
                updated_at=datetime('now')
            """,
            (
                device_id,
                update.audio_threshold_db,
                update.vibration_threshold_g,
                update.cooldown_seconds,
                low,
                high,
            ),
        )
        await db.commit()
    finally:
        await db.close()
    return await _load(device_id)
