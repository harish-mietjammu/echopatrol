from fastapi import APIRouter
from typing import List, Dict, Any

from ..database import get_db

router = APIRouter(prefix="/api/v1", tags=["devices"])


@router.get("/devices")
async def list_devices() -> List[Dict[str, Any]]:
    """Devices derived from incident traffic + last-seen + active config (if any)."""
    db = await get_db()
    try:
        async with db.execute(
            """
            SELECT i.device_id,
                   COUNT(*) AS incident_count,
                   MAX(i.timestamp) AS last_seen,
                   SUM(CASE WHEN i.timestamp >= datetime('now','-1 day') THEN 1 ELSE 0 END) AS last_24h,
                   c.audio_threshold_db,
                   c.vibration_threshold_g,
                   c.cooldown_seconds
            FROM incidents i
            LEFT JOIN device_configs c ON c.device_id = i.device_id
            GROUP BY i.device_id
            ORDER BY last_seen DESC
            """
        ) as cur:
            rows = await cur.fetchall()
    finally:
        await db.close()
    return [dict(r) for r in rows]
