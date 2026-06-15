"""Shared camera helpers used by the audio relay router and the level monitor.

Kept framework-agnostic (no FastAPI imports) so background threads can use it too.
"""
import glob
import json
import os
import re
import shutil
import subprocess
from pathlib import Path
from typing import Optional

CAMERAS_FILE = Path(__file__).resolve().parent.parent / "cameras.json"

_FFMPEG_CACHE: Optional[str] = None
_MIC_DEVICE_CACHE: Optional[str] = None


def load_cameras() -> dict:
    """Return {camera_id: camera_dict}. Re-read each call so cameras.json edits
    take effect without a restart. Raises json.JSONDecodeError on malformed JSON."""
    if not CAMERAS_FILE.exists():
        return {}
    data = json.loads(CAMERAS_FILE.read_text(encoding="utf-8"))
    return {c["id"]: c for c in data.get("cameras", []) if c.get("id")}


def resolve_ffmpeg() -> Optional[str]:
    """Find ffmpeg WITHOUT depending on the server's PATH being refreshed.

    A backend launched before ffmpeg was installed — or from a shell with a stale
    PATH (common with IDE terminals) — won't see it via PATH. So we also honour an
    explicit ECHO_FFMPEG override and probe the default winget install location.
    """
    global _FFMPEG_CACHE
    if _FFMPEG_CACHE and Path(_FFMPEG_CACHE).exists():
        return _FFMPEG_CACHE

    candidates: list[str] = []
    override = os.environ.get("ECHO_FFMPEG")
    if override:
        candidates.append(override)
    on_path = shutil.which("ffmpeg")
    if on_path:
        candidates.append(on_path)
    local = os.environ.get("LOCALAPPDATA")
    if local:
        candidates += glob.glob(
            os.path.join(local, "Microsoft", "WinGet", "Packages",
                         "Gyan.FFmpeg*", "**", "ffmpeg.exe"),
            recursive=True,
        )
    candidates.append(r"C:\ffmpeg\bin\ffmpeg.exe")

    for c in candidates:
        if c and Path(c).exists():
            _FFMPEG_CACHE = c
            return c
    return None


def is_mic(cam: dict) -> bool:
    """A 'local mic' source captures from this PC's microphone (dshow) instead of RTSP."""
    return cam.get("source") == "mic" or bool(cam.get("mic"))


def has_source(cam: dict) -> bool:
    return bool(cam.get("rtsp_url")) or is_mic(cam)


def list_dshow_audio_devices(ffmpeg: str) -> list[str]:
    """Names of Windows DirectShow audio capture devices, parsed from ffmpeg."""
    try:
        proc = subprocess.run(
            [ffmpeg, "-hide_banner", "-list_devices", "true", "-f", "dshow", "-i", "dummy"],
            capture_output=True, text=True, timeout=10,
        )
    except Exception:
        return []
    # ffmpeg prints `"<name>" (audio)` to stderr; -list_devices exits non-zero by design.
    return re.findall(r'"([^"]+)"\s*\(audio\)', proc.stderr)


def default_mic_device(ffmpeg: str) -> str:
    global _MIC_DEVICE_CACHE
    if _MIC_DEVICE_CACHE:
        return _MIC_DEVICE_CACHE
    devices = list_dshow_audio_devices(ffmpeg)
    _MIC_DEVICE_CACHE = devices[0] if devices else "default"
    return _MIC_DEVICE_CACHE


def ffmpeg_input_args(cam: dict, ffmpeg: str) -> list[str]:
    """The ffmpeg input flags for a device — RTSP camera or local microphone."""
    if is_mic(cam):
        device = cam.get("mic_device") or default_mic_device(ffmpeg)
        return ["-f", "dshow", "-i", f"audio={device}"]
    return ["-rtsp_transport", "tcp", "-i", cam["rtsp_url"]]
