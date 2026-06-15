"""Local SQLite queue implementing the spec §3.1 offline buffering pipeline."""
import sqlite3
import json
from pathlib import Path
from contextlib import contextmanager

QUEUE_PATH = Path(__file__).resolve().parent / "edge_queue.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS outbox (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    payload TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt_at REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_outbox_next ON outbox(next_attempt_at);
"""


@contextmanager
def _conn():
    c = sqlite3.connect(QUEUE_PATH)
    c.row_factory = sqlite3.Row
    try:
        yield c
        c.commit()
    finally:
        c.close()


def init() -> None:
    with _conn() as c:
        c.executescript(SCHEMA)


def enqueue(payload: dict) -> int:
    with _conn() as c:
        cur = c.execute(
            "INSERT INTO outbox (payload) VALUES (?)",
            (json.dumps(payload),),
        )
        return cur.lastrowid


def next_due(now_ts: float, limit: int = 10):
    with _conn() as c:
        cur = c.execute(
            "SELECT id, payload, attempts FROM outbox "
            "WHERE next_attempt_at <= ? ORDER BY id ASC LIMIT ?",
            (now_ts, limit),
        )
        return [(r["id"], json.loads(r["payload"]), r["attempts"]) for r in cur.fetchall()]


def ack(id_: int) -> None:
    with _conn() as c:
        c.execute("DELETE FROM outbox WHERE id = ?", (id_,))


def defer(id_: int, attempts: int, next_attempt_at: float) -> None:
    with _conn() as c:
        c.execute(
            "UPDATE outbox SET attempts = ?, next_attempt_at = ? WHERE id = ?",
            (attempts, next_attempt_at, id_),
        )


def depth() -> int:
    with _conn() as c:
        return c.execute("SELECT COUNT(*) FROM outbox").fetchone()[0]
