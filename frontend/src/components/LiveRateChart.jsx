import { useEffect, useMemo, useState } from 'react';
import { Activity } from 'lucide-react';

const BUCKETS = 60;        // 60 buckets × 5s = 5 minutes
const BUCKET_MS = 5_000;
const WINDOW_MS = BUCKETS * BUCKET_MS;

function bucketize(events, nowMs) {
  const start = nowMs - WINDOW_MS;
  const counts = new Array(BUCKETS).fill(0);
  for (const r of events) {
    const t = new Date(r.timestamp).getTime();
    if (t < start || t > nowMs) continue;
    const idx = Math.min(BUCKETS - 1, Math.max(0, Math.floor((t - start) / BUCKET_MS)));
    counts[idx]++;
  }
  return counts;
}

/** Filled-area mini chart from a counts[] array. Pure SVG, theme-aware. */
function AreaSpark({ counts, height = 56 }) {
  const max = Math.max(1, ...counts);
  const w = 100; // viewBox X units (we stretch to fit via preserveAspectRatio)
  const h = height;
  const pad = 1;
  const pts = counts
    .map((v, i) => {
      const x = (i / (counts.length - 1)) * w;
      const y = h - (v / max) * (h - 2 * pad) - pad;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
  const areaPath = `M0,${h} L ${pts.split(' ').join(' L ')} L ${w},${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height }} preserveAspectRatio="none">
      <path d={areaPath} fill="rgb(var(--echo-accent) / 0.18)" />
      <polyline
        points={pts}
        fill="none"
        stroke="rgb(var(--echo-accent))"
        strokeWidth="1.25"
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function LiveRateChart({ incidents, review }) {
  // Tick every 5s — re-buckets the window so old data falls off the left edge
  // even when no new events are arriving.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), BUCKET_MS);
    return () => clearInterval(id);
  }, []);

  const all = useMemo(
    () => [...(incidents || []), ...(review || [])],
    [incidents, review],
  );

  const counts = useMemo(() => bucketize(all, now), [all, now]);

  // Headline: events in the last 60 seconds
  const last60s = useMemo(() => {
    const since = now - 60_000;
    return all.filter((r) => new Date(r.timestamp).getTime() >= since).length;
  }, [all, now]);

  const peakBucket = Math.max(...counts);

  return (
    <section className="panel p-3 flex flex-col">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-1.5 text-2xs uppercase tracking-wider text-echo-faint">
            <Activity className="w-3 h-3" /> Event Rate
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-semibold text-echo-accent tabular-nums">{last60s}</span>
            <span className="text-2xs text-echo-faint">/ min</span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xs text-echo-faint">Peak</div>
          <div className="text-xs font-mono text-echo-text tabular-nums">{peakBucket}/{BUCKET_MS / 1000}s</div>
        </div>
      </div>

      <div className="mt-2 flex-1 min-h-0">
        <AreaSpark counts={counts} />
      </div>

      <div className="mt-1 text-2xs text-echo-dim">
        {BUCKETS} × {BUCKET_MS / 1000}s buckets · last 5 min
      </div>
    </section>
  );
}
