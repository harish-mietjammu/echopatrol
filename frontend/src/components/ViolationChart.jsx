import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useTheme } from '../state/useTheme.js';

const palette = {
  light: {
    grid: '#e2e8f0',     // slate-200
    axis: '#64748b',     // slate-500
    audio: '#0284c7',    // sky-700
    peak:  '#dc2626',    // red-600
    vibration: '#d97706',// amber-600
    tooltipBg: '#ffffff',
    tooltipBorder: '#e2e8f0',
    tooltipText: '#0f172a',
  },
  dark: {
    grid: '#1e293b',
    axis: '#64748b',
    audio: '#38bdf8',
    peak: '#ef4444',
    vibration: '#f59e0b',
    tooltipBg: '#0f172a',
    tooltipBorder: '#1e293b',
    tooltipText: '#f1f5f9',
  },
};

export default function ViolationChart({ data }) {
  const { theme } = useTheme();
  const p = palette[theme] || palette.light;

  const cleaned = data.map((d) => ({
    bucket: new Date(d.bucket).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit' }),
    avg_audio_db: Number(d.avg_audio_db?.toFixed?.(1) ?? d.avg_audio_db),
    peak_audio_db: Number(d.peak_audio_db?.toFixed?.(1) ?? d.peak_audio_db),
    avg_vibration_g: Number(d.avg_vibration_g?.toFixed?.(2) ?? d.avg_vibration_g),
    count: d.count,
  }));

  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={cleaned} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={p.grid} strokeDasharray="3 3" />
          <XAxis dataKey="bucket" stroke={p.axis} fontSize={11} />
          <YAxis yAxisId="db" stroke={p.audio} fontSize={11} label={{ value: 'dB', angle: -90, position: 'insideLeft', fill: p.audio, fontSize: 10 }} />
          <YAxis yAxisId="g" orientation="right" stroke={p.vibration} fontSize={11} label={{ value: 'g', angle: -90, position: 'insideRight', fill: p.vibration, fontSize: 10 }} />
          <Tooltip contentStyle={{ background: p.tooltipBg, border: `1px solid ${p.tooltipBorder}`, borderRadius: 8, color: p.tooltipText }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line yAxisId="db" type="monotone" dataKey="avg_audio_db" stroke={p.audio} strokeWidth={2} dot={false} name="avg dB" />
          <Line yAxisId="db" type="monotone" dataKey="peak_audio_db" stroke={p.peak} strokeWidth={1} strokeDasharray="4 4" dot={false} name="peak dB" />
          <Line yAxisId="g" type="monotone" dataKey="avg_vibration_g" stroke={p.vibration} strokeWidth={2} dot={false} name="avg g" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
