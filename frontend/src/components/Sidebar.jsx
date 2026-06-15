import { NavLink } from 'react-router-dom';
import { Radio, List, Cpu, BarChart3, Activity, Sun, Moon } from 'lucide-react';
import { useTheme } from '../state/useTheme.js';

const items = [
  { to: '/', label: 'Live Ops', icon: Radio, end: true },
  { to: '/incidents', label: 'Incidents', icon: List },
  { to: '/devices', label: 'Devices', icon: Cpu },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
];

export default function Sidebar({ connected, summary }) {
  const { theme, toggle } = useTheme();

  return (
    <aside className="w-52 shrink-0 bg-echo-panel border-r border-echo-line flex flex-col">
      <div className="px-4 py-4 border-b border-echo-line">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-echo-accent" />
          <div>
            <div className="text-sm font-semibold text-echo-text leading-tight">
              <span className="text-echo-accent">Echo</span>Patrol
            </div>
            <div className="text-2xs text-echo-faint leading-tight">Ops Console v3</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 py-2">
        {items.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex items-center gap-2 px-4 py-2 text-xs border-l-2 transition-colors ${
                isActive
                  ? 'border-echo-accent bg-echo-accent/10 text-echo-text'
                  : 'border-transparent text-echo-muted hover:text-echo-text hover:bg-echo-panel-2'
              }`
            }
          >
            <Icon className="w-4 h-4" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-echo-line p-3 space-y-2">
        <div className="flex items-center justify-between text-2xs">
          <span className="text-echo-faint">Stream</span>
          <span className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-echo-ok animate-pulse' : 'bg-echo-crit'}`} />
            <span className={connected ? 'text-echo-ok' : 'text-echo-crit'}>
              {connected ? 'LIVE' : 'OFFLINE'}
            </span>
          </span>
        </div>
        {summary && (
          <>
            <div className="flex items-center justify-between text-2xs">
              <span className="text-echo-faint">Pending</span>
              <span className="text-echo-warn font-medium">{summary.pending_review}</span>
            </div>
            <div className="flex items-center justify-between text-2xs">
              <span className="text-echo-faint">24h</span>
              <span className="text-echo-text-2">{summary.incidents_last_24h}</span>
            </div>
          </>
        )}

        <button
          onClick={toggle}
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          className="w-full mt-2 flex items-center justify-between text-2xs px-2 py-1.5 rounded border border-echo-line hover:bg-echo-panel-2 text-echo-muted hover:text-echo-text transition-colors"
        >
          <span className="flex items-center gap-1.5">
            {theme === 'dark' ? <Moon className="w-3 h-3" /> : <Sun className="w-3 h-3" />}
            {theme === 'dark' ? 'Dark' : 'Light'}
          </span>
          <span className="text-echo-dim">toggle</span>
        </button>
      </div>
    </aside>
  );
}
