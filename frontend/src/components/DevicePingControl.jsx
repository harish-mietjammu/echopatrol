import { useState } from 'react';
import { Wifi, WifiOff, Loader2 } from 'lucide-react';
import { api } from '../services/api.js';

/**
 * Reachability check for a camera-backed edge node. Clicking opens a TCP
 * connection to the camera's RTSP port on the backend and reports latency or
 * failure. Self-contained per row — each device pings independently.
 */
export default function DevicePingControl({ cameraId }) {
  const [state, setState] = useState('idle'); // idle | loading | ok | fail
  const [result, setResult] = useState(null);

  if (!cameraId) return <span className="text-2xs text-echo-dim">—</span>;

  const ping = () => {
    setState('loading');
    api
      .pingCamera(cameraId)
      .then((r) => {
        setResult(r);
        setState(r.reachable ? 'ok' : 'fail');
      })
      .catch(() => {
        setResult(null);
        setState('fail');
      });
  };

  const tone =
    state === 'ok'
      ? 'border-echo-ok/40 text-echo-ok hover:bg-echo-ok/10'
      : state === 'fail'
        ? 'border-echo-crit/40 text-echo-crit hover:bg-echo-crit/10'
        : 'border-echo-line text-echo-muted hover:bg-echo-panel-2 hover:text-echo-text';

  const title =
    state === 'ok'
      ? `${result?.host}:${result?.port} reachable in ${result?.latency_ms}ms — click to re-check`
      : state === 'fail'
        ? `${result?.host ?? 'camera'} unreachable${result?.detail ? ` — ${result.detail}` : ''} — click to retry`
        : 'Check camera reachability';

  return (
    <button
      onClick={ping}
      disabled={state === 'loading'}
      title={title}
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-2xs tabular-nums transition-colors disabled:opacity-40 ${tone}`}
    >
      {state === 'loading' ? (
        <Loader2 className="w-3 h-3 animate-spin" />
      ) : state === 'fail' ? (
        <WifiOff className="w-3 h-3" />
      ) : (
        <Wifi className="w-3 h-3" />
      )}
      {state === 'loading'
        ? '…'
        : state === 'ok'
          ? `${result.latency_ms}ms`
          : state === 'fail'
            ? 'down'
            : 'Ping'}
    </button>
  );
}
