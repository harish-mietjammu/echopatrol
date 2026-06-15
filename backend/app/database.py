import aiosqlite
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent / "echopatrol.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS incidents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    audio_db REAL NOT NULL,
    vibration_g REAL NOT NULL,
    peak_frequency_hz REAL NOT NULL,
    license_plate_text TEXT NOT NULL,
    confidence_score REAL NOT NULL,
    image_url TEXT NOT NULL,
    needs_review INTEGER NOT NULL DEFAULT 0,
    cluster_id INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_incidents_device ON incidents(device_id);
CREATE INDEX IF NOT EXISTS idx_incidents_timestamp ON incidents(timestamp);
CREATE INDEX IF NOT EXISTS idx_incidents_review ON incidents(needs_review);

CREATE TABLE IF NOT EXISTS device_configs (
    device_id TEXT PRIMARY KEY,
    audio_threshold_db REAL NOT NULL,
    vibration_threshold_g REAL NOT NULL,
    cooldown_seconds INTEGER NOT NULL,
    active_freq_low INTEGER NOT NULL,
    active_freq_high INTEGER NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
"""


async def init_db() -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.executescript(SCHEMA)
        await db.commit()


async def get_db() -> aiosqlite.Connection:
    db = await aiosqlite.connect(DB_PATH)
    db.row_factory = aiosqlite.Row
    return db
