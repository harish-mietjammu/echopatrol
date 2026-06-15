import { useState, useEffect, useRef, useMemo } from 'react';
import { ChevronUp, Radio, ClipboardCheck, Search, ArrowDownUp, X, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Download } from 'lucide-react';
import PageHeader from '../components/PageHeader.jsx';
import MetricStrip from '../components/MetricStrip.jsx';
import LiveRateChart from '../components/LiveRateChart.jsx';
import SeverityDonut from '../components/SeverityDonut.jsx';
import TopOffenders from '../components/TopOffenders.jsx';
import IncidentRow, { severity } from '../components/IncidentRow.jsx';
import { api } from '../services/api.js';
import { exportIncidents } from '../utils/export.js';

const SORT_OPTIONS = [
  { id: 'newest',         label: 'Newest first' },
  { id: 'oldest',         label: 'Oldest first' },
  { id: 'audio_desc',     label: 'Loudest first (dB)' },
  { id: 'audio_asc',      label: 'Quietest first (dB)' },
  { id: 'vibration_desc', label: 'Most vibration (g)' },
  { id: 'vibration_asc',  label: 'Least vibration (g)' },
];

const PAGE_SIZES = [25, 50, 100, 200];

const SEVERITIES = ['crit', 'warn', 'ok'];
const SEV_TONE = {
  crit: { on: 'bg-echo-crit/20 text-echo-crit border-echo-crit/40', off: 'border-echo-line text-echo-faint hover:text-echo-text' },
  warn: { on: 'bg-echo-warn/20 text-echo-warn border-echo-warn/40', off: 'border-echo-line text-echo-faint hover:text-echo-text' },
  ok:   { on: 'bg-echo-ok/20 text-echo-ok border-echo-ok/40',       off: 'border-echo-line text-echo-faint hover:text-echo-text' },
};

function applyFilters(rows, { search, severities, sortBy }) {
  const q = search.trim().toUpperCase();
  const sevFilter = new Set(severities);
  let out = rows.filter((r) => sevFilter.has(severity(r.audio_db, r.vibration_g)));
  if (q) out = out.filter((r) => r.license_plate_text.toUpperCase().includes(q) || r.device_id.toUpperCase().includes(q));
  out = [...out].sort((a, b) => {
    switch (sortBy) {
      case 'oldest':         return new Date(a.timestamp) - new Date(b.timestamp);
      case 'audio_desc':     return b.audio_db - a.audio_db;
      case 'audio_asc':      return a.audio_db - b.audio_db;
      case 'vibration_desc': return b.vibration_g - a.vibration_g;
      case 'vibration_asc':  return a.vibration_g - b.vibration_g;
      default:               return new Date(b.timestamp) - new Date(a.timestamp); // newest
    }
  });
  return out;
}

