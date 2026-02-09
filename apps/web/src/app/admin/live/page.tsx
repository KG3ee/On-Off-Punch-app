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

export default function AdminLivePage() {
  const [data, setData] = useState<LiveBoard | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      void load();
    }, 15000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  async function load(): Promise<void> {
    try {
      const res = await apiFetch<LiveBoard>('/attendance/admin/live');
      setData(res);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load live board');
    }
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
    </AppShell>
  );
}
