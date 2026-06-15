import { useEffect, useMemo, useRef, useState } from 'react';
import { Cpu, Wifi, WifiOff, Activity, Radio, Volume2 } from 'lucide-react';
import PageHeader from '../components/PageHeader.jsx';
import Sparkline from '../components/Sparkline.jsx';
import DeviceAudioControl from '../components/DeviceAudioControl.jsx';
import DevicePingControl from '../components/DevicePingControl.jsx';
import AudioLevelMeter from '../components/AudioLevelMeter.jsx';
import SoundAnalyticsDrawer from '../components/SoundAnalyticsDrawer.jsx';
import { api } from '../services/api.js';

const SPARK_WINDOW = 30;
const RECENT_MS = 5_000;
const ONLINE_MS = 60 * 5_000; // 5 min

function ageLabel(ts) {
  if (!ts) return '—';
  const ms = Date.now() - new Date(ts).getTime();
  if (ms < 1000) return 'now';
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

export default function Devices({ ctx }) {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);

  // Live camera audio — one shared <audio>, so only one stream plays at a time.
  const audioRef = useRef(null);
  const [cameras, setCameras] = useState([]);
  const [playingId, setPlayingId] = useState(null);   // device_id currently streaming
  const [loadingId, setLoadingId] = useState(null);
  const [errorId, setErrorId] = useState(null);
  const [volume, setVolume] = useState(0.8);

  // Sound-analytics drawer (spectrogram + VAD + classification) for a clicked device.
  const [analytics, setAnalytics] = useState(null);

  // Map device_id → camera (each edge node is backed by one IP camera).
  const cameraByDevice = useMemo(() => {
    const m = new Map();
    for (const c of cameras) if (c.device_id) m.set(c.device_id, c);
    return m;
  }, [cameras]);

  useEffect(() => {
    api.cameras().then(setCameras).catch(() => {});
  }, []);

  // Live audio levels per device — polled from the backend meter once a second.
  const [levelByDevice, setLevelByDevice] = useState(new Map());
  const levelHistory = useRef(new Map()); // device_id -> rolling dBFS samples for the sparkline
  useEffect(() => {
    let active = true;
    const poll = () =>
      api
        .cameraLevels()
        .then((rows) => {
          if (!active) return;
          for (const r of rows) {
            if (r.status === 'live' && r.rms_dbfs != null) {
              const hist = levelHistory.current.get(r.device_id) || [];
              hist.push(r.rms_dbfs);
              if (hist.length > SPARK_WINDOW) hist.shift();
              levelHistory.current.set(r.device_id, hist);
            }
          }
          setLevelByDevice(new Map(rows.map((r) => [r.device_id, r])));
        })
        .catch(() => {});
    poll();
    const id = setInterval(poll, 1000);
    return () => { active = false; clearInterval(id); };
  }, []);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  const stopAudio = () => {
    const a = audioRef.current;
    if (a) {
      a.pause();
      a.removeAttribute('src'); // closing the request tells the backend to kill ffmpeg
      a.load();
    }
    setPlayingId(null);
    setLoadingId(null);
  };

  const toggleAudio = (deviceId) => {
    if (playingId === deviceId) {
      stopAudio();
      return;
    }
    const cam = cameraByDevice.get(deviceId);
    if (!cam) return;
    stopAudio();
    setErrorId(null);
    setLoadingId(deviceId);
    const a = audioRef.current;
    a.src = api.cameraAudioUrl(cam.id);
    a.volume = volume;
    a.play()
      .then(() => { setPlayingId(deviceId); setLoadingId(null); })
      .catch(() => { setLoadingId(null); setErrorId(deviceId); });
  };

  // Tick every 1s so the "last seen" countdowns + status dots stay live.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Group live events from the WS stream by device for sparklines.
  const liveByDevice = useMemo(() => {
    const all = [...(ctx?.incidents || []), ...(ctx?.review || [])];
    all.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    const m = new Map();
    for (const r of all) {
      if (!m.has(r.device_id)) m.set(r.device_id, []);
      m.get(r.device_id).push(r);
    }
    for (const [k, v] of m) m.set(k, v.slice(-SPARK_WINDOW));
    return m;
  }, [ctx?.incidents, ctx?.review]);

  // Re-fetch the full device list each time the live total changes — keeps
  // newly-seen devices appearing without a manual refresh.
  useEffect(() => {
    api.devices()
      .then((d) => { setDevices(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [ctx?.summary?.total_incidents]);

  // Merge endpoint metadata + live-stream snapshot — endpoint provides totals
  // and config, live stream provides the sparkline and freshest timestamp.
  const merged = useMemo(() => {
    const liveDeviceIds = new Set(liveByDevice.keys());
    const merged = devices.map((d) => {
      const live = liveByDevice.get(d.device_id) || [];
      const latest = live[live.length - 1];
      const lastSeen = latest?.timestamp || d.last_seen;
      return {
        ...d,
        live,
        latest,
        last_seen: lastSeen,
      };
    });
    // Include devices we've seen on the wire but the endpoint hasn't returned yet.
    for (const id of liveDeviceIds) {
      if (!devices.find((d) => d.device_id === id)) {
        const live = liveByDevice.get(id);
        const latest = live[live.length - 1];
        merged.push({
          device_id: id,
          incident_count: live.length,
          last_24h: live.length,
          last_seen: latest.timestamp,
          audio_threshold_db: null,
          vibration_threshold_g: null,
          cooldown_seconds: null,
          live,
          latest,
        });
      }
    }
    // Surface camera-backed nodes even before they've reported any violation, so
    // the Listen/Ping controls always have a row. They show as STALE until traffic.
    const present = new Set(merged.map((d) => d.device_id));
    for (const cam of cameras) {
      if (cam.device_id && !present.has(cam.device_id)) {
        merged.push({
          device_id: cam.device_id,
          incident_count: 0,
          last_24h: 0,
          last_seen: null,
          audio_threshold_db: null,
          vibration_threshold_g: null,
          cooldown_seconds: null,
          live: [],
          latest: null,
        });
      }
    }
    return merged.sort((a, b) => new Date(b.last_seen || 0) - new Date(a.last_seen || 0));
  }, [devices, liveByDevice, cameras]);

  const stats = useMemo(() => {
    const total = merged.length;
    let online = 0;
    for (const d of merged) {
      const ms = d.last_seen ? Date.now() - new Date(d.last_seen).getTime() : Infinity;
      if (ms < ONLINE_MS) online += 1;
    }
    return { total, online, offline: total - online };
  }, [merged]);

  return (
    <div className="space-y-3">
      <PageHeader
        title="Devices"
        subtitle="Edge nodes with live signal pulse"
        right={
          <div className="flex items-center gap-3 text-2xs">
            {playingId && (
              <span className="flex items-center gap-1.5 pr-3 border-r border-echo-line">
                <Volume2 className="w-3.5 h-3.5 text-echo-faint" />
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={volume}
                  onChange={(e) => setVolume(Number(e.target.value))}
                  className="w-20 accent-echo-accent"
                  title="Live audio volume"
                />
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-echo-ok" />
              <span className="text-echo-text tabular-nums">{stats.online}</span>
              <span className="text-echo-faint">online</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-echo-dim" />
              <span className="text-echo-text tabular-nums">{stats.offline}</span>
              <span className="text-echo-faint">stale</span>
            </span>
          </div>
        }
      />

      <div className="panel">
        <header className="panel-header">
          <div className="grid grid-cols-[1.25rem_1fr_8.5rem_3.5rem_3.5rem_6rem_5.5rem_8rem_4.5rem_5rem] gap-3 w-full text-2xs text-echo-faint items-center">
            <span></span>
            <span>DEVICE ID</span>
            <span className="flex items-center gap-1 whitespace-nowrap"><Activity className="w-3 h-3" />ACTIVITY (LAST 30)</span>
            <span className="text-right">TOTAL</span>
            <span className="text-right">24H</span>
            <span className="text-right">LAST SEEN</span>
            <span className="text-right">STATUS</span>
            <span className="text-right">THR (dB/g/s)</span>
            <span className="text-right flex items-center justify-end gap-1"><Radio className="w-3 h-3" />AUDIO</span>
            <span className="text-right">PING</span>
          </div>
        </header>
        <div>
          {loading && merged.length === 0 ? (
            <div className="text-echo-dim text-xs italic text-center py-16">Loading…</div>
          ) : merged.length === 0 ? (
            <div className="text-echo-dim text-xs italic text-center py-16">
              No devices have reported in yet.
            </div>
          ) : (
            merged.map((d) => {
              const lvl = levelByDevice.get(d.device_id);
              const audioLive = !!lvl && lvl.status === 'live' && (lvl.age_s == null || lvl.age_s < 6);
              const audioHist = levelHistory.current.get(d.device_id) || [];
              const ageMs = d.last_seen ? Date.now() - new Date(d.last_seen).getTime() : Infinity;
              // A live audio feed counts as the device being seen right now.
              const isRecent = ageMs < RECENT_MS || audioLive;
              const isOnline = ageMs < ONLINE_MS || audioLive;
              const cam = cameraByDevice.get(d.device_id);
              return (
                <div
                  key={d.device_id}
                  onClick={cam ? () => setAnalytics({ deviceId: d.device_id, cameraId: cam.id }) : undefined}
                  title={cam ? 'Open sound analytics (spectrogram · VAD · classification)' : undefined}
                  className={`grid grid-cols-[1.25rem_1fr_8.5rem_3.5rem_3.5rem_6rem_5.5rem_8rem_4.5rem_5rem] gap-3 px-3 py-2 text-xs border-b border-echo-line-soft items-center hover:bg-echo-panel-2 font-mono ${cam ? 'cursor-pointer' : ''}`}
                >
                  <Cpu className="w-3.5 h-3.5 text-echo-faint" />

                  <div className="min-w-0">
                    <div className="text-echo-text truncate" title={d.device_id}>{d.device_id}</div>
                    {d.latest && (
                      <div className="text-2xs text-echo-faint mt-0.5 tabular-nums">
                        <span className="text-echo-accent">{d.latest.audio_db.toFixed(1)}dB</span>
                        {' / '}
                        <span className="text-echo-warn">{d.latest.vibration_g.toFixed(2)}g</span>
                      </div>
                    )}
                    {cameraByDevice.has(d.device_id) && (
                      <AudioLevelMeter level={levelByDevice.get(d.device_id)} />
                    )}
                  </div>

                  <div className="flex flex-col gap-0.5">
                    {d.live.length >= 2 ? (
                      <>
                        <Sparkline values={d.live.map((r) => r.audio_db)}    colorVar="--echo-accent" width={96} height={14} />
                        <Sparkline values={d.live.map((r) => r.vibration_g)} colorVar="--echo-warn"   width={96} height={14} />
                      </>
                    ) : (
                      // No violation events — fall back to the live audio dBFS trace.
                      <Sparkline values={audioHist} colorVar="--echo-accent" width={96} height={29} />
                    )}
                  </div>

                  <span className="text-right text-echo-text-2 tabular-nums">{d.incident_count}</span>
                  <span className="text-right text-echo-text-2 tabular-nums">{d.last_24h}</span>
                  <span className="text-right text-echo-faint tabular-nums">
                    {audioLive
                      ? (lvl.age_s != null && lvl.age_s >= 1 ? `${Math.round(lvl.age_s)}s ago` : 'now')
                      : ageLabel(d.last_seen)}
                  </span>

                  <span className="text-right">
                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-2xs ${
                      isOnline ? 'bg-echo-ok/20 text-echo-ok' : 'bg-echo-dim/20 text-echo-dim'
                    }`}>
                      {isOnline
                        ? <>
                            <span className={`w-1 h-1 rounded-full bg-echo-ok ${isRecent ? 'animate-pulse' : ''}`} />
                            {isRecent ? 'LIVE' : 'ONLINE'}
                          </>
                        : <><WifiOff className="w-3 h-3" />STALE</>
                      }
                    </span>
                  </span>

                  <span className="text-right text-echo-muted tabular-nums text-2xs">
                    {d.audio_threshold_db ?? '85.0'}
                    <span className="text-echo-dim"> / </span>
                    {/* Camera-backed nodes have no vibration sensor — g is N/A */}
                    {cameraByDevice.has(d.device_id)
                      ? <span className="text-echo-dim" title="no vibration sensor on camera nodes">—</span>
                      : (d.vibration_threshold_g ?? '1.2')}
                    <span className="text-echo-dim"> / </span>
                    {d.cooldown_seconds ?? '5'}s
                  </span>

                  <span className="text-right" onClick={(e) => e.stopPropagation()}>
                    <DeviceAudioControl
                      hasCamera={cameraByDevice.has(d.device_id)}
                      isPlaying={playingId === d.device_id}
                      isLoading={loadingId === d.device_id}
                      hasError={errorId === d.device_id}
                      onToggle={() => toggleAudio(d.device_id)}
                    />
                  </span>

                  <span className="text-right" onClick={(e) => e.stopPropagation()}>
                    <DevicePingControl cameraId={cameraByDevice.get(d.device_id)?.id} />
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="text-2xs text-echo-dim px-1">
        <span className="inline-flex items-center gap-1"><Wifi className="w-3 h-3" /></span> "ONLINE" = reported in the last 5 minutes ·{' '}
        <span className="inline-flex items-center gap-1"><span className="w-1 h-1 rounded-full bg-echo-ok animate-pulse" /></span> "LIVE" pulse = event in the last 5s ·{' '}
        sparkline shows the last {SPARK_WINDOW} events received during this session.
      </div>

      <audio
        ref={audioRef}
        onError={() => {
          if (audioRef.current?.getAttribute('src')) {
            setErrorId(playingId || loadingId);
            setPlayingId(null);
            setLoadingId(null);
          }
        }}
        onEnded={() => setPlayingId(null)}
        hidden
      />

      {analytics && <SoundAnalyticsDrawer analytics={analytics} onClose={() => setAnalytics(null)} />}
    </div>
  );
}
