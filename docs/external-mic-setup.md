# Gate Camera Audio — External Microphone Setup

**Why:** the cameras' built-in mics read essentially noise floor (RMS ~−67 dBFS,
peaks ~−54 dBFS) — too insensitive to measure vehicle noise. The fix is a
dedicated powered microphone wired into each camera's **audio line-in**. No
software changes: the audio rides the same RTSP stream the relay already pulls,
so the per-device meter, Live Ops "Avg Audio" KPI, Listen, and Ping keep working.

> Fidelity note: the camera audio channel is **8 kHz µ-law (telephone-grade)**.
> An external mic fixes *sensitivity*, not *bandwidth*. That's fine for level /
> threshold detection. If you later need finer acoustic analysis, move to a
> dedicated network noise sensor or an edge mic node (options B/C from the review).

## 1. What to buy (one per camera)

A **powered ("active") CCTV microphone** — condenser mic with a built-in preamp.
Look for:

- **Output:** line level, RCA (or bare-wire) — matches the camera "Audio In".
- **Power:** 12 V DC (typically 10–50 mA).
- **Sensitivity / range:** high sensitivity; pick a model rated for your lane
  distance (5–30 m variants exist). A built-in **gain pot** is a big plus.
- **Weatherproofing:** IP65+ or mounted inside a housing — these are outdoor gates.

Avoid passive/electret capsules with no preamp — they're what's already failing.

## 2. Wiring

Each camera's pigtail or rear terminals expose an **Audio In** (often a yellow RCA
labeled "Audio In", or 2 pins marked `AUD-IN`/`GND`).

```
[Mic LINE OUT] ───────▶ [Camera AUDIO IN]
[Mic 12V +/−]  ◀─────── 12 V DC supply        (share GND with the camera)
```

- Connect mic **line out → camera Audio In**.
- Power the mic from **12 V DC**: tap the camera's 12 V barrel if it's
  barrel-powered, or add a separate 12 V adapter. **If the camera is PoE-only,**
  use a **PoE splitter** (PoE → data + 12 V) or a separate 12 V supply for the mic.
- Tie the mic ground and camera ground together to avoid hum.

## 3. Enable / tune audio in the camera web UI

Log into each camera (`http://<camera-ip>`, `admin` / your password) →
**Configuration → Audio (or Video/Audio)**:

- **Enable Audio** input. (Critical for **.238 / CAM_GATE_IN_01**, which currently
  advertises *no* `m=audio` stream at all — its audio is disabled.)
- **Input type:** `LineIn` (not the internal `Mic`).
- **Encoding:** `G.711U` (pcm_mulaw) is what we see and is supported; AAC also works.
- **Input volume / gain:** raise toward max, then fine-tune with the mic's gain pot.

## 4. Verify (uses what we already built)

**a. Confirm the camera now exposes audio** (especially .238) — from the backend venv:

```powershell
$ffprobe = "C:\Users\Harish\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1.1-full_build\bin\ffprobe.exe"
& $ffprobe -hide_banner -rtsp_transport tcp -i "rtsp://admin:<pwd>@192.168.101.238:554/h264/ch1/main/av_stream"
# expect a line:  Stream #0:1: Audio: pcm_mulaw, 8000 Hz, mono ...
```

**b. Watch the live level** on the dashboard **Devices** page (the dBFS meter under
each device) or via the API:

```powershell
curl.exe -s http://localhost:8000/api/v1/cameras/levels
```

Targets with a working mic:
- **Idle floor:** roughly −50 to −40 dBFS (vs the −67 we see now).
- **Vehicle pass-by peaks:** −20 to −6 dBFS (meter bar goes amber/red).

If pass-bys still don't lift the meter, raise camera input gain + mic pot; if
already maxed, the mic is under-ranged for the lane distance — get a
longer-range model or move it closer to the traffic lane.

## 5. Recommended follow-up — calibrate dBFS → SPL

Once the mic delivers real signal, the meter/KPI still read **dBFS** (digital),
not real-world **SPL** (the spec's 85 dB threshold). A one-time calibration —
play/measure a known dB level at the gate, store the offset — lets the meter,
the "Avg Audio" KPI, and any future dBFS→violation trigger display approximate
SPL that's directly comparable to the spec thresholds. Ask and this can be added.
