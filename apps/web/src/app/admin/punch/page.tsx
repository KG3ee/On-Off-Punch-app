'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { apiFetch } from '@/lib/api';

type DutySession = {
  id: string;
  shiftDate: string;
  localDate: string;
  punchedOnAt: string;
  punchedOffAt?: string | null;
  status: 'ACTIVE' | 'CLOSED' | 'CANCELLED';
  isLate: boolean;
  lateMinutes: number;
  overtimeMinutes: number;
};

type MonthlySummary = {
  month: string;
  totalWorkedMinutes: number;
  totalLateMinutes: number;
  totalOvertimeMinutes: number;
  sessionCount: number;
};

export default function AdminPunchPage() {
  const [sessions, setSessions] = useState<DutySession[]>([]);
  const [summary, setSummary] = useState<MonthlySummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [nowTick, setNowTick] = useState(Date.now());

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [s, sum] = await Promise.all([
        apiFetch<DutySession[]>('/attendance/me/today'),
        apiFetch<MonthlySummary>('/attendance/me/summary')
      ]);
      setSessions(s);
      setSummary(sum);
      if (!silent) setError('');
    } catch (err) {
      if (!silent) setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(true), 15_000);
    return () => clearInterval(timer);
  }, [load]);

  const activeSession = useMemo(
    () => sessions.find((s) => s.status === 'ACTIVE') || null,
    [sessions]
  );

  const activeDutyMinutes = useMemo(() => {
    if (!activeSession) return 0;
    return Math.max(0, Math.round((nowTick - new Date(activeSession.punchedOnAt).getTime()) / 60000));
  }, [activeSession, nowTick]);

  useEffect(() => {
    if (!activeSession) return;
    const timer = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [activeSession]);

  async function punch(path: string) {
    setError('');
    setMessage('');
    setLoading(true);
    try {
      await apiFetch(path, {
        method: 'POST',
        body: JSON.stringify({ clientTimestamp: new Date().toISOString() })
      });
      setMessage(path.includes('on') ? 'Punched ON' : 'Punched OFF');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setLoading(false);
    }
  }

  function fmtTime(iso: string): string {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  function fmtHours(mins: number): string {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  return (
    <AppShell title="My Punch" subtitle="Quick punch on/off" admin userRole="ADMIN">
      {error ? <div className="alert alert-error">{error}</div> : null}
      {message ? <div className="alert alert-success">{message}</div> : null}

      <section className="kpi-grid">
        <article className="kpi">
          <p className="kpi-label">Status</p>
          <p className="kpi-value" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            {activeSession ? <><span className="status-dot active" /> On Duty</> : 'Off Duty'}
          </p>
        </article>
        <article className="kpi">
          <p className="kpi-label">Duration</p>
          <p className="kpi-value mono">{activeSession ? fmtHours(activeDutyMinutes) : '—'}</p>
        </article>
        <article className="kpi">
          <p className="kpi-label">This Month</p>
          <p className="kpi-value">{summary ? `${summary.sessionCount} days` : '—'}</p>
        </article>
        <article className="kpi">
          <p className="kpi-label">Worked</p>
          <p className="kpi-value mono">{summary ? fmtHours(summary.totalWorkedMinutes) : '—'}</p>
        </article>
      </section>

      <article className="card">
        <div className="punch-row">
          <button
            type="button"
            className="punch-btn punch-on"
            disabled={loading || !!activeSession}
            onClick={() => void punch('/attendance/on')}
          >
            <span className="punch-icon">⏻</span>
            <span className="punch-label">Punch ON</span>
          </button>
          <button
            type="button"
            className="punch-btn punch-off"
            disabled={loading || !activeSession}
            onClick={() => void punch('/attendance/off')}
          >
            <span className="punch-icon">⏼</span>
            <span className="punch-label">Punch OFF</span>
          </button>
        </div>
      </article>

      <article className="card">
        <h3>Today&apos;s Sessions</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>On</th>
                <th>Off</th>
                <th>Status</th>
                <th>Late</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id}>
                  <td className="mono">{s.localDate}</td>
                  <td className="mono">{fmtTime(s.punchedOnAt)}</td>
                  <td className="mono">{s.punchedOffAt ? fmtTime(s.punchedOffAt) : '—'}</td>
                  <td>
                    <span className={`tag ${s.status === 'ACTIVE' ? 'ok' : ''}`}>{s.status}</span>
                  </td>
                  <td>{s.lateMinutes > 0 ? <span className="tag danger">{s.lateMinutes}m</span> : '—'}</td>
                </tr>
              ))}
              {sessions.length === 0 ? (
                <tr><td colSpan={5} className="table-empty">No sessions today</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </article>
    </AppShell>
  );
}
