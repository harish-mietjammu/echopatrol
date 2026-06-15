"""Live camera audio relay.

IP cameras expose audio over RTSP (rtsp://…), which browsers cannot play
directly. This router spawns an `ffmpeg` subprocess per listener that pulls the
camera's RTSP stream, drops the video, and re-encodes the audio to a continuous
MP3 stream that an HTML5 <audio> element can play (internet-radio style).

The RTSP URL — which embeds camera credentials — stays server-side. The
dashboard only ever learns id/name/device_id and pulls audio through
GET /api/v1/cameras/{id}/audio.

Vibration sensors are not deployed yet; this gives the dashboard a live acoustic
feed in the meantime.
"""
import asyncio
import json
import subprocess
import threading
import time
from typing import Optional
from urllib.parse import urlparse

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from ..audio_levels import manager as level_manager
from ..camera_config import ffmpeg_input_args, is_mic, load_cameras, resolve_ffmpeg

router = APIRouter(prefix="/api/v1", tags=["cameras"])

# Wrap the shared loader so a malformed cameras.json surfaces as a clean 500.
def _load_cameras() -> dict:
    try:
        return load_cameras()
    except json.JSONDecodeError as exc:
        raise HTTPException(500, f"cameras.json is not valid JSON: {exc}")


_resolve_ffmpeg = resolve_ffmpeg


class CameraInfo(BaseModel):
    id: str
    name: str
    device_id: Optional[str] = None
    gate_type: Optional[str] = None


@router.get("/cameras", response_model=list[CameraInfo])
async def list_cameras():
    """Public camera roster — deliberately omits rtsp_url."""
    cams = _load_cameras()
    return [
        CameraInfo(
            id=c["id"],
            name=c.get("name", c["id"]),
            device_id=c.get("device_id"),
            gate_type=c.get("gate_type"),
        )
        for c in cams.values()
    ]


class AudioLevel(BaseModel):
    camera_id: str
    device_id: str
    status: str
    rms_dbfs: Optional[float] = None
    peak_dbfs: Optional[float] = None
    rms_linear: Optional[float] = None
    age_s: Optional[float] = None


@router.get("/cameras/levels", response_model=list[AudioLevel])
def camera_levels():
    """Live audio levels per camera, sampled continuously by the level monitor."""
    return level_manager.snapshot()


class PingResult(BaseModel):
    reachable: bool
    host: Optional[str] = None
    port: Optional[int] = None
    latency_ms: Optional[float] = None
    detail: Optional[str] = None


@router.get("/cameras/{camera_id}/ping", response_model=PingResult)
async def ping_camera(camera_id: str):
    """Reachability check: open a TCP connection to the camera's RTSP host:port.

    A TCP connect confirms the camera is actually serving (port open), which is
    more useful than an ICMP ping and works without elevated privileges.
    """
    cams = _load_cameras()
    cam = cams.get(camera_id)
    if cam is None:
        raise HTTPException(404, f"Unknown camera '{camera_id}'")
    if is_mic(cam):
        return PingResult(reachable=True, detail="local microphone (no network)")
    parsed = urlparse(cam.get("rtsp_url") or "")
    host, port = parsed.hostname, parsed.port or 554
    if not host:
        raise HTTPException(500, f"Camera '{camera_id}' rtsp_url has no host")

    start = time.perf_counter()
    try:
        reader, writer = await asyncio.wait_for(
            asyncio.open_connection(host, port), timeout=3
        )
        latency_ms = round((time.perf_counter() - start) * 1000, 1)
        writer.close()
        try:
            await writer.wait_closed()
        except OSError:
            pass
        return PingResult(reachable=True, host=host, port=port, latency_ms=latency_ms)
    except asyncio.TimeoutError:
        return PingResult(reachable=False, host=host, port=port, detail="timed out (3s)")
    except OSError as exc:
        return PingResult(reachable=False, host=host, port=port, detail=str(exc) or "unreachable")


def _ffmpeg_args(ffmpeg: str, cam: dict) -> list[str]:
    return [
        ffmpeg,
        "-loglevel", "error",
        *ffmpeg_input_args(cam, ffmpeg),   # RTSP camera or local mic
        "-vn",                      # drop video — audio only
        "-acodec", "libmp3lame",
        "-b:a", "128k",
        "-ac", "1",                 # mono is plenty for monitoring
        "-ar", "44100",
        "-f", "mp3",
        "-flush_packets", "1",      # push bytes out promptly for low latency
        "pipe:1",
    ]


def _terminate(proc: subprocess.Popen) -> None:
    if proc.poll() is None:
        proc.terminate()
        try:
            proc.wait(timeout=3)
        except subprocess.TimeoutExpired:
            proc.kill()


@router.get("/cameras/{camera_id}/audio")
def stream_camera_audio(camera_id: str):
    cams = _load_cameras()
    cam = cams.get(camera_id)
    if cam is None:
        raise HTTPException(404, f"Unknown camera '{camera_id}'")
    if not cam.get("rtsp_url") and not is_mic(cam):
        raise HTTPException(500, f"Camera '{camera_id}' has no source (rtsp_url or mic) configured")
    ffmpeg = _resolve_ffmpeg()
    if not ffmpeg:
        raise HTTPException(
            503,
            "ffmpeg could not be located. Install it (winget install Gyan.FFmpeg) "
            "or set the ECHO_FFMPEG env var to the ffmpeg.exe path.",
        )

    # Blocking Popen, NOT asyncio.create_subprocess_exec: under --reload uvicorn
    # runs on the Windows SelectorEventLoop, which cannot spawn asyncio
    # subprocesses (NotImplementedError). Plain Popen driven from Starlette's
    # threadpool (this is a sync endpoint) works on every loop and platform.
    proc = subprocess.Popen(
        _ffmpeg_args(ffmpeg, cam),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        bufsize=0,
    )

    # Drain stderr in a daemon thread so a chatty ffmpeg can't deadlock on a full
    # pipe, and so we can report *why* a stream failed to start.
    stderr_tail: list[bytes] = []

    def _drain():
        for line in proc.stderr:
            stderr_tail.append(line)
            del stderr_tail[:-20]  # keep only the last ~20 lines

    threading.Thread(target=_drain, daemon=True).start()

    # Read the first chunk up front so a dead stream (no audio track, bad creds,
    # unreachable camera) surfaces as a real HTTP error, not a silent empty 200.
    first = proc.stdout.read(4096)
    if not first:
        try:
            proc.wait(timeout=2)
        except subprocess.TimeoutExpired:
            pass
        _terminate(proc)
        err = b"".join(stderr_tail).decode(errors="replace").strip()
        raise HTTPException(502, f"Camera '{camera_id}' produced no audio: {err or 'no audio stream'}")

    def gen():
        try:
            yield first
            while True:
                chunk = proc.stdout.read(4096)
                if not chunk:
                    break
                yield chunk
        finally:
            _terminate(proc)

    return StreamingResponse(
        gen(),
        media_type="audio/mpeg",
        headers={"Cache-Control": "no-store"},
    )
