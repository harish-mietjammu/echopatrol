from fastapi import APIRouter, Query
from typing import List, Dict, Any

from ..database import get_db

router = APIRouter(prefix="/api/v1/analytics", tags=["analytics"])


@router.get("/summary")
async def summary() -> Dict[str, Any]:
    db = await get_db()
    try:
        async with db.execute("SELECT COUNT(*) AS c FROM incidents") as q:
            total = (await q.fetchone())["c"]
        async with db.execute(
            "SELECT COUNT(*) AS c FROM incidents WHERE needs_review = 1"
        ) as q:
            pending_review = (await q.fetchone())["c"]
        async with db.execute(
            "SELECT AVG(audio_db) AS a, AVG(vibration_g) AS v FROM incidents"
        ) as q:
            avg_row = await q.fetchone()
        async with db.execute(
            """SELECT COUNT(*) AS c FROM incidents
               WHERE timestamp >= datetime('now','-1 day')"""
        ) as q:
            last_24h = (await q.fetchone())["c"]
    finally:
        await db.close()

    return {
        "total_incidents": total,
        "pending_review": pending_review,
        "incidents_last_24h": last_24h,
        "avg_audio_db": round(avg_row["a"] or 0.0, 2),
        "avg_vibration_g": round(avg_row["v"] or 0.0, 3),
    }


@router.get("/timeseries")
async def timeseries(bucket_minutes: int = Query(60, ge=5, le=1440)) -> List[Dict[str, Any]]:
    """Audio + vibration averages bucketed by time, for the dashboard line chart."""
    db = await get_db()
    try:
        # SQLite trick: round seconds-since-epoch into bucket-sized chunks
        async with db.execute(
            f"""
            SELECT
              strftime('%Y-%m-%dT%H:%M:00Z',
                       datetime((strftime('%s', timestamp) /
                                ({bucket_minutes}*60)) * ({bucket_minutes}*60), 'unixepoch')
              ) AS bucket,
              COUNT(*) AS count,
              AVG(audio_db) AS avg_audio_db,
              AVG(vibration_g) AS avg_vibration_g,
              MAX(audio_db) AS peak_audio_db
            FROM incidents
            WHERE timestamp >= datetime('now','-7 day')
            GROUP BY bucket
            ORDER BY bucket ASC
            """
        ) as q:
            rows = await q.fetchall()
    finally:
        await db.close()
    return [dict(r) for r in rows]


@router.get("/heatmap")
async def heatmap() -> List[Dict[str, Any]]:
    """Spatial heatmap matrix: violation count per device per hour-of-day."""
    db = await get_db()
    try:
        async with db.execute(
            """
            SELECT device_id,
                   CAST(strftime('%H', timestamp) AS INTEGER) AS hour,
                   COUNT(*) AS count
            FROM incidents
            GROUP BY device_id, hour
            ORDER BY device_id, hour
            """
        ) as q:
            rows = await q.fetchall()
    finally:
        await db.close()
    return [dict(r) for r in rows]
