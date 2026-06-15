"""Server-side spike clustering.

Per spec §3.2: if multiple consecutive spikes occur within an ultra-tight
temporal window, group matching telemetry entries into a single master
incident. We key by (device_id, license_plate_text) within CLUSTER_WINDOW
seconds and attach the cluster_id of the first incident in the window.
"""
from datetime import datetime, timedelta
from typing import Optional
import aiosqlite

CLUSTER_WINDOW_SECONDS = 8


def _parse_ts(ts: str) -> datetime:
    return datetime.fromisoformat(ts.replace("Z", "+00:00"))


async def resolve_cluster_id(
    db: aiosqlite.Connection,
    device_id: str,
    license_plate_text: str,
    timestamp: str,
) -> Optional[int]:
    try:
        ts = _parse_ts(timestamp)
    except ValueError:
        return None

    window_start = (ts - timedelta(seconds=CLUSTER_WINDOW_SECONDS)).isoformat()

    async with db.execute(
        """
        SELECT id, cluster_id, timestamp FROM incidents
        WHERE device_id = ? AND license_plate_text = ?
          AND timestamp >= ?
        ORDER BY timestamp DESC
        LIMIT 1
        """,
        (device_id, license_plate_text, window_start),
    ) as cur:
        row = await cur.fetchone()

    if row is None:
        return None
    return row["cluster_id"] if row["cluster_id"] is not None else row["id"]
