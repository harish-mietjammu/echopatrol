/**
 * Lightweight CSS-variable-aware sparkline. Pass the CSS variable *name* via
 * colorVar (e.g. '--echo-accent') so the stroke re-themes automatically when
 * the user toggles dark/light without remount.
 */
export default function Sparkline({
  values,
  colorVar = '--echo-accent',
  height = 24,
  width = 80,
  className = '',
}) {
  if (!values || values.length < 2) {
    return (
      <div
        style={{ width, height }}
        className={`flex items-center justify-center text-2xs text-echo-dim ${className}`}
      >
        —
      </div>
    );
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pad = 2;
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - ((v - min) / range) * (height - 2 * pad) - pad;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      style={{ width, height }}
      preserveAspectRatio="none"
      className={className}
    >
      <polyline
        points={points}
        fill="none"
        stroke={`rgb(var(${colorVar}))`}
        strokeWidth="1.25"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
