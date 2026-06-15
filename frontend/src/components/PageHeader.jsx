export default function PageHeader({ title, subtitle, right }) {
  return (
    <div className="flex items-end justify-between mb-3">
      <div>
        <h1 className="text-base font-semibold text-echo-text">{title}</h1>
        {subtitle && <div className="text-2xs text-echo-faint">{subtitle}</div>}
      </div>
      {right}
    </div>
  );
}
