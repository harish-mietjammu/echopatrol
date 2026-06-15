import { useEffect, useState, useCallback, useRef } from 'react';
import { socket } from '../services/socket.js';
import { api } from '../services/api.js';

/**
 * Single source of truth for live ops data. Wires the WebSocket once,
 * exposes incidents / review / summary / connection state, and
 * accumulates "new since last view" counts so pages can show an alert pill.
 */
export function useEchoData() {
  const [incidents, setIncidents] = useState([]);
  const [review, setReview] = useState([]);
  const [summary, setSummary] = useState(null);
  const [connected, setConnected] = useState(false);
  const [newSinceVisit, setNewSinceVisit] = useState(0);
  const sinceVisitRef = useRef(0);

  const reloadSummary = useCallback(() => {
    api.summary().then(setSummary).catch(() => {});
  }, []);

  const refresh = useCallback(async () => {
    const [v, r, s] = await Promise.all([
      api.listViolations({ needs_review: false, limit: 50 }),
      api.listViolations({ needs_review: true, limit: 50 }),
      api.summary(),
    ]);
    setIncidents(v);
    setReview(r);
    setSummary(s);
  }, []);

  const ackNewSinceVisit = useCallback(() => {
    sinceVisitRef.current = 0;
    setNewSinceVisit(0);
  }, []);

  useEffect(() => {
    refresh().catch(console.error);
  }, [refresh]);

  useEffect(() => {
    const onConn = () => setConnected(true);
    const onDis = () => setConnected(false);
    const onNew = (incident) => {
      setIncidents((prev) => [incident, ...prev].slice(0, 200));
      sinceVisitRef.current += 1;
      setNewSinceVisit(sinceVisitRef.current);
      reloadSummary();
    };
    const onReview = (incident) => {
      setReview((prev) => [incident, ...prev].slice(0, 200));
      sinceVisitRef.current += 1;
      setNewSinceVisit(sinceVisitRef.current);
      reloadSummary();
    };
    socket.on('connect', onConn);
    socket.on('disconnect', onDis);
    socket.on('violation:new', onNew);
    socket.on('review:new', onReview);
    return () => {
      socket.off('connect', onConn);
      socket.off('disconnect', onDis);
      socket.off('violation:new', onNew);
      socket.off('review:new', onReview);
    };
  }, [reloadSummary]);

  const resolveReview = useCallback(
    async (id) => {
      await api.resolveReview(id);
      setReview((prev) => prev.filter((x) => x.id !== id));
      reloadSummary();
    },
    [reloadSummary],
  );

  return {
    incidents, review, summary, connected,
    newSinceVisit, ackNewSinceVisit,
    resolveReview, refresh,
  };
}
