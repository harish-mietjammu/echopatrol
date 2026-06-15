import { useEffect, useState } from 'react';
import { Search, Filter } from 'lucide-react';
import PageHeader from '../components/PageHeader.jsx';
import IncidentRow from '../components/IncidentRow.jsx';
import { api } from '../services/api.js';

export default function Incidents({ onSelectIncident }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [plate, setPlate] = useState('');
  const [needsReviewOnly, setNeedsReviewOnly] = useState(false);
  const [limit, setLimit] = useState(100);

  useEffect(() => {
    setLoading(true);
    const params = { limit };
    if (plate) params.license_plate = plate.toUpperCase();
    if (needsReviewOnly) params.needs_review = true;
    api.listViolations(params).then((d) => { setRows(d); setLoading(false); }).catch(() => setLoading(false));
  }, [plate, needsReviewOnly, limit]);

  return (
    <div className="space-y-3">
      <PageHeader
        title="Incidents"
        subtitle="Historical browser with filters"
        right={
          <div className="flex items-center gap-2 text-xs">
            <span className="text-echo-faint">{rows.length} results</span>
          </div>
        }
      />

      <div className="panel p-3 flex items-center gap-2">
        <div className="flex items-center gap-1.5 bg-echo-bg border border-echo-line rounded px-2 py-1 flex-1 max-w-xs">
          <Search className="w-3.5 h-3.5 text-echo-faint" />
          <input
            value={plate}
            onChange={(e) => setPlate(e.target.value)}
            placeholder="Search plate (e.g. JK02BY8765)"
            className="bg-transparent text-xs text-echo-text placeholder:text-echo-dim outline-none w-full font-mono"
          />
        </div>
        <label className="flex items-center gap-1.5 text-xs text-echo-text-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={needsReviewOnly}
            onChange={(e) => setNeedsReviewOnly(e.target.checked)}
            className="accent-echo-accent"
          />
          <Filter className="w-3 h-3 text-echo-warn" />
          Review queue only
        </label>
        <div className="ml-auto flex items-center gap-1.5 text-2xs">
          <span className="text-echo-faint">Limit</span>
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="bg-echo-bg border border-echo-line rounded px-1.5 py-0.5 text-echo-text"
          >
            <option>50</option>
            <option>100</option>
            <option>250</option>
            <option>500</option>
          </select>
        </div>
      </div>

      <div className="panel" style={{ minHeight: '400px' }}>
        <header className="panel-header">
          <div className="grid grid-cols-[auto_3rem_2.5rem_6rem_4rem_3.5rem_3rem_1fr_auto] gap-3 w-full font-mono text-echo-faint text-2xs items-center">
            <span className="w-1.5"></span>
            <span>ID</span>
            <span>SEV</span>
            <span>PLATE</span>
            <span className="text-right">dB</span>
            <span className="text-right">g</span>
            <span className="text-right">Hz</span>
            <span>DEVICE</span>
            <span className="text-right">AGO</span>
          </div>
        </header>
        <div>
          {loading ? (
            <div className="text-echo-dim text-xs italic text-center py-16">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="text-echo-dim text-xs italic text-center py-16">No matches.</div>
          ) : (
            rows.map((i) => <IncidentRow key={i.id} incident={i} onClick={onSelectIncident} />)
          )}
        </div>
      </div>
    </div>
  );
}
