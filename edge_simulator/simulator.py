"""EchoPatrol edge node simulator.

Implements the spec §3 behaviours:
  - Detection loop with audio/vibration thresholds pulled from the server's
    GET /api/v1/config endpoint (dynamic remote thresholds).
  - Hardware lockout timer (cooldown_seconds) preventing duplicate triggers
    for the same vehicle pass.
  - Local SQLite outbox: telemetry is always written locally first; a
    background flusher posts to the server with exponential backoff and
    clears entries only on HTTP 201.

Run:
  python simulator.py --device EDGE_NODE_JAMMU_01 --rate 3
"""
import argparse
import asyncio
import random
import time
from datetime import datetime, timezone

import httpx

import local_queue as q

PLATES = ["JK02BY8765", "JK01AB1234", "DL3CAB1010", "HR26X9988", "PB10QQ4242"]


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def synthesize_reading() -> tuple[float, float, float]:
    """Mostly-quiet ambient with occasional loud bursts."""
    if random.random() < 0.30:
        audio_db = random.uniform(88, 108)
        vibration_g = random.uniform(1.3, 3.1)
    else:
        audio_db = random.uniform(55, 82)
        vibration_g = random.uniform(0.1, 1.0)
    freq = random.uniform(30, 220)
    return round(audio_db, 1), round(vibration_g, 2), round(freq, 1)


def build_payload(device_id: str, audio_db: float, vibration_g: float, freq_hz: float) -> dict:
    plate = random.choice(PLATES)
    # OCR confidence sometimes drops below the 0.80 review threshold — exercises
    # the dashboard's Manual Review Queue routing path.
    confidence = round(random.uniform(0.55, 0.99), 2)
    return {
        "device_id": device_id,
        "timestamp": now_iso(),
        "metrics": {
            "audio_db": audio_db,
            "vibration_g": vibration_g,
            "peak_frequency_hz": freq_hz,
        },
        "evidence": {
            "license_plate_text": plate,
            "confidence_score": confidence,
            "image_url": f"https://storage.local/evidences/{plate}_{int(time.time())}.jpg",
        },
    }


async def fetch_config(client: httpx.AsyncClient, server: str, device_id: str) -> dict:
    try:
        r = await client.get(f"{server}/api/v1/config", params={"device_id": device_id}, timeout=5.0)
        r.raise_for_status()
        return r.json()
    except Exception:
        return {
            "audio_threshold_db": 85.0,
            "vibration_threshold_g": 1.2,
            "cooldown_seconds": 5,
            "active_frequency_range": [30, 60],
        }


async def detector_loop(device_id: str, rate_hz: float, stop: asyncio.Event):
    """Sensor-poll loop. Enqueues a payload whenever thresholds are crossed,
    honouring the cooldown lockout per spec §3.2."""
    period = 1.0 / max(0.1, rate_hz)
    cooldown_until = 0.0

    async with httpx.AsyncClient() as client:
        while not stop.is_set():
            cfg = await fetch_config(client, SERVER_URL, device_id)
            audio_db, vibration_g, freq = synthesize_reading()

            triggered = (
                audio_db >= cfg["audio_threshold_db"]
                or vibration_g >= cfg["vibration_threshold_g"]
            )
            if triggered and time.monotonic() >= cooldown_until:
                payload = build_payload(device_id, audio_db, vibration_g, freq)
                qid = q.enqueue(payload)
                cooldown_until = time.monotonic() + int(cfg["cooldown_seconds"])
                print(
                    f"[detect] enqueued #{qid} plate={payload['evidence']['license_plate_text']} "
                    f"{audio_db}dB / {vibration_g}g  (queue depth={q.depth()})"
                )

            await asyncio.sleep(period)


async def flusher_loop(server: str, stop: asyncio.Event):
    """Background uploader. Per spec §3.1 uses exponential backoff and only
    deletes the local row on receipt of HTTP 201."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        while not stop.is_set():
            due = q.next_due(time.time(), limit=20)
            if not due:
                await asyncio.sleep(1.0)
                continue
            for id_, payload, attempts in due:
                try:
                    r = await client.post(f"{server}/api/v1/violations", json=payload)
                    if r.status_code == 201:
                        q.ack(id_)
                        print(f"[flush]  ack  #{id_} (attempt {attempts + 1})")
                    else:
                        raise RuntimeError(f"HTTP {r.status_code}: {r.text[:120]}")
                except Exception as e:
                    attempts += 1
                    delay = min(60.0, 2.0 ** attempts) + random.uniform(0, 1.0)
                    q.defer(id_, attempts, time.time() + delay)
                    print(f"[flush]  defer #{id_} attempt={attempts} retry_in={delay:.1f}s ({e})")
            await asyncio.sleep(0.2)


SERVER_URL = "http://localhost:8000"


async def main():
    global SERVER_URL
    ap = argparse.ArgumentParser()
    ap.add_argument("--device", default="EDGE_NODE_JAMMU_01")
    ap.add_argument("--server", default="http://localhost:8000")
    ap.add_argument("--rate", type=float, default=3.0, help="sensor polls per second")
    args = ap.parse_args()
    SERVER_URL = args.server

    q.init()
    print(f"[edge] device={args.device} server={args.server} rate={args.rate}/s queue_depth={q.depth()}")

    stop = asyncio.Event()
    try:
        await asyncio.gather(
            detector_loop(args.device, args.rate, stop),
            flusher_loop(args.server, stop),
        )
    except KeyboardInterrupt:
        stop.set()


if __name__ == "__main__":
    asyncio.run(main())
