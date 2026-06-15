import { Volume2, VolumeX } from 'lucide-react';

/**
 * Live audio-level readout for a camera-backed device. Shows the raw RMS value
 * (linear, 0–1) and the converted dBFS level being received from the camera mic,
 * with a small color-coded bar. Fed by the backend /cameras/levels monitor.
 *
 * Note: dBFS is digital full-scale (0 = clipping, negative = quieter) — not a
 * calibrated real-world SPL. It reflects the level of the signal being received.
 */
export default function AudioLevelMeter({ level }) {
  if (!level || level.status !== 'live' || level.rms_dbfs == null) {
    const label =
      !level || level.status === 'starting'
        ? 'starting…'
        : level.status === 'no_audio'
          ? 'no audio'
          : level.status === 'reconnecting'
            ? 'reconnecting…'
            : level.status === 'error'
              ? 'error'
              : 'silent';
    return (
      <div className="mt-0.5 flex items-center gap-1 text-2xs text-echo-dim">
        <VolumeX className="w-3 h-3" />
        {label}
      </div>
    );
  }

  const db = level.rms_dbfs;          // dBFS (negative)
  const lin = level.rms_linear ?? 0;  // 0–1
  const stale = level.age_s != null && level.age_s > 4;

  // Map -60..0 dBFS to 0..100% bar width.
  const pct = Math.max(2, Math.min(100, ((db + 60) / 60) * 100));
  const tone = db > -6 ? 'bg-echo-crit' : db > -20 ? 'bg-echo-warn' : 'bg-echo-ok';

  return (
    <div className={`mt-0.5 flex items-center gap-1.5 ${stale ? 'opacity-40' : ''}`} title={`peak ${level.peak_dbfs ?? '—'} dBFS · updated ${level.age_s ?? '?'}s ago`}>
      <Volume2 className="w-3 h-3 text-echo-faint shrink-0" />
      <div className="w-16 h-1.5 bg-echo-bg rounded overflow-hidden shrink-0">
        <div className={`h-full ${tone} transition-all duration-150`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-2xs tabular-nums text-echo-text-2">{db.toFixed(1)} dBFS</span>
      <span className="text-2xs tabular-nums text-echo-faint">· {lin.toFixed(3)}</span>
    </div>
  );
}
