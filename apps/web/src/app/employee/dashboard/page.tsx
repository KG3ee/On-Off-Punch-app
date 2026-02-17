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

type BreakSession = {
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
};

export default function EmployeeDashboardPage() {
  const [me, setMe] = useState<MeUser | null>(null);
  const [currentShift, setCurrentShift] = useState<ShiftCurrent | null>(null);
  const [sessions, setSessions] = useState<DutySession[]>([]);
  const [policies, setPolicies] = useState<BreakPolicy[]>([]);
  const [breakSessions, setBreakSessions] = useState<BreakSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [nowTick, setNowTick] = useState(Date.now());

  const activeSession = useMemo(() => sessions.find((s) => s.status === 'ACTIVE'), [sessions]);
  const activeBreak = useMemo(
    () => breakSessions.find((session) => session.status === 'ACTIVE'),
    [breakSessions]
  );

  const activeBreakMinutes = useMemo(() => {
    if (!activeBreak) {
      return 0;
    }

    const startedAt = new Date(activeBreak.startedAt).getTime();
    return Math.max(0, Math.round((nowTick - startedAt) / 60000));
  }, [activeBreak, nowTick]);

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    if (!activeBreak) {
      return;
    }

    const timer = window.setInterval(() => {
      setNowTick(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [activeBreak]);

  async function loadData(): Promise<void> {
    setLoading(true);
    setError('');
    const [meResult, sessionsResult, policiesResult, breaksResult, shiftResult] =
      await Promise.allSettled([
        apiFetch<MeUser>('/me'),
        apiFetch<DutySession[]>('/attendance/me/today'),
        apiFetch<BreakPolicy[]>('/breaks/policies'),
        apiFetch<BreakSession[]>('/breaks/me/today'),
        apiFetch<ShiftCurrent>('/shifts/current')
      ]);

    let failedCount = 0;

    if (meResult.status === 'fulfilled') {
      setMe(meResult.value);
    } else {
      failedCount += 1;
    }

    if (sessionsResult.status === 'fulfilled') {
      setSessions(sessionsResult.value);
    } else {
      failedCount += 1;
    }

    if (policiesResult.status === 'fulfilled') {
      setPolicies(policiesResult.value);
    } else {
      failedCount += 1;
    }

    if (breaksResult.status === 'fulfilled') {
      setBreakSessions(breaksResult.value);
    } else {
      failedCount += 1;
    }

    if (shiftResult.status === 'fulfilled') {
      setCurrentShift(shiftResult.value);
    } else {
      setCurrentShift(null);
    }

    if (failedCount > 0) {
      setError('Some dashboard data could not be loaded. Please refresh.');
    }

    setLoading(false);
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

  function formatBreakMinutes(session: BreakSession): string {
    if (session.actualMinutes !== null && session.actualMinutes !== undefined) {
      return `${session.actualMinutes}m`;
    }

    if (session.status === 'ACTIVE') {
      const startedAt = new Date(session.startedAt).getTime();
      const elapsed = Math.max(0, Math.round((nowTick - startedAt) / 60000));
      return `${elapsed}m`;
    }

    return '-';
  }

  const breakBlockedReason = useMemo(() => {
    if (!activeSession) {
      return 'Punch ON first before starting a break.';
    }

    if (activeBreak) {
      return `You already have an active break (${activeBreak.breakPolicy.code.toUpperCase()}). End or cancel it first.`;
    }

    if (policies.length === 0) {
      return 'No break policies configured yet. Ask admin to create break policies.';
    }

    return '';
  }, [activeBreak, activeSession, policies.length]);

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
          <p className="kpi-label">Active Break</p>
          <p className="kpi-value">{activeBreak ? activeBreak.breakPolicy.code.toUpperCase() : 'No'}</p>
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
                disabled={loading || !!activeSession}
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
            {breakBlockedReason ? (
              <p style={{ marginTop: '0.4rem', color: 'var(--warning)' }}>{breakBlockedReason}</p>
            ) : null}
            <div className="grid" style={{ marginTop: '0.7rem' }}>
              {policies.map((policy) => (
                <button
                  key={policy.id}
                  type="button"
                  className="button button-ghost"
                  disabled={loading || !activeSession || !!activeBreak}
                  onClick={() => void runAction('/breaks/start', { code: policy.code })}
                >
                  {policy.code.toUpperCase()} • {policy.expectedDurationMinutes}m • limit {policy.dailyLimit}
                </button>
              ))}
              {policies.length === 0 ? (
                <p style={{ color: 'var(--danger)' }}>No break policies available.</p>
              ) : null}
              <div style={{ display: 'flex', gap: '0.6rem' }}>
                <button
                  type="button"
                  className="button button-ok"
                  disabled={loading || !activeBreak}
                  onClick={() => void runAction('/breaks/end')}
                >
                  End Break
                </button>
                <button
                  type="button"
                  className="button button-danger"
                  disabled={loading || !activeBreak}
                  onClick={() => void runAction('/breaks/cancel')}
                >
                  Cancel Break
                </button>
              </div>
            </div>
          </article>

          <article className="card">
            <h3>Current Break Status</h3>
            {activeBreak ? (
              <div className="grid" style={{ gap: '0.45rem' }}>
                <p>
                  <span className="tag ok">{activeBreak.breakPolicy.code.toUpperCase()}</span> {activeBreak.breakPolicy.name}
                </p>
                <p>
                  Started: <span className="mono">{new Date(activeBreak.startedAt).toLocaleTimeString()}</span>
                </p>
                <p>
                  Elapsed: <span className="mono">{activeBreakMinutes}m</span> / expected{' '}
                  <span className="mono">{activeBreak.expectedDurationMinutes}m</span>
                </p>
              </div>
            ) : (
              <p>No active break right now.</p>
            )}
          </article>
        </div>

        <div className="grid">
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

          <article className="card">
            <h3>Today Break History</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Start</th>
                    <th>End</th>
                    <th>Minutes</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {breakSessions.map((session) => (
                    <tr key={session.id}>
                      <td>{session.breakPolicy.code.toUpperCase()}</td>
                      <td className="mono">{new Date(session.startedAt).toLocaleTimeString()}</td>
                      <td className="mono">
                        {session.endedAt ? new Date(session.endedAt).toLocaleTimeString() : '-'}
                      </td>
                      <td>{formatBreakMinutes(session)}</td>
                      <td>
                        <span
                          className={`tag ${session.status === 'ACTIVE' ? 'ok' : session.status === 'CANCELLED' ? 'danger' : ''}`}
                        >
                          {session.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {breakSessions.length === 0 ? (
                    <tr>
                      <td colSpan={5}>No breaks yet.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </article>
        </div>
      </section>
    </AppShell>
  );
}
