import { useEffect, useState } from 'react';
import { X, ImageOff, MapPin, Clock, Cpu, Volume2, Activity, Hash } from 'lucide-react';
import { api } from '../services/api.js';
import { severity } from './IncidentRow.jsx';

function Stat({ icon: Icon, label, value, tone }) {
  const toneClass = {
    accent: 'text-echo-accent',
    warn: 'text-echo-warn',
    crit: 'text-echo-crit',
  }[tone] || 'text-echo-text';
  return (
    <div>
      <div className="flex items-center gap-1.5 text-2xs uppercase tracking-wider text-echo-faint">
        <Icon className="w-3 h-3" />
        {label}
      </div>
      <div className={`mt-1 text-base font-semibold font-mono tabular-nums ${toneClass}`}>{value}</div>
    </div>
  );
}

export default function IncidentDetailDrawer({ incident, onClose, onResolve }) {
  const [history, setHistory] = useState(null);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
    setHistory(null);
    if (!incident) return;
    api
      .listViolations({ license_plate: incident.license_plate_text, limit: 25 })
      .then((rows) => setHistory(rows.filter((r) => r.id !== incident.id)))
      .catch(() => setHistory([]));
  }, [incident?.id, incident?.license_plate_text]);

  useEffect(() => {
    const onEsc = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [onClose]);

  if (!incident) return null;

  const sev = severity(incident.audio_db, incident.vibration_g);
  const sevTone = { crit: 'crit', warn: 'warn', ok: 'accent' }[sev];

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-30" onClick={onClose} />
      <aside className="fixed right-0 top-0 h-full w-[480px] bg-echo-panel border-l border-echo-line z-40 flex flex-col shadow-2xl">
        <header className="px-4 py-3 border-b border-echo-line flex items-center justify-between">
          <div>
            <div className="text-2xs uppercase tracking-wider text-echo-faint">Incident</div>
            <div className="text-lg font-semibold font-mono text-echo-text">#{incident.id}</div>
          </div>
          <button
            onClick={onClose}
            className="text-echo-faint hover:text-echo-text transition-colors"
            title="Close (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto">
          {/* Image evidence */}
          <div className="aspect-video bg-echo-panel-2 border-b border-echo-line flex items-center justify-center text-echo-dim relative">
            {!imgError && incident.image_url && incident.image_url.startsWith('http') ? (
              <img
                src={incident.image_url}
                alt={incident.license_plate_text}
                className="w-full h-full object-cover"
                onError={() => setImgError(true)}
              />
            ) : (
              <div className="flex flex-col items-center gap-2 text-echo-dim text-xs">
                <ImageOff className="w-8 h-8" />
                <span>No evidence image available</span>
              </div>
            )}
            <div className="absolute top-2 left-2 flex gap-1.5">
              <span className={`text-2xs font-semibold px-2 py-0.5 rounded ${
                sev === 'crit' ? 'bg-echo-crit/30 text-echo-crit'
                : sev === 'warn' ? 'bg-echo-warn/30 text-echo-warn'
                : 'bg-echo-panel-2 text-echo-muted'
              }`}>
                {sev.toUpperCase()}
              </span>
              {incident.cluster_id && (
                <span className="text-2xs bg-echo-panel-2 text-echo-muted px-2 py-0.5 rounded font-mono">
                  cluster #{incident.cluster_id}
                </span>
              )}
            </div>
          </div>

          {/* License plate hero */}
          <div className="px-4 py-4 border-b border-echo-line">
            <div className="text-2xs uppercase tracking-wider text-echo-faint mb-1">License Plate (OCR)</div>
            <div className="flex items-baseline gap-3">
              <span className="text-2xl font-mono font-bold tracking-wide text-echo-text">
                {incident.license_plate_text}
              </span>
              <span className={`text-xs font-medium ${
                incident.confidence_score < 0.80 ? 'text-echo-warn' : 'text-echo-ok'
              }`}>
                {(incident.confidence_score * 100).toFixed(0)}% confidence
              </span>
            </div>
            {incident.needs_review === 1 && (
              <div className="mt-2 text-2xs text-echo-warn">
                ⚠ Below 80% threshold — awaiting manual review
              </div>
            )}
          </div>

          {/* Metrics grid */}
          <div className="px-4 py-4 grid grid-cols-3 gap-4 border-b border-echo-line">
            <Stat icon={Volume2}  label="Audio"     value={`${incident.audio_db.toFixed(1)} dB`} tone={sevTone} />
            <Stat icon={Activity} label="Vibration" value={`${incident.vibration_g.toFixed(2)} g`} tone={sevTone} />
            <Stat icon={Hash}     label="Freq Peak" value={`${incident.peak_frequency_hz.toFixed(0)} Hz`} />
          </div>

          {/* Meta */}
          <div className="px-4 py-4 space-y-3 border-b border-echo-line text-xs">
            <div className="flex items-center gap-2">
              <Cpu className="w-3.5 h-3.5 text-echo-faint" />
              <span className="text-echo-faint w-20">Device</span>
              <span className="font-mono text-echo-text">{incident.device_id}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-echo-faint" />
              <span className="text-echo-faint w-20">Captured</span>
              <span className="font-mono text-echo-text">{new Date(incident.timestamp).toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-2">
              <MapPin className="w-3.5 h-3.5 text-echo-faint" />
              <span className="text-echo-faint w-20">Location</span>
              <span className="text-echo-faint italic">— not captured —</span>
            </div>
          </div>

          {/* Plate history */}
          <div className="px-4 py-4">
            <div className="text-2xs uppercase tracking-wider text-echo-faint mb-2 flex items-center justify-between">
              <span>Prior offences — {incident.license_plate_text}</span>
              <span className="text-echo-dim">{history ? history.length : '…'}</span>
            </div>
            {history === null ? (
              <div className="text-2xs text-echo-dim italic">Loading…</div>
            ) : history.length === 0 ? (
              <div className="text-2xs text-echo-dim italic">First recorded incident for this plate.</div>
            ) : (
              <ul className="space-y-1">
                {history.map((h) => (
                  <li key={h.id} className="text-2xs font-mono flex items-center justify-between text-echo-muted hover:text-echo-text py-0.5">
                    <span>#{h.id}</span>
                    <span>{h.audio_db.toFixed(1)}dB / {h.vibration_g.toFixed(2)}g</span>
                    <span className="text-echo-dim">{new Date(h.timestamp).toLocaleDateString()}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <footer className="px-4 py-3 border-t border-echo-line flex items-center justify-between gap-2">
          <div className="text-2xs text-echo-dim">Press <kbd className="px-1 py-0.5 bg-echo-panel-2 rounded font-mono">Esc</kbd> to close</div>
          {incident.needs_review === 1 && (
            <button
              onClick={() => { onResolve(incident.id); onClose(); }}
              className="text-xs bg-echo-accent/20 hover:bg-echo-accent/40 text-echo-accent px-3 py-1.5 rounded transition font-medium"
            >
              Confirm plate
            </button>
          )}
        </footer>
      </aside>
    </>
  );
}