export default function LiveOps({ ctx, onSelectIncident }) {
  const { incidents, review, summary, newSinceVisit, ackNewSinceVisit } = ctx;
  const [deviceCount, setDeviceCount] = useState(0);
  const [tab, setTab] = useState('live');
  const [pulseKey, setPulseKey] = useState(0);
  const prevReviewLen = useRef(review.length);

  // filter / sort / search state (shared across tabs so toggling preserves intent)
  const [search, setSearch] = useState('');
  const [severities, setSeverities] = useState(new Set(SEVERITIES));
  const [sortBy, setSortBy] = useState('newest');

  // pagination
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(50);

  useEffect(() => {
    api.devices().then((d) => setDeviceCount(d.length)).catch(() => {});
  }, [summary?.total_incidents]);

  // Live audio level across all streaming cameras, polled once a second.
  const [liveAudio, setLiveAudio] = useState(null);
  useEffect(() => {
    let active = true;
    const poll = () =>
      api
        .cameraLevels()
        .then((rows) => {
          if (!active) return;
          const live = rows.filter(
            (r) => r.status === 'live' && r.rms_dbfs != null && (r.age_s == null || r.age_s < 6),
          );
          if (live.length === 0) { setLiveAudio({ avg: null, count: 0 }); return; }
          const avg = live.reduce((s, r) => s + r.rms_dbfs, 0) / live.length;
          setLiveAudio({ avg, count: live.length });
        })
        .catch(() => {});
    poll();
    const id = setInterval(poll, 1000);
    return () => { active = false; clearInterval(id); };
  }, []);

  useEffect(() => {
    ackNewSinceVisit();
  }, []); // mount only

  useEffect(() => {
    if (review.length > prevReviewLen.current) setPulseKey((k) => k + 1);
    prevReviewLen.current = review.length;
  }, [review.length]);

  const sourceRows = tab === 'live' ? incidents : review;
  const filteredRows = useMemo(
    () => applyFilters(sourceRows, { search, severities: [...severities], sortBy }),
    [sourceRows, search, severities, sortBy],
  );

  // pagination derived state
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / perPage));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * perPage;
  const end = Math.min(start + perPage, filteredRows.length);
  const pageRows = filteredRows.slice(start, end);

  // reset to page 1 whenever filters/tab/perPage change
  useEffect(() => { setPage(1); }, [tab, search, severities, sortBy, perPage]);

  const toggleSev = (s) =>
    setSeverities((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s); else next.add(s);
      // Don't allow zero — bounce back to all if user deselects last
      if (next.size === 0) return new Set(SEVERITIES);
      return next;
    });

  const resetFilters = () => {
    setSearch('');
    setSeverities(new Set(SEVERITIES));
    setSortBy('newest');
  };

  const filtersActive = search || severities.size !== SEVERITIES.length || sortBy !== 'newest';

  const tabs = [
    { id: 'live',   label: 'Live Feed',     icon: Radio,          count: incidents.length, tone: 'default' },
    { id: 'review', label: 'Review Queue',  icon: ClipboardCheck, count: review.length,    tone: review.length > 0 ? 'warn' : 'default' },
  ];

  return (
    <div className="space-y-3">
      <PageHeader
        title="Live Operations"
        subtitle="Real-time violation stream from edge nodes"
      />

      <MetricStrip summary={summary} deviceCount={deviceCount} liveAudio={liveAudio} />

      <div className="grid gap-3" style={{ gridTemplateColumns: '2fr 1.3fr 2fr' }}>
        <LiveRateChart incidents={incidents} review={review} />
        <SeverityDonut incidents={incidents} review={review} />
        <TopOffenders incidents={incidents} review={review} onSelectIncident={onSelectIncident} />
      </div>

      <section className="panel flex flex-col">
        {/* Tab bar */}
        <div className="flex items-stretch border-b border-echo-line">
          {tabs.map(({ id, label, icon: Icon, count, tone }) => {
            const isActive = tab === id;
            const badgeIsWarn = tone === 'warn';
            return (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`group flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 -mb-px transition-colors ${
                  isActive
                    ? 'border-echo-accent text-echo-text bg-echo-panel'
                    : 'border-transparent text-echo-muted hover:text-echo-text hover:bg-echo-panel-2'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{label}</span>
                <span
                  key={id === 'review' ? pulseKey : undefined}
                  className={`text-2xs tabular-nums px-1.5 py-0.5 rounded ${
                    badgeIsWarn
                      ? 'bg-echo-warn/20 text-echo-warn echo-flash'
                      : isActive
                        ? 'bg-echo-accent/15 text-echo-accent'
                        : 'bg-echo-panel-2 text-echo-faint'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}

          <div className="ml-auto flex items-center gap-2 px-3">
            {newSinceVisit > 0 && (
              <button
                onClick={ackNewSinceVisit}
                className="text-2xs bg-echo-accent/20 text-echo-accent px-2 py-0.5 rounded flex items-center gap-1 hover:bg-echo-accent/40 transition"
              >
                <ChevronUp className="w-3 h-3" />
                {newSinceVisit} new
              </button>
            )}
            <span className="text-2xs text-echo-faint tabular-nums">
              {filteredRows.length}
              {filteredRows.length !== sourceRows.length && (
                <span className="text-echo-dim"> / {sourceRows.length}</span>
              )}
            </span>
          </div>
        </div>

        {/* Filter / search / sort bar */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-echo-line-soft bg-echo-panel-2/30">
          <div className="flex items-center gap-1.5 bg-echo-bg border border-echo-line rounded px-2 py-1 flex-1 max-w-xs">
            <Search className="w-3.5 h-3.5 text-echo-faint" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search plate or device…"
              className="bg-transparent text-xs text-echo-text placeholder:text-echo-dim outline-none w-full font-mono"
            />
            {search && (
              <button onClick={() => setSearch('')} className="text-echo-faint hover:text-echo-text" title="Clear">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1">
            {SEVERITIES.map((s) => {
              const isOn = severities.has(s);
              const t = SEV_TONE[s];
              return (
                <button
                  key={s}
                  onClick={() => toggleSev(s)}
                  className={`text-2xs font-mono uppercase px-2 py-1 rounded border transition-colors ${
                    isOn ? t.on : t.off
                  }`}
                  title={`Toggle ${s.toUpperCase()}`}
                >
                  {s}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-1.5 ml-auto">
            <ArrowDownUp className="w-3 h-3 text-echo-faint" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="bg-echo-bg border border-echo-line rounded px-2 py-1 text-2xs text-echo-text"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
            {filtersActive && (
              <button
                onClick={resetFilters}
                className="text-2xs text-echo-faint hover:text-echo-text px-2 py-1 transition-colors"
                title="Clear all filters"
              >
                Reset
              </button>
            )}

            <div className="h-4 w-px bg-echo-line mx-1" />

            <button
              onClick={() => exportIncidents(filteredRows, { scope: tab, format: 'csv' })}
              disabled={filteredRows.length === 0}
              className="flex items-center gap-1 text-2xs px-2 py-1 rounded border border-echo-line text-echo-muted hover:text-echo-text hover:bg-echo-panel-2 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-echo-muted transition-colors"
              title={`Export ${filteredRows.length} ${tab === 'live' ? 'incident' : 'review'} row${filteredRows.length === 1 ? '' : 's'} as CSV`}
            >
              <Download className="w-3 h-3" />
              CSV
            </button>
            <button
              onClick={() => exportIncidents(filteredRows, { scope: tab, format: 'json' })}
              disabled={filteredRows.length === 0}
              className="flex items-center gap-1 text-2xs px-2 py-1 rounded border border-echo-line text-echo-muted hover:text-echo-text hover:bg-echo-panel-2 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-echo-muted transition-colors"
              title={`Export ${filteredRows.length} ${tab === 'live' ? 'incident' : 'review'} row${filteredRows.length === 1 ? '' : 's'} as JSON`}
            >
              <Download className="w-3 h-3" />
              JSON
            </button>
          </div>
        </div>

        {/* Column header */}
        <div className="dense-row hover:bg-transparent cursor-default text-echo-faint font-mono text-2xs uppercase tracking-wider">
          <span className="w-1.5"></span>
          <span className="w-12">ID</span>
          <span className="w-10">SEV</span>
          <span className="w-24">PLATE</span>
          <span className="w-16 text-right">dB</span>
          <span className="w-14 text-right">g</span>
          <span className="w-12 text-right">Hz</span>
          <span className="flex-1">DEVICE</span>
          <span className="w-8 text-right">AGO</span>
        </div>

        {/* Rows — no inner scroll; page handles overflow */}
        <div>
          {filteredRows.length === 0 ? (
            <div className="text-echo-dim text-xs italic text-center py-16">
              {sourceRows.length === 0
                ? (tab === 'live' ? 'Waiting for incoming violations…' : 'Queue empty.')
                : 'No rows match the current filters.'}
            </div>
          ) : (
            pageRows.map((i) => (
              <IncidentRow key={i.id} incident={i} onClick={onSelectIncident} />
            ))
          )}
        </div>

        {/* Pagination footer */}
        {filteredRows.length > 0 && (
          <div className="flex items-center justify-between gap-3 px-3 py-2 border-t border-echo-line text-2xs text-echo-faint">
            <div className="tabular-nums">
              Showing <span className="text-echo-text">{start + 1}</span>
              –<span className="text-echo-text">{end}</span> of{' '}
              <span className="text-echo-text">{filteredRows.length}</span>
              {filteredRows.length !== sourceRows.length && (
                <span className="text-echo-dim"> (filtered from {sourceRows.length})</span>
              )}
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(1)}
                disabled={safePage === 1}
                className="p-1 rounded hover:bg-echo-panel-2 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                title="First page"
              >
                <ChevronsLeft className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={safePage === 1}
                className="p-1 rounded hover:bg-echo-panel-2 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                title="Previous page"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="px-2 tabular-nums">
                Page <span className="text-echo-text">{safePage}</span>
                <span className="text-echo-dim"> / {totalPages}</span>
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage === totalPages}
                className="p-1 rounded hover:bg-echo-panel-2 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                title="Next page"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setPage(totalPages)}
                disabled={safePage === totalPages}
                className="p-1 rounded hover:bg-echo-panel-2 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                title="Last page"
              >
                <ChevronsRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              <span>Rows</span>
              <select
                value={perPage}
                onChange={(e) => setPerPage(Number(e.target.value))}
                className="bg-echo-bg border border-echo-line rounded px-1.5 py-0.5 text-echo-text"
              >
                {PAGE_SIZES.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
