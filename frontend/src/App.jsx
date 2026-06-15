import { useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Sidebar from './components/Sidebar.jsx';
import IncidentDetailDrawer from './components/IncidentDetailDrawer.jsx';
import LiveOps from './pages/LiveOps.jsx';
import Incidents from './pages/Incidents.jsx';
import Devices from './pages/Devices.jsx';
import Analytics from './pages/Analytics.jsx';
import { useEchoData } from './state/useEchoData.js';

export default function App() {
  const ctx = useEchoData();
  const [selected, setSelected] = useState(null);

  return (
    <BrowserRouter>
      <div className="flex h-screen text-echo-text">
        <Sidebar connected={ctx.connected} summary={ctx.summary} />
        <main className="flex-1 overflow-y-auto bg-echo-bg">
          <div className="p-4 max-w-[1600px] mx-auto">
            <Routes>
              <Route path="/" element={<LiveOps ctx={ctx} onSelectIncident={setSelected} />} />
              <Route path="/incidents" element={<Incidents onSelectIncident={setSelected} />} />
              <Route path="/devices" element={<Devices ctx={ctx} />} />
              <Route path="/analytics" element={<Analytics />} />
            </Routes>
          </div>
        </main>
        <IncidentDetailDrawer
          incident={selected}
          onClose={() => setSelected(null)}
          onResolve={ctx.resolveReview}
        />
      </div>
    </BrowserRouter>
  );
}
