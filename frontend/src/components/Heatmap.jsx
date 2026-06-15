export default function Heatmap({ data }) {
  const devices = Array.from(new Set(data.map((d) => d.device_id))).sort();
  const hours = Array.from({ length: 24 }, (_, h) => h);
  const max = Math.max(1, ...data.map((d) => d.count));

  const cell = (device, hour) =>
    data.find((d) => d.device_id === device && d.hour === hour)?.count ?? 0;

  const tone = (n) => {
    if (n === 0) return 'bg-echo-panel-2';
    const intensity = n / max;
    if (intensity > 0.75) return 'bg-echo-crit/80 text-white';
    if (intensity > 0.5) return 'bg-echo-warn/80 text-white';
    if (intensity > 0.25) return 'bg-echo-accent/60 text-white';
    return 'bg-echo-accent/30 text-echo-text';
  };

  if (devices.length === 0) {
    return <div className="text-echo-dim text-sm italic py-8 text-center">No spatial data yet.</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="text-[11px] border-separate border-spacing-0.5">
        <thead>
          <tr>
            <th className="text-left px-1 text-echo-faint font-normal">Device \ Hour</th>
            {hours.map((h) => (
              <th key={h} className="text-echo-faint font-normal w-6">{h.toString().padStart(2, '0')}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {devices.map((d) => (
            <tr key={d}>
              <td className="pr-2 text-echo-text whitespace-nowrap">{d}</td>
              {hours.map((h) => {
                const c = cell(d, h);
                return (
                  <td
                    key={h}
                    title={`${d} @ ${h}:00 — ${c} incidents`}
                    className={`${tone(c)} text-center rounded w-6 h-6`}
                  >
                    {c || ''}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
