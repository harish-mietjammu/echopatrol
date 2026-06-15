# EchoPatrol

**Vehicle Excessive Noise & Vibration Detection — Backend Receiver & Analytics Dashboard (V3)**

A reference implementation of the V3 software spec: a decoupled edge → ingestion → presentation pipeline with offline-tolerant edge nodes, an async FastAPI receiver, and a real-time React dashboard.

```
┌────────────┐  HTTP+SQLite-outbox   ┌────────────┐  WebSocket   ┌──────────────┐
│ Edge Node  │ ────────────────────▶ │ FastAPI    │ ───────────▶ │ React +      │
│ (simulator)│  GET /config dynamic  │ + SQLite   │   /socket.io │ Tailwind UI  │
└────────────┘                       └────────────┘              └──────────────┘
```

## Layout
- [backend/](backend/) — FastAPI app, Socket.IO server, SQLite persistence, analytics & devices endpoints
- [frontend/](frontend/) — React + Vite + Tailwind dashboard (Live Ops with rate chart / severity donut / top offenders, Incidents browser, Devices with per-row sparklines, Analytics)
- [edge_simulator/](edge_simulator/) — Synthetic edge device with local outbox and exponential-backoff flusher

---

## Prerequisites

| Tool | Tested version | Notes |
|---|---|---|
| Python | 3.11–3.14 | Native-extension deps use `>=` pins so 3.14 wheels are picked up automatically |
| Node | 18+ (22 tested) | npm 10+ |
| OS | Windows 11 (paths shown), macOS / Linux work with shell-appropriate `cd` |

---

## Quick start — daily startup (3 terminals)

Once first-time setup (below) is done, every subsequent session is just these three commands in three separate terminals:

**Terminal 1 — Backend**
```powershell
d:\EchoPatrol\backend\.venv\Scripts\python.exe d:\EchoPatrol\backend\run.py
```

**Terminal 2 — Dashboard**
```powershell
cd d:\EchoPatrol\frontend
npm run dev
```

**Terminal 3 — Edge simulator** (generates traffic)
```powershell
d:\EchoPatrol\backend\.venv\Scripts\python.exe d:\EchoPatrol\edge_simulator\simulator.py --device EDGE_NODE_JAMMU_01 --rate 4
```

Open **<http://localhost:5173>** in the browser. The dashboard should immediately show the WebSocket "LIVE" indicator (sidebar footer) and start receiving events from the simulator.

To see multi-device behaviour, open additional terminals with different `--device` names (e.g. `EDGE_NODE_JAMMU_02`).

---

## First-time setup (one-off per machine)

### 1. Backend
```powershell
cd d:\EchoPatrol\backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python run.py
```
- REST docs: <http://localhost:8000/docs>
- Health: <http://localhost:8000/health>
- WebSocket path: `/socket.io`

### 2. Dashboard
```powershell
cd d:\EchoPatrol\frontend
npm install
npm run dev
```
Vite proxies `/api` and `/socket.io` to the backend.

### 3. Edge simulator
The simulator reuses the backend's venv (so `httpx` is already installed):
```powershell
d:\EchoPatrol\backend\.venv\Scripts\python.exe -m pip install -r d:\EchoPatrol\edge_simulator\requirements.txt
```

---

## Edge simulator flags

```
--device <NAME>       Edge node identifier (default: EDGE_NODE_JAMMU_01)
--server <URL>        Backend base URL          (default: http://localhost:8000)
--rate <N>            Sensor polls per second   (default: 3.0)
```

**Resilience demo:** start the simulator → stop the backend (`Ctrl-C`) → watch stdout show `defer #N retry_in=Xs` as the local SQLite outbox grows. Restart the backend; the flusher drains the queue with exponential backoff (`ack #N (attempt M)`) and the dashboard immediately repopulates.

---

## Where everything is in the running system

| URL | What |
|---|---|
| `http://localhost:5173/`          | **Live Ops** — metric strip, rate chart, severity donut, top offenders, tabbed feed (Live / Review) with search/filter/sort/pagination/export |
| `http://localhost:5173/incidents` | Historical browser with filters |
| `http://localhost:5173/devices`   | Per-device rows with live sparkline (dB + g), LIVE / ONLINE / STALE status |
| `http://localhost:5173/analytics` | 7-day trend chart + spatial heatmap |
| `http://localhost:8000/docs`      | Interactive OpenAPI / Swagger UI for the backend |
| `http://localhost:8000/health`    | Backend health check |

Theme toggle (light / dark) is in the sidebar footer; preference persists across reloads.

---

## What this implements from the V3 spec

| Spec section | Implementation |
|---|---|
| §2 Tech stack | FastAPI, Pydantic, Socket.IO, SQLite (proto), React, TailwindCSS, Recharts |
| §3.1 Edge offline queueing | [edge_simulator/local_queue.py](edge_simulator/local_queue.py) + flusher with exponential backoff; only deletes on HTTP 201 |
| §3.2 Hardware lockout | `cooldown_until` gate in [edge_simulator/simulator.py](edge_simulator/simulator.py) |
| §3.2 Server clustering | [backend/app/clustering.py](backend/app/clustering.py) attaches `cluster_id` for spikes within an 8s window |
| §3.3 Split telemetry/image | Payload carries `image_url` only; raw upload would target object storage (the `/evidence` mount is the local-dev stand-in) |
| §4.1 `POST /api/v1/violations` | [backend/app/routers/violations.py](backend/app/routers/violations.py) |
| §4.2 `GET /api/v1/config` | [backend/app/routers/config.py](backend/app/routers/config.py) with overrideable per-device thresholds |
| §5.1 Live alert feed | [frontend/src/pages/LiveOps.jsx](frontend/src/pages/LiveOps.jsx) + [IncidentRow](frontend/src/components/IncidentRow.jsx) driven by Socket.IO `violation:new` |
| §5.1 Spatial heatmap | [frontend/src/components/Heatmap.jsx](frontend/src/components/Heatmap.jsx) — device × hour-of-day matrix on the Analytics page |
| §5.1 OCR confidence gating | Backend tags `needs_review` when `confidence_score < 0.80`; UI routes those to the Manual Review Queue tab |

---

## Troubleshooting

**Backend won't start — pydantic-core / Pillow build fails.**
You're on Python 3.14 and `requirements.txt` was hard-pinned. Already fixed (loose `>=` pins) — re-run `pip install -r requirements.txt`.

**Dashboard shows `class does not exist` after editing colors.**
Tailwind's JIT cache went stale. Stop Vite (`Ctrl-C`), then `npm run dev` again.

**Port 5173 / 8000 already in use.**
Old node/uvicorn process didn't release the port. PowerShell:
```powershell
Get-NetTCPConnection -State Listen -LocalPort 5173,8000 | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

**Simulator says `defer ... All connection attempts failed`.**
The backend is down. Either start it, or let the simulator demonstrate the §3.1 offline-queue resilience — it will drain on its own once the backend is back.

---

## Production swaps the spec calls out
- SQLite → PostgreSQL (change `DB_PATH` and swap the `aiosqlite` driver for `asyncpg` + SQLAlchemy)
- Local `evidence/` mount → S3 / MinIO bucket; backend stores the returned object URI only
- CORS `*` → an allow-list of operator dashboard origins
