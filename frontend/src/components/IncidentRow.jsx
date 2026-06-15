import { AlertTriangle, AlertOctagon, CheckCircle2 } from 'lucide-react';

export function severity(audio_db, vibration_g) {
  if (audio_db >= 100 || vibration_g >= 2.5) return 'crit';
  if (audio_db >= 90 || vibration_g >= 1.8) return 'warn';
  return 'ok';
}

const tone = {
  crit: { color: 'text-echo-crit',  icon: AlertOctagon, dot: 'bg-echo-crit',  label: 'CRIT' },
  warn: { color: 'text-echo-warn',  icon: AlertTriangle, dot: 'bg-echo-warn', label: 'WARN' },
  ok:   { color: 'text-echo-muted', icon: CheckCircle2, dot: 'bg-echo-dim',   label: 'OK  ' },
};

function timeAgo(ts) {
  const d = new Date(ts);
  const s = Math.max(0, (Date.now() - d.getTime()) / 1000);
  if (s < 60) return `${Math.floor(s)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export default function IncidentRow({ incident, onClick, selected }) {
  const sev = severity(incident.audio_db, incident.vibration_g);
  const t = tone[sev];
  return (
    <div
      onClick={() => onClick?.(incident)}
      className={`dense-row font-mono ${selected ? 'bg-echo-accent/10 border-l-2 border-l-echo-accent' : ''}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${t.dot}`} />
      <span className="text-echo-faint w-12 shrink-0">#{incident.id}</span>
      <span className={`${t.color} font-semibold w-10 shrink-0`}>{t.label}</span>
      <span className="text-echo-text w-24 shrink-0 truncate">{incident.license_plate_text}</span>
      <span className="text-echo-accent w-16 text-right shrink-0">{incident.audio_db.toFixed(1)}<span className="text-echo-faint">dB</span></span>
      <span className="text-echo-warn w-14 text-right shrink-0">{incident.vibration_g.toFixed(2)}<span className="text-echo-faint">g</span></span>
      <span className="text-echo-faint w-12 text-right shrink-0">{incident.peak_frequency_hz.toFixed(0)}<span className="opacity-60">Hz</span></span>
      <span className="text-echo-muted flex-1 truncate min-w-0">{incident.device_id}</span>
      {incident.cluster_id && (
        <span className="text-2xs bg-echo-panel-2 text-echo-muted px-1 rounded">×{incident.cluster_id}</span>
      )}
      {incident.confidence_score < 0.80 && (
        <span className="text-2xs bg-echo-warn/20 text-echo-warn px-1 rounded">OCR{(incident.confidence_score * 100).toFixed(0)}</span>
      )}
      <span className="text-echo-faint w-8 text-right shrink-0 tabular-nums">{timeAgo(incident.timestamp)}</span>
    </div>
  );
}
