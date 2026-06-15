"""Continuous per-camera audio level monitor.

For each configured camera we run a long-lived ffmpeg that decodes the audio and
emits RMS/peak level every ~0.3s via the `astats` filter. We parse those numbers
and keep the latest in memory, so the dashboard can show a live "loudness"
readout (raw RMS + dBFS) under every device — without the operator pressing Listen.

Uses blocking subprocess + threads (NOT asyncio): under uvicorn --reload on
Windows the event loop is the SelectorEventLoop, which can't spawn asyncio
subprocesses. See feedback-py314-uvicorn.
"""
import re
import subprocess
import threading
import time
from typing import Optional

from .camera_config import ffmpeg_input_args, has_source, load_cameras, resolve_ffmpeg

_RMS_RE = re.compile(r"lavfi\.astats\.Overall\.RMS_level=(-?\d+(?:\.\d+)?|-?inf|nan)")
_PEAK_RE = re.compile(r"lavfi\.astats\.Overall\.Peak_level=(-?\d+(?:\.\d+)?|-?inf|nan)")

# 0.3s windows at 8 kHz (these cameras are 8 kHz mono µ-law). Larger rates just
# update a touch faster — harmless.
_WINDOW_SAMPLES = 2400


def _parse_db(s: str) -> Optional[float]:
    if s in ("-inf", "inf", "nan"):
        return None
    try:
        return float(s)
    except ValueError:
        return None


class _CameraMeter:
    """One ffmpeg meter for one camera, with auto-reconnect."""

    def __init__(self, cam: dict):
        self.camera_id = cam["id"]
        self.device_id = cam.get("device_id") or cam["id"]
        self._cam = cam
        self.rms_dbfs: Optional[float] = None
        self.peak_dbfs: Optional[float] = None
        self.rms_linear: Optional[float] = None
        self.updated_at: Optional[float] = None
        self.status = "starting"  # starting | live | no_audio | error | reconnecting
        self._stop = threading.Event()
        self._proc: Optional[subprocess.Popen] = None
        self._thread = threading.Thread(target=self._run, name=f"meter-{self.camera_id}", daemon=True)

    def start(self):
        self._thread.start()

    def stop(self):
        self._stop.set()
        if self._proc and self._proc.poll() is None:
            try:
                self._proc.terminate()
            except Exception:
                pass

    def _args(self, ffmpeg: str) -> list[str]:
        return [
            ffmpeg, "-hide_banner", "-loglevel", "error",
            *ffmpeg_input_args(self._cam, ffmpeg),
            "-vn",
            "-af", (
                f"asetnsamples=n={_WINDOW_SAMPLES}:p=0,"
                "astats=metadata=1:reset=1,"
                "ametadata=mode=print:file=-"
            ),
            "-f", "null", "-",
        ]

    def _run(self):
        while not self._stop.is_set():
            ffmpeg = resolve_ffmpeg()
            if not ffmpeg:
                self.status = "error"
                self._stop.wait(10)
                continue

            saw_data = False
            try:
                self._proc = subprocess.Popen(
                    self._args(ffmpeg),
                    stdout=subprocess.PIPE,
                    stderr=subprocess.DEVNULL,
                    text=True,
                    bufsize=1,
                )
                for line in self._proc.stdout:
                    if self._stop.is_set():
                        break
                    m = _RMS_RE.search(line)
                    if m:
                        db = _parse_db(m.group(1))
                        self.rms_dbfs = db
                        self.rms_linear = 0.0 if db is None else round(10 ** (db / 20), 4)
                        self.updated_at = time.time()
                        self.status = "live"
                        saw_data = True
                        continue
                    p = _PEAK_RE.search(line)
                    if p:
                        self.peak_dbfs = _parse_db(p.group(1))
            except Exception:
                self.status = "error"
            finally:
                self._terminate_proc()

            if self._stop.is_set():
                break
            if saw_data:
                # Stream dropped — reconnect quickly.
                self.status = "reconnecting"
                self._stop.wait(2)
            else:
                # No audio frames ever arrived: camera has no audio track (or is
                # unreachable). Back off hard so we don't hammer it.
                self.status = "no_audio"
                self.rms_dbfs = self.peak_dbfs = self.rms_linear = None
                self._stop.wait(30)

    def _terminate_proc(self):
        proc, self._proc = self._proc, None
        if proc and proc.poll() is None:
            proc.terminate()
            try:
                proc.wait(timeout=3)
            except subprocess.TimeoutExpired:
                proc.kill()

    def snapshot(self) -> dict:
        now = time.time()
        age = None if self.updated_at is None else round(now - self.updated_at, 1)
        return {
            "camera_id": self.camera_id,
            "device_id": self.device_id,
            "status": self.status,
            "rms_dbfs": None if self.rms_dbfs is None else round(self.rms_dbfs, 1),
            "peak_dbfs": None if self.peak_dbfs is None else round(self.peak_dbfs, 1),
            "rms_linear": self.rms_linear,
            "age_s": age,
        }


class LevelMonitorManager:
    def __init__(self):
        self._meters: dict[str, _CameraMeter] = {}
        self._lock = threading.Lock()

    def start_all(self):
        self.reconcile()

    def reconcile(self):
        """Sync running meters to cameras.json — start meters for newly-added
        devices, stop those removed. Lets config edits take effect without a
        restart (the reloader doesn't watch cameras.json)."""
        try:
            cams = load_cameras()
        except Exception:
            return
        configured = {cid: c for cid, c in cams.items() if has_source(c)}
        with self._lock:
            for cid, cam in configured.items():
                if cid not in self._meters:
                    meter = _CameraMeter(cam)
                    self._meters[cid] = meter
                    meter.start()
            for cid in [c for c in self._meters if c not in configured]:
                self._meters[cid].stop()
                del self._meters[cid]

    def stop_all(self):
        with self._lock:
            for meter in self._meters.values():
                meter.stop()
            self._meters.clear()

    def snapshot(self) -> list[dict]:
        self.reconcile()
        with self._lock:
            return [m.snapshot() for m in self._meters.values()]


manager = LevelMonitorManager()
