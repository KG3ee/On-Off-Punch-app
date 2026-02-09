'use client';

import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { apiFetch } from '@/lib/api';
import { MeUser } from '@/types/auth';

type ShiftCurrent = {
  preset: { name: string; timezone: string };
  segment: {
    segmentNo: number;
    shiftDate: string;
    startTime: string;
    endTime: string;
    lateGraceMinutes: number;
    scheduleStartLocal: string;
    scheduleEndLocal: string;
  };
};

type DutySession = {
  id: string;
  shiftDate: string;
  localDate: string;
  punchedOnAt: string;
  punchedOffAt?: string | null;
  status: 'ACTIVE' | 'CLOSED' | 'CANCELLED';
  isLate: boolean;
  lateMinutes: number;
};

type BreakPolicy = {
  id: string;
  code: string;
  name: string;
  expectedDurationMinutes: number;
  dailyLimit: number;
};

export default function EmployeeDashboardPage() {
  const [me, setMe] = useState<MeUser | null>(null);
  const [currentShift, setCurrentShift] = useState<ShiftCurrent | null>(null);
  const [sessions, setSessions] = useState<DutySession[]>([]);
  const [policies, setPolicies] = useState<BreakPolicy[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [actionMessage, setActionMessage] = useState('');

  const activeSession = useMemo(() => sessions.find((s) => s.status === 'ACTIVE'), [sessions]);

  useEffect(() => {
    void loadData();
  }, []);

  async function loadData(): Promise<void> {
    setLoading(true);
    setError('');

    try {
      const [meData, sessionsData, policiesData] = await Promise.all([
        apiFetch<MeUser>('/me'),
        apiFetch<DutySession[]>('/attendance/me/today'),
        apiFetch<BreakPolicy[]>('/breaks/policies')
      ]);

      setMe(meData);
      setSessions(sessionsData);
      setPolicies(policiesData);

      try {
        const current = await apiFetch<ShiftCurrent>('/shifts/current');
        setCurrentShift(current);
      } catch {
        setCurrentShift(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }

  async function runAction(path: string, body?: Record<string, unknown>): Promise<void> {
    setActionMessage('');
    setError('');

    try {
      await apiFetch(path, {
        method: 'POST',
        body: body ? JSON.stringify(body) : undefined
      });
      setActionMessage('Action completed');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    }
  }

  return (
    <AppShell
      title="Employee Dashboard"
      subtitle={me ? `${me.displayName}${me.team?.name ? ` • ${me.team.name}` : ''}` : 'Loading...'}
    >
      {error ? <p style={{ color: 'var(--danger)' }}>{error}</p> : null}
      {actionMessage ? <p style={{ color: 'var(--ok)' }}>{actionMessage}</p> : null}

      <section className="kpi-grid">
        <article className="kpi">
          <p className="kpi-label">Today Sessions</p>
          <p className="kpi-value">{sessions.length}</p>
        </article>
        <article className="kpi">
          <p className="kpi-label">Active Duty</p>
          <p className="kpi-value">{activeSession ? 'Yes' : 'No'}</p>
        </article>
        <article className="kpi">
          <p className="kpi-label">Current Segment</p>
          <p className="kpi-value">{currentShift ? `#${currentShift.segment.segmentNo}` : '-'}</p>
        </article>
      </section>

      <section className="split">
        <div className="grid">
          <article className="card">
            <h3>Duty Actions</h3>
            {currentShift ? (
              <p>
                Segment {currentShift.segment.segmentNo}: {currentShift.segment.startTime} -{' '}
                {currentShift.segment.endTime} (Shift date {currentShift.segment.shiftDate})
              </p>
            ) : (
              <p>No active segment right now.</p>
            )}
            <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.8rem' }}>
              <button
                type="button"
                className="button button-ok"
                disabled={loading || !currentShift || !!activeSession}
                onClick={() => void runAction('/attendance/on')}
              >
                Punch ON
              </button>
              <button
                type="button"
                className="button button-danger"
                disabled={loading || !activeSession}
                onClick={() => void runAction('/attendance/off')}
              >
                Punch OFF
              </button>
            </div>
          </article>

          <article className="card">
            <h3>Break Actions</h3>
            <p>Start break from policy or close/cancel your current break.</p>
            <div className="grid" style={{ marginTop: '0.7rem' }}>
              {policies.map((policy) => (
                <button
                  key={policy.id}
                  type="button"
                  className="button button-ghost"
                  onClick={() => void runAction('/breaks/start', { code: policy.code })}
                >
                  {policy.code.toUpperCase()} • {policy.expectedDurationMinutes}m • limit {policy.dailyLimit}
                </button>
              ))}
              <div style={{ display: 'flex', gap: '0.6rem' }}>
                <button
                  type="button"
                  className="button button-ok"
                  onClick={() => void runAction('/breaks/end')}
                >
                  End Break
                </button>
                <button
                  type="button"
                  className="button button-danger"
                  onClick={() => void runAction('/breaks/cancel')}
                >
                  Cancel Break
                </button>
              </div>
            </div>
          </article>
        </div>

        <article className="card">
          <h3>Today Duty History</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Shift Date</th>
                  <th>On</th>
                  <th>Off</th>
                  <th>Status</th>
                  <th>Late</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((session) => (
                  <tr key={session.id}>
                    <td className="mono">{session.shiftDate}</td>
                    <td className="mono">{new Date(session.punchedOnAt).toLocaleTimeString()}</td>
                    <td className="mono">
                      {session.punchedOffAt ? new Date(session.punchedOffAt).toLocaleTimeString() : '-'}
                    </td>
                    <td>
                      <span className={`tag ${session.status === 'ACTIVE' ? 'ok' : ''}`}>{session.status}</span>
                    </td>
                    <td>{session.lateMinutes > 0 ? `${session.lateMinutes}m` : '-'}</td>
                  </tr>
                ))}
                {sessions.length === 0 ? (
                  <tr>
                    <td colSpan={5}>No sessions yet.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    </AppShell>
  );
}
