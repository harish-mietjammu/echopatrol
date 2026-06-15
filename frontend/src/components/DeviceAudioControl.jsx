import { Play, Square, AlertTriangle } from 'lucide-react';

/**
 * Per-device live-audio button. Each edge node is backed by one IP camera; this
 * relays that camera's RTSP audio (ffmpeg → MP3 on the backend) into an <audio>
 * element owned by the Devices page. Presentational only — play/stop state and
 * the shared <audio> element live in the parent so just one stream plays at a time.
 */
export default function DeviceAudioControl({ hasCamera, isPlaying, isLoading, hasError, onToggle }) {
  if (!hasCamera) {
    return <span className="text-2xs text-echo-dim">—</span>;
  }

  return (
    <button
      onClick={onToggle}
      disabled={isLoading}
      title={isPlaying ? 'Stop live audio' : 'Listen to live camera audio'}
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-2xs transition-colors disabled:opacity-40 ${
        hasError
          ? 'border-echo-crit/40 text-echo-crit hover:bg-echo-crit/10'
          : isPlaying
            ? 'border-echo-crit/40 text-echo-crit hover:bg-echo-crit/10'
            : 'border-echo-accent/40 text-echo-accent hover:bg-echo-accent/10'
      }`}
    >
      {hasError ? (
        <AlertTriangle className="w-3 h-3" />
      ) : isPlaying ? (
        <Square className="w-3 h-3" />
      ) : (
        <Play className="w-3 h-3" />
      )}
      {isLoading ? '…' : hasError ? 'Err' : isPlaying ? 'Stop' : 'Listen'}
    </button>
  );
}
