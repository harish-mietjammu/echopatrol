function Cell({ label, value, tone = 'default', hint }) {
  const toneClass = {
    default: 'text-echo-text',
    accent: 'text-echo-accent',
    warn: 'text-echo-warn',
    crit: 'text-echo-crit',
    ok: 'text-echo-ok',
  }[tone];
  return (
    <div className="px-4 py-2.5 flex-1 border-r border-echo-line last:border-r-0">
      <div className="text-2xs uppercase tracking-wider text-echo-faint">{label}</div>
      <div className={`text-xl font-semibold mt-0.5 tabular-nums ${toneClass}`}>{value ?? '—'}</div>
      {hint && <div className="text-2xs text-echo-faint mt-0.5">{hint}</div>}
    </div>
  );
}

export default function MetricStrip({ summary, deviceCount = 0, liveAudio = null }) {
  const audioLive = liveAudio && liveAudio.count > 0;
  return (
    <div className="panel flex">
      <Cell label="Total Incidents" value={summary?.total_incidents} />
      <Cell label="Last 24h"        value={summary?.incidents_last_24h} tone="ok" />
      <Cell label="Pending Review"  value={summary?.pending_review} tone="warn" />
      <Cell
        label="Avg Audio"
        value={audioLive ? `${liveAudio.avg.toFixed(1)} dBFS` : (summary ? `${summary.avg_audio_db} dB` : null)}
        tone="accent"
        hint={
          audioLive
            ? `${liveAudio.count} cam${liveAudio.count > 1 ? 's' : ''} live`
            : (summary ? 'from violations' : undefined)
        }
      />
      <Cell label="Avg Vibration"   value={summary ? `${summary.avg_vibration_g} g` : null} tone="accent" />
      <Cell label="Devices"         value={deviceCount || null} />
    </div>
  );
}
