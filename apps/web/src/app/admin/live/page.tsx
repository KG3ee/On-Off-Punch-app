'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { apiFetch } from '@/lib/api';

type LiveBreak = {
  id: string;
  breakPolicy: { code: string };
  startedAt: string;
};

type LiveDuty = {
  id: string;
  localDate: string;
  punchedOnAt: string;
  isLate: boolean;
  lateMinutes: number;
  user: { displayName: string; role?: string };
  team?: { name: string } | null;
  breakSessions: LiveBreak[];
};

type LiveBoard = {
  localDate: string;
  activeDutySessions: LiveDuty[];
  summary: {
    totalSessionsToday: number;
    totalLateMinutesToday: number;
  };
};

type BreakHistoryItem = {
  id: string;
  localDate: string;
  startedAt: string;
  endedAt?: string | null;
  expectedDurationMinutes: number;
  actualMinutes?: number | null;
  status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED' | 'AUTO_CLOSED';
  isOvertime: boolean;
  breakPolicy: { code: string; name: string };
  user: {
    displayName: string;
    team?: { name: string } | null;
  };
};

export default function AdminLivePage() {
  const [data, setData] = useState<LiveBoard | null>(null);
  const [breakHistory, setBreakHistory] = useState<BreakHistoryItem[]>([]);
  const [error, setError] = useState('');
  const [nowTick, setNowTick] = useState(Date.now());

  useEffect(() => {
    void load();
    const refreshTimer = window.setInterval(() => void load(), 15000);
    const tickTimer = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => {
      window.clearInterval(refreshTimer);
      window.clearInterval(tickTimer);
    };
  }, []);

  async function load(): Promise<void> {
    try {
      const live = await apiFetch<LiveBoard>('/attendance/admin/live');
      const history = await apiFetch<BreakHistoryItem[]>(
        `/breaks/admin/history?from=${encodeURIComponent(live.localDate)}&to=${encodeURIComponent(live.localDate)}&limit=250`
      );
      setData(live);
      setBreakHistory(history);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    }
  }

  function fmtTime(iso: string): string {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  function formatHistoryMinutes(item: BreakHistoryItem): string {
    if (item.actualMinutes !== null && item.actualMinutes !== undefined) return `${item.actualMinutes}m`;
    if (item.status === 'ACTIVE') {
      const elapsed = Math.max(0, Math.round((nowTick - new Date(item.startedAt).getTime()) / 60000));
      return `${elapsed}m`;
    }
    return '-';
  }

  return (
    <AppShell title="Live Board" subtitle="Real-time duty & break status" admin userRole="ADMIN">
      {error ? <div className="alert alert-error">⚠ {error}</div> : null}

      <section className="kpi-grid">
        <article className="kpi">
          <p className="kpi-label">Date</p>
          <p className="kpi-value mono">{data?.localDate || '—'}</p>
        </article>
        <article className="kpi">
          <p className="kpi-label">Active Now</p>
          <p className="kpi-value" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            {(data?.activeDutySessions.length || 0) > 0 && <span className="status-dot active" />}
            {data?.activeDutySessions.length || 0}
          </p>
        </article>
        <article className="kpi">
          <p className="kpi-label">Total Today</p>
          <p className="kpi-value">{data?.summary.totalSessionsToday || 0}</p>
        </article>
        <article className="kpi">
          <p className="kpi-label">Late Min</p>
          <p className="kpi-value">{data?.summary.totalLateMinutesToday || 0}</p>
        </article>
      </section>

      <article className="card">
        <h3>🟢 Active Sessions</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Employee</th>
                <th>Group</th>
                <th>Punched On</th>
                <th>Late</th>
                <th>Break</th>
              </tr>
            </thead>
            <tbody>
              {data?.activeDutySessions.map((session) => (
                <tr key={session.id}>
                  <td>{session.user.displayName}</td>
                  <td>{session.team?.name ? <span className="tag brand">{session.team.name}</span> : <span className={`tag ${session.user.role === 'ADMIN' ? 'warning' : session.user.role === 'DRIVER' ? 'brand' : session.user.role === 'LEADER' ? 'ok' : ''}`}>{session.user.role || '—'}</span>}</td>
                  <td className="mono">{fmtTime(session.punchedOnAt)}</td>
                  <td>
                    {session.lateMinutes > 0 ? (
                      <span className="tag danger">{session.lateMinutes}m</span>
                    ) : (
                      <span className="tag ok">On time</span>
                    )}
                  </td>
                  <td>
                    {session.breakSessions.length > 0 ? (
                      <span className="tag warning">
                        {session.breakSessions[0].breakPolicy.code.toUpperCase()} · {fmtTime(session.breakSessions[0].startedAt)}
                      </span>
                    ) : '—'}
                  </td>
                </tr>
              ))}
              {!data?.activeDutySessions.length ? (
                <tr><td colSpan={5} style={{ color: 'var(--muted)' }}>No active sessions</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </article>

      <article className="card">
        <h3>☕ Today Break History</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Employee</th>
                <th>Group</th>
                <th>Code</th>
                <th>Start</th>
                <th>End</th>
                <th>Min</th>
                <th>Status</th>
                <th>OT</th>
              </tr>
            </thead>
            <tbody>
              {breakHistory.map((item) => (
                <tr key={item.id}>
                  <td>{item.user.displayName}</td>
                  <td>{item.user.team?.name ? <span className="tag brand">{item.user.team.name}</span> : '—'}</td>
                  <td><span className="tag">{item.breakPolicy.code.toUpperCase()}</span></td>
                  <td className="mono">{fmtTime(item.startedAt)}</td>
                  <td className="mono">{item.endedAt ? fmtTime(item.endedAt) : '—'}</td>
                  <td>{formatHistoryMinutes(item)}</td>
                  <td>
                    <span className={`tag ${item.status === 'ACTIVE' ? 'ok' : item.status === 'CANCELLED' ? 'danger' : ''}`}>
                      {item.status}
                    </span>
                  </td>
                  <td>{item.isOvertime ? <span className="tag warning">Yes</span> : '—'}</td>
                </tr>
              ))}
              {breakHistory.length === 0 ? (
                <tr><td colSpan={8} style={{ color: 'var(--muted)' }}>No breaks today</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </article>
    </AppShell>
  );
}
