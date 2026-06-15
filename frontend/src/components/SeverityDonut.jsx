import { useMemo } from 'react';
import { PieChart as PieIcon } from 'lucide-react';
import { severity } from './IncidentRow.jsx';

const SAMPLE_SIZE = 100; // count severity over the most recent N events

export default function SeverityDonut({ incidents, review }) {
  const { counts, total } = useMemo(() => {
    const all = [...(incidents || []), ...(review || [])]
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, SAMPLE_SIZE);
    const c = { crit: 0, warn: 0, ok: 0 };
    for (const r of all) c[severity(r.audio_db, r.vibration_g)]++;
    return { counts: c, total: all.length };
  }, [incidents, review]);

  const pct = (n) => (total === 0 ? 0 : (n / total) * 100);
  const critPct = pct(counts.crit);
  const warnPct = pct(counts.warn);

  // conic-gradient backdrop = donut "ring", inner panel-colored circle = hole.
  const gradient =
    total === 0
      ? `rgb(var(--echo-line))`
      : `conic-gradient(
          rgb(var(--echo-crit))   0%               ${critPct}%,
          rgb(var(--echo-warn))   ${critPct}%      ${critPct + warnPct}%,
          rgb(var(--echo-ok))     ${critPct + warnPct}% 100%
        )`;

  return (
    <section className="panel p-3 flex flex-col">
      <div className="flex items-center gap-1.5 text-2xs uppercase tracking-wider text-echo-faint">
        <PieIcon className="w-3 h-3" /> Severity Mix
        <span className="ml-auto text-2xs text-echo-dim normal-case tracking-normal">last {Math.min(SAMPLE_SIZE, total)}</span>
      </div>

      <div className="flex-1 flex items-center justify-center gap-4 mt-2">
        <div
          className="relative shrink-0"
          style={{
            width: 84,
            height: 84,
            borderRadius: '50%',
            background: gradient,
          }}
        >
          <div
            className="absolute inset-0 flex flex-col items-center justify-center bg-echo-panel rounded-full"
            style={{ inset: 10 }}
          >
            <div className="text-base font-semibold text-echo-text tabular-nums leading-none">{total}</div>
            <div className="text-2xs text-echo-faint mt-0.5">events</div>
          </div>
        </div>

        <ul className="text-2xs space-y-1.5 font-mono">
          <li className="flex items-center gap-2 tabular-nums">
            <span className="w-1.5 h-1.5 rounded-full bg-echo-crit" />
            <span className="text-echo-faint w-10">CRIT</span>
            <span className="text-echo-text w-6 text-right">{counts.crit}</span>
            <span className="text-echo-dim">{critPct.toFixed(0)}%</span>
          </li>
          <li className="flex items-center gap-2 tabular-nums">
            <span className="w-1.5 h-1.5 rounded-full bg-echo-warn" />
            <span className="text-echo-faint w-10">WARN</span>
            <span className="text-echo-text w-6 text-right">{counts.warn}</span>
            <span className="text-echo-dim">{warnPct.toFixed(0)}%</span>
          </li>
          <li className="flex items-center gap-2 tabular-nums">
            <span className="w-1.5 h-1.5 rounded-full bg-echo-ok" />
            <span className="text-echo-faint w-10">OK</span>
            <span className="text-echo-text w-6 text-right">{counts.ok}</span>
            <span className="text-echo-dim">{pct(counts.ok).toFixed(0)}%</span>
          </li>
        </ul>
      </div>
    </section>
  );
}
