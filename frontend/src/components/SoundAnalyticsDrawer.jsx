import { useEffect, useRef, useState } from 'react';
import { X, Volume2, VolumeX, Activity, AudioLines, Waves, Play } from 'lucide-react';
import { api } from '../services/api.js';

/**
 * Per-device sound analytics. Streams the device's audio (the existing /audio
 * relay) through the Web Audio API to render a live scrolling spectrogram, an
 * adaptive energy VAD (voice/sound activity), and a spectral-feature classifier.
 *
 * All analysis is client-side and heuristic — no backend/ML deps. For a trained
 * classifier (YAMNet etc.) we'd move this server-side; flagged in the UI.
 *
 * Note: `createMediaElementSource` can only ever be called ONCE per <audio>
 * element (and can't be undone), so the graph is cached in a ref — this survives
 * React StrictMode's double-effect in dev and device switches.
 */
const FFT_SIZE = 1024;
const DISPLAY_HZ = 8000; // focus on the band where speech / vehicle / horn live

// One shared AudioContext for the whole app. Browsers cap concurrent contexts
// (~6) and a media element can be bound to createMediaElementSource only once,
// so we must never spin up / tear down a context per drawer open.
let _sharedCtx = null;
function sharedAudioContext() {
  if (!_sharedCtx || _sharedCtx.state === 'closed') {
    _sharedCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return _sharedCtx;
}

function classify({ vad, low, speech, high, total }) {
  if (!vad || total <= 0) return { label: 'Silent', tone: 'dim' };
  const lr = low / total, sr = speech / total, hr = high / total;
  if (lr > 0.6) return { label: 'Vehicle / rumble', tone: 'warn' };
  if (sr > 0.5) return { label: 'Speech / voice', tone: 'accent' };
  if (hr > 0.4) return { label: 'Tonal / high', tone: 'crit' };
  return { label: 'Ambient / mixed', tone: 'muted' };
}

const TONE = {
  accent: 'text-echo-accent', warn: 'text-echo-warn', crit: 'text-echo-crit',
  muted: 'text-echo-muted', dim: 'text-echo-dim', ok: 'text-echo-ok',
};

function Stat({ icon: Icon, label, value, tone }) {
  return (
    <div className="bg-echo-bg rounded border border-echo-line px-3 py-2">
      <div className="flex items-center gap-1.5 text-2xs uppercase tracking-wider text-echo-faint">
        <Icon className="w-3 h-3" />{label}
      </div>
      <div className={`mt-1 text-sm font-semibold font-mono tabular-nums ${TONE[tone] || 'text-echo-text'}`}>{value}</div>
    </div>
  );
}

export default function SoundAnalyticsDrawer({ analytics, onClose }) {
  const canvasRef = useRef(null);
  const audioRef = useRef(null);
  const graphRef = useRef(null);   // { ctx, srcNode, analyser, gain } — created once per <audio>
  const startRef = useRef(null);   // gesture-retry handle
  const [listening, setListening] = useState(false);
  const [needsGesture, setNeedsGesture] = useState(false);
  const [error, setError] = useState('');
  const [stats, setStats] = useState({ vad: false, dbfs: null, domFreq: null, cls: { label: '—', tone: 'dim' } });

  useEffect(() => {
    const onEsc = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [onClose]);

  useEffect(() => {
    if (!analytics) return;
    let raf, stopped = false;
    let floor = -100;   // adaptive noise floor (dBFS) for the VAD
    let lastStat = 0;

    const audio = audioRef.current;
    audio.src = api.cameraAudioUrl(analytics.cameraId);

    const cvs = canvasRef.current;
    const cctx = cvs.getContext('2d');
    const W = cvs.width, H = cvs.height;
    cctx.fillStyle = '#000';
    cctx.fillRect(0, 0, W, H);

    const freq = new Uint8Array(FFT_SIZE / 2);
    const time = new Uint8Array(FFT_SIZE);

    const colorFor = (v) => {
      const t = v / 255;
      const r = Math.floor(255 * Math.min(1, t * 1.7));
      const g = Math.floor(255 * Math.min(1, Math.max(0, t * 1.4 - 0.1)));
      const b = Math.floor(120 * (1 - t) + 30 * t);
      return `rgb(${r},${g},${b})`;
    };

    // Build the Web Audio graph once per <audio> element; reuse thereafter.
    const ensureGraph = () => {
      if (graphRef.current) {
        // Reconnect (a prior cleanup may have disconnected) — connect() is
        // idempotent for identical termini per the Web Audio spec.
        const g = graphRef.current;
        g.srcNode.connect(g.analyser);
        g.srcNode.connect(g.gain);
        g.gain.connect(g.ctx.destination);
        return g;
      }
      const ctx = sharedAudioContext();
      const srcNode = ctx.createMediaElementSource(audio);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      analyser.smoothingTimeConstant = 0.6;
      analyser.minDecibels = -95;  // widen the visible range so quiet feeds still show
      analyser.maxDecibels = -20;
      const gain = ctx.createGain();
      gain.gain.value = listening ? 1 : 0; // analyse silently by default
      srcNode.connect(analyser);       // analysis tap
      srcNode.connect(gain);           // audible branch
      gain.connect(ctx.destination);   // keeps the graph rendering (silent at gain 0)
      graphRef.current = { ctx, srcNode, analyser, gain };
      return graphRef.current;
    };

    const loop = () => {
      if (stopped) return;
      raf = requestAnimationFrame(loop);
      const { analyser, ctx } = graphRef.current;
      analyser.getByteFrequencyData(freq);
      analyser.getByteTimeDomainData(time);

      const ny = ctx.sampleRate / 2;
      const maxBin = Math.max(1, Math.floor((Math.min(ny, DISPLAY_HZ) / ny) * freq.length));

      cctx.drawImage(cvs, -1, 0);
      for (let y = 0; y < H; y++) {
        const bin = Math.floor((1 - y / H) * maxBin);
        cctx.fillStyle = colorFor(freq[bin] || 0);
        cctx.fillRect(W - 1, y, 1, 1);
      }

      let sum = 0;
      for (let i = 0; i < time.length; i++) { const x = (time[i] - 128) / 128; sum += x * x; }
      const rms = Math.sqrt(sum / time.length);
      const dbfs = rms > 0 ? 20 * Math.log10(rms) : -100;

      if (dbfs < floor + 6) floor = floor * 0.95 + dbfs * 0.05;
      const vad = dbfs > floor + 9 && dbfs > -85;

      const hzPerBin = ny / freq.length;
      let low = 0, speech = 0, high = 0, peakV = 0, peakBin = 0;
      for (let i = 0; i < maxBin; i++) {
        const hz = i * hzPerBin, v = freq[i];
        if (hz >= 60 && hz < 250) low += v;
        else if (hz >= 300 && hz <= 3400) speech += v;
        else if (hz > 3400) high += v;
        if (v > peakV) { peakV = v; peakBin = i; }
      }
      const cls = classify({ vad, low, speech, high, total: low + speech + high });

      const now = performance.now();
      if (now - lastStat > 200) {
        lastStat = now;
        setStats({
          vad,
          dbfs: Math.round(dbfs * 10) / 10,
          domFreq: peakV > 24 ? Math.round(peakBin * hzPerBin) : null,
          cls,
        });
      }
    };

    const start = async () => {
      const { ctx } = ensureGraph();
      try { await ctx.resume(); } catch {}
      try { await audio.play(); } catch {}
      // Only declare success if the context is actually running AND audio is
      // really playing — otherwise show the gesture overlay so a click fixes it.
      if (ctx.state === 'running' && !audio.paused) {
        setError('');
        setNeedsGesture(false);
        if (!raf) loop();
      } else {
        setNeedsGesture(true);
      }
    };

    startRef.current = start;
    audio.onerror = () => setError('No audio stream from this device (it may have no audio track).');
    start();

    return () => {
      stopped = true;
      if (raf) cancelAnimationFrame(raf);
      // Stop the stream (kills the backend ffmpeg) and free the graph nodes.
      // We never close the shared context, and never null graphRef — so the
      // one-and-only createMediaElementSource per element is preserved across
      // StrictMode's double-mount.
      try { audio.pause(); audio.removeAttribute('src'); audio.load(); } catch {}
      const g = graphRef.current;
      if (g) { try { g.srcNode.disconnect(); g.analyser.disconnect(); g.gain.disconnect(); } catch {} }
    };
  }, [analytics?.cameraId]);

  const toggleListen = () => {
    const g = graphRef.current;
    if (!g) return;
    const next = !listening;
    g.gain.gain.value = next ? 1 : 0;
    setListening(next);
  };

  if (!analytics) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-30" onClick={onClose} />
      <aside className="fixed right-0 top-0 h-full w-[520px] bg-echo-panel border-l border-echo-line z-40 flex flex-col shadow-2xl">
        <header className="px-4 py-3 border-b border-echo-line flex items-center justify-between">
          <div>
            <div className="text-2xs uppercase tracking-wider text-echo-faint flex items-center gap-1.5">
              <AudioLines className="w-3 h-3" />Sound Analytics
            </div>
            <div className="text-base font-semibold font-mono text-echo-text truncate max-w-[400px]" title={analytics.deviceId}>
              {analytics.deviceId}
            </div>
          </div>
          <button onClick={onClose} className="text-echo-faint hover:text-echo-text transition-colors" title="Close (Esc)">
            <X className="w-5 h-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div>
            <div className="flex items-center justify-between text-2xs uppercase tracking-wider text-echo-faint mb-1.5">
              <span className="flex items-center gap-1.5"><Waves className="w-3 h-3" />Spectrogram</span>
              <span className="flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${stats.vad ? 'bg-echo-ok animate-pulse' : 'bg-echo-dim'}`} />
                {stats.vad ? 'ACTIVE' : 'silent'}
              </span>
            </div>
            <div className={`relative rounded border ${stats.vad ? 'border-echo-ok' : 'border-echo-line'} transition-colors`}>
              <canvas ref={canvasRef} width={488} height={200} className="w-full block bg-black rounded" />
              <span className="absolute left-1 top-1 text-2xs text-white/60 font-mono">{(DISPLAY_HZ / 1000).toFixed(0)} kHz</span>
              <span className="absolute left-1 bottom-1 text-2xs text-white/60 font-mono">0</span>
              <span className="absolute right-1 bottom-1 text-2xs text-white/50 font-mono">now →</span>
              {needsGesture && (
                <button
                  onClick={() => startRef.current && startRef.current()}
                  className="absolute inset-0 flex items-center justify-center gap-2 bg-black/60 text-echo-text text-sm hover:bg-black/50 transition-colors"
                >
                  <Play className="w-5 h-5" /> Start analysis
                </button>
              )}
            </div>
          </div>

          {error && <div className="text-2xs text-echo-crit">{error}</div>}

          <div className="grid grid-cols-3 gap-2">
            <Stat icon={Activity} label="VAD" value={stats.vad ? 'Active' : 'Silent'} tone={stats.vad ? 'ok' : 'dim'} />
            <Stat icon={AudioLines} label="Class" value={stats.cls.label} tone={stats.cls.tone} />
            <Stat icon={Volume2} label="Level" value={stats.dbfs == null ? '—' : `${stats.dbfs} dBFS`} tone="accent" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Stat icon={Waves} label="Dominant" value={stats.domFreq == null ? '—' : `${stats.domFreq} Hz`} tone="muted" />
          </div>

          <button
            onClick={toggleListen}
            className={`flex items-center gap-1.5 text-2xs px-2.5 py-1.5 rounded border transition-colors ${
              listening ? 'border-echo-accent/40 text-echo-accent hover:bg-echo-accent/10'
                        : 'border-echo-line text-echo-muted hover:bg-echo-panel-2 hover:text-echo-text'
            }`}
          >
            {listening ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            {listening ? 'Listening — click to mute' : 'Analyse silently — click to listen'}
          </button>

          <p className="text-2xs text-echo-dim leading-relaxed">
            Heuristic classifier (band-energy + VAD), computed live in the browser from the device's
            audio stream. Camera audio is 8&nbsp;kHz so its spectrogram tops out ~4&nbsp;kHz. For a
            trained sound classifier, this would move server-side.
          </p>
        </div>

        <audio ref={audioRef} hidden />
      </aside>
    </>
  );
}
