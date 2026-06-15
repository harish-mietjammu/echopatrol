import { useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';
import { severity } from './IncidentRow.jsx';

const TOP_N = 5;
const SEV_DOT = {
  crit: 'bg-echo-crit',
  warn: 'bg-echo-warn',
  ok:   'bg-echo-dim',
};

export default function TopOffenders({ incidents, review, onSelectIncident }) {
  const top = useMemo(() => {
    const all = [...(incidents || []), ...(review || [])];
    const m = new Map();
    for (const r of all) {
      const key = r.license_plate_text;
      if (!m.has(key)) {
        m.set(key, { plate: key, count: 0, latest: r, maxDb: r.audio_db });
        continue;
      }
      const c = m.get(key);
      c.count += 1;
      if (r.audio_db > c.maxDb) c.maxDb = r.audio_db;
      if (new Date(r.timestamp) > new Date(c.latest.timestamp)) c.latest = r;
    }
    // first incident counted as well — adjust to actual count
    for (const v of m.values()) {
      v.count = all.filter((r) => r.license_plate_text === v.plate).length;
    }
    return [...m.values()]
      .sort((a, b) => b.count - a.count || b.maxDb - a.maxDb)
      .slice(0, TOP_N);
  }, [incidents, review]);

  return (
    <section className="panel p-3 flex flex-col">
      <div className="flex items-center gap-1.5 text-2xs uppercase tracking-wider text-echo-faint">
        <AlertTriangle className="w-3 h-3" /> Top Offenders
        <span className="ml-auto text-2xs text-echo-dim normal-case tracking-normal">this session</span>
      </div>

      {top.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-2xs text-echo-dim italic">
          No data yet.
        </div>
      ) : (
        <ol className="mt-2 space-y-1">
          {top.map((o, i) => {
            const sev = severity(o.latest.audio_db, o.latest.vibration_g);
            return (
              <li key={o.plate}>
                <button
                  onClick={() => onSelectIncident?.(o.latest)}
                  className="w-full flex items-center gap-2 text-xs px-1.5 py-1 rounded hover:bg-echo-panel-2 transition-colors font-mono tabular-nums text-left"
                >
                  <span className="text-echo-dim w-3">{i + 1}</span>
                  <span className={`w-1.5 h-1.5 rounded-full ${SEV_DOT[sev]}`} />
                  <span className="text-echo-text flex-1 truncate">{o.plate}</span>
                  <span className="text-echo-accent">{o.maxDb.toFixed(0)}<span className="text-echo-faint text-2xs">dB</span></span>
                  <span className="text-2xs bg-echo-warn/20 text-echo-warn px-1.5 rounded">×{o.count}</span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
