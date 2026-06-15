import { useEffect, useState } from 'react';
import PageHeader from '../components/PageHeader.jsx';
import ViolationChart from '../components/ViolationChart.jsx';
import Heatmap from '../components/Heatmap.jsx';
import { api } from '../services/api.js';

export default function Analytics() {
  const [series, setSeries] = useState([]);
  const [heat, setHeat] = useState([]);
  const [bucket, setBucket] = useState(60);

  useEffect(() => {
    api.timeseries(bucket).then(setSeries).catch(() => {});
    api.heatmap().then(setHeat).catch(() => {});
  }, [bucket]);

  return (
    <div className="space-y-3">
      <PageHeader
        title="Analytics"
        subtitle="Trends and spatial distribution"
        right={
          <div className="flex items-center gap-1.5 text-2xs">
            <span className="text-echo-faint">Bucket</span>
            <select
              value={bucket}
              onChange={(e) => setBucket(Number(e.target.value))}
              className="bg-echo-bg border border-echo-line rounded px-1.5 py-0.5 text-echo-text"
            >
              <option value={15}>15 min</option>
              <option value={60}>1 hour</option>
              <option value={180}>3 hours</option>
              <option value={1440}>1 day</option>
            </select>
          </div>
        }
      />

      <section className="panel">
        <header className="panel-header">
          <span>Noise &amp; Vibration Trend</span>
          <span className="text-2xs text-echo-faint font-normal">last 7 days · {series.length} buckets</span>
        </header>
        <div className="p-3">
          <ViolationChart data={series} />
        </div>
      </section>

      <section className="panel">
        <header className="panel-header">
          <span>Spatial Heatmap (Device × Hour of Day)</span>
        </header>
        <div className="p-3">
          <Heatmap data={heat} />
        </div>
      </section>
    </div>
  );
}
