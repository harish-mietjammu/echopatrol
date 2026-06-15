// RFC 4180 CSV escaping: quote fields containing comma/quote/newline; double embedded quotes.
function escapeCSV(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCSV(rows, columns) {
  if (!rows || rows.length === 0) return '';
  const cols = columns || Object.keys(rows[0]);
  const header = cols.join(',');
  const body = rows.map((r) => cols.map((c) => escapeCSV(r[c])).join(',')).join('\n');
  return header + '\n' + body + '\n';
}

export function downloadFile(filename, content, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function timestampSlug(d = new Date()) {
  return d.toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
}

// Columns we export for incidents — order matters (becomes the CSV header order).
export const INCIDENT_EXPORT_COLUMNS = [
  'id',
  'timestamp',
  'device_id',
  'license_plate_text',
  'confidence_score',
  'needs_review',
  'audio_db',
  'vibration_g',
  'peak_frequency_hz',
  'cluster_id',
  'image_url',
];

export function exportIncidents(rows, { scope = 'incidents', format = 'csv' } = {}) {
  const ts = timestampSlug();
  if (format === 'json') {
    downloadFile(
      `echopatrol-${scope}-${ts}.json`,
      JSON.stringify(rows, null, 2),
      'application/json;charset=utf-8',
    );
  } else {
    downloadFile(
      `echopatrol-${scope}-${ts}.csv`,
      toCSV(rows, INCIDENT_EXPORT_COLUMNS),
      'text/csv;charset=utf-8',
    );
  }
}
