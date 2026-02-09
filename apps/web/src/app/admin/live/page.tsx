'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { apiFetch } from '@/lib/api';

type LiveBreak = {
  id: string;
  breakPolicy: {
    code: string;
  };
  startedAt: string;
};

type LiveDuty = {
  id: string;
  localDate: string;
  shiftDate: string;
  punchedOnAt: string;
  isLate: boolean;
  lateMinutes: number;
  user: {
    displayName: string;
  };
  team?: {
    name: string;
  } | null;
  shiftPresetSegment?: {
    segmentNo: number;
  } | null;
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
  breakPolicy: {
    code: string;
    name: string;
  };
  user: {
    displayName: string;
    team?: {
      name: string;
    } | null;
  };
};

export default function AdminLivePage() {
  const [data, setData] = useState<LiveBoard | null>(null);
  const [breakHistory, setBreakHistory] = useState<BreakHistoryItem[]>([]);
  const [error, setError] = useState('');
  const [nowTick, setNowTick] = useState(Date.now());

  useEffect(() => {
    void load();
    const refreshTimer = window.setInterval(() => {
      void load();
    }, 15000);
    const tickTimer = window.setInterval(() => {
      setNowTick(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(refreshTimer);
      window.clearInterval(tickTimer);
    };
  }, []);

  async function load(): Promise<void> {
    try {
      const live = await apiFetch<LiveBoard>('/attendance/admin/live');
      const history = await apiFetch<BreakHistoryItem[]>(
        `/breaks/admin/history?from=${encodeURIComponent(live.localDate)}&to=${encodeURIComponent(live.localDate)}`
      );
      setData(live);
      setBreakHistory(history);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load live board');
    }
  }

  function formatHistoryMinutes(item: BreakHistoryItem): string {
    if (item.actualMinutes !== null && item.actualMinutes !== undefined) {
      return `${item.actualMinutes}m`;
    }

    if (item.status === 'ACTIVE') {
      const startedAt = new Date(item.startedAt).getTime();
      const elapsed = Math.max(0, Math.round((nowTick - startedAt) / 60000));
      return `${elapsed}m`;
    }

    return '-';
  }

  return (
    <AppShell title="Admin Live Board" subtitle="Real-time duty and break visibility" admin>
      {error ? <p style={{ color: 'var(--danger)' }}>{error}</p> : null}

      <section className="kpi-grid">
        <article className="kpi">
          <p className="kpi-label">Local Date</p>
          <p className="kpi-value mono">{data?.localDate || '-'}</p>
        </article>
        <article className="kpi">
          <p className="kpi-label">Active Duty</p>
          <p className="kpi-value">{data?.activeDutySessions.length || 0}</p>
        </article>
        <article className="kpi">
          <p className="kpi-label">Total Sessions Today</p>
          <p className="kpi-value">{data?.summary.totalSessionsToday || 0}</p>
        </article>
        <article className="kpi">
          <p className="kpi-label">Late Minutes Today</p>
          <p className="kpi-value">{data?.summary.totalLateMinutesToday || 0}</p>
        </article>
      </section>

      <section className="card table-wrap">
        <h3>Active Sessions</h3>
        <table>
          <thead>
            <tr>
              <th>Employee</th>
              <th>Team</th>
              <th>Segment</th>
              <th>Punched On</th>
              <th>Late</th>
              <th>Active Break</th>
            </tr>
          </thead>
          <tbody>
            {data?.activeDutySessions.map((session) => (
              <tr key={session.id}>
                <td>{session.user.displayName}</td>
                <td>{session.team?.name || '-'}</td>
                <td>{session.shiftPresetSegment?.segmentNo || '-'}</td>
                <td className="mono">{new Date(session.punchedOnAt).toLocaleTimeString()}</td>
                <td>
                  {session.lateMinutes > 0 ? (
                    <span className="tag danger">{session.lateMinutes}m</span>
                  ) : (
                    <span className="tag ok">On time</span>
                  )}
                </td>
                <td>
                  {session.breakSessions.length > 0 ? (
                    <span className="tag">
                      {session.breakSessions[0].breakPolicy.code.toUpperCase()} since{' '}
                      {new Date(session.breakSessions[0].startedAt).toLocaleTimeString()}
                    </span>
                  ) : (
                    '-'
                  )}
                </td>
              </tr>
            ))}
            {!data?.activeDutySessions.length ? (
              <tr>
                <td colSpan={6}>No active duty sessions.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <section className="card table-wrap">
        <h3>Today Break History</h3>
        <table>
          <thead>
            <tr>
              <th>Employee</th>
              <th>Team</th>
              <th>Code</th>
              <th>Start</th>
              <th>End</th>
              <th>Minutes</th>
              <th>Status</th>
              <th>OT</th>
            </tr>
          </thead>
          <tbody>
            {breakHistory.map((item) => (
              <tr key={item.id}>
                <td>{item.user.displayName}</td>
                <td>{item.user.team?.name || '-'}</td>
                <td>{item.breakPolicy.code.toUpperCase()}</td>
                <td className="mono">{new Date(item.startedAt).toLocaleTimeString()}</td>
                <td className="mono">{item.endedAt ? new Date(item.endedAt).toLocaleTimeString() : '-'}</td>
                <td>{formatHistoryMinutes(item)}</td>
                <td>
                  <span
                    className={`tag ${item.status === 'ACTIVE' ? 'ok' : item.status === 'CANCELLED' ? 'danger' : ''}`}
                  >
                    {item.status}
                  </span>
                </td>
                <td>{item.isOvertime ? 'Yes' : 'No'}</td>
              </tr>
            ))}
            {breakHistory.length === 0 ? (
              <tr>
                <td colSpan={8}>No breaks for today.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </AppShell>
  );
}
