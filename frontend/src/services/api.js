const base = '/api/v1';

async function jget(path) {
  const r = await fetch(`${base}${path}`);
  if (!r.ok) throw new Error(`GET ${path} -> ${r.status}`);
  return r.json();
}

async function jpost(path, body) {
  const r = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : null,
  });
  if (!r.ok) throw new Error(`POST ${path} -> ${r.status}`);
  return r.json();
}

export const api = {
  listViolations: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return jget(`/violations${q ? `?${q}` : ''}`);
  },
  getViolation: (id) => jget(`/violations/${id}`),
  resolveReview: (id) => jpost(`/violations/${id}/review`),
  summary: () => jget('/analytics/summary'),
  timeseries: (bucket = 60) => jget(`/analytics/timeseries?bucket_minutes=${bucket}`),
  heatmap: () => jget('/analytics/heatmap'),
  devices: () => jget('/devices'),
  getConfig: (deviceId) => jget(`/config?device_id=${encodeURIComponent(deviceId)}`),
  cameras: () => jget('/cameras'),
  cameraAudioUrl: (id) => `${base}/cameras/${encodeURIComponent(id)}/audio`,
  pingCamera: (id) => jget(`/cameras/${encodeURIComponent(id)}/ping`),
  cameraLevels: () => jget('/cameras/levels'),
};
