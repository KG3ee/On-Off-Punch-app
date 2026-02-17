'use client';

import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { apiFetch } from '@/lib/api';
import { runQueuedAction, subscribeQueue, getPendingCount, QueuedAction } from '@/lib/action-queue';
import { MeUser } from '@/types/auth';


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
  dutySessionId: string;
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

  const [sessions, setSessions] = useState<DutySession[]>([]);
  const [policies, setPolicies] = useState<BreakPolicy[]>([]);
  const [breakSessions, setBreakSessions] = useState<BreakSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [nowTick, setNowTick] = useState(Date.now());
  const [pendingActions, setPendingActions] = useState(0);

  const activeSession = useMemo(() => sessions.find((s) => s.status === 'ACTIVE'), [sessions]);
  const activeBreak = useMemo(
    () => breakSessions.find((session) => session.status === 'ACTIVE'),
    [breakSessions]
  );

  const activeBreakMinutes = useMemo(() => {
    if (!activeBreak) return 0;
    const startedAt = new Date(activeBreak.startedAt).getTime();
    return Math.max(0, Math.round((nowTick - startedAt) / 60000));
  }, [activeBreak, nowTick]);

  // Only show breaks linked to the current active duty session
  const sessionBreaks = useMemo(() => {
    if (!activeSession) return [];
    return breakSessions.filter(b => b.dutySessionId === activeSession.id);
  }, [breakSessions, activeSession]);

  const activeDutyMinutes = useMemo(() => {
    if (!activeSession) return 0;
    const startedAt = new Date(activeSession.punchedOnAt).getTime();
    return Math.max(0, Math.round((nowTick - startedAt) / 60000));
  }, [activeSession, nowTick]);

  useEffect(() => { void loadData(); }, []);

  // Subscribe to queue changes
  useEffect(() => {
    setPendingActions(getPendingCount());
    const unsub = subscribeQueue((q: QueuedAction[]) => {
      const pending = q.filter(a => a.status === 'pending' || a.status === 'syncing').length;
      setPendingActions(pending);
      // Refresh data when an action syncs
      const synced = q.filter(a => a.status === 'synced');
      if (synced.length > 0) {
        void loadData();
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!activeBreak && !activeSession) return;
    const timer = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [activeBreak, activeSession]);

  // Keyboard shortcuts: Space → End break, Esc → Cancel break
  useEffect(() => {
    if (!activeBreak) return;

    function handleKeyDown(e: KeyboardEvent) {
      // Don't intercept if user is typing in an input/textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.code === 'Space') {
        e.preventDefault();
        void runAction('/breaks/end');
      } else if (e.code === 'Escape') {
        e.preventDefault();
        void runAction('/breaks/cancel');
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBreak, loading]);

  async function loadData(): Promise<void> {
    setLoading(true);
    setError('');
    const [meResult, sessionsResult, policiesResult, breaksResult] =
      await Promise.allSettled([
        apiFetch<MeUser>('/me'),
        apiFetch<DutySession[]>('/attendance/me/today'),
        apiFetch<BreakPolicy[]>('/breaks/policies'),
        apiFetch<BreakSession[]>('/breaks/me/today')
      ]);

    let failedCount = 0;
    if (meResult.status === 'fulfilled') setMe(meResult.value); else failedCount++;
    if (sessionsResult.status === 'fulfilled') setSessions(sessionsResult.value); else failedCount++;
    if (policiesResult.status === 'fulfilled') setPolicies(policiesResult.value); else failedCount++;
    if (breaksResult.status === 'fulfilled') setBreakSessions(breaksResult.value); else failedCount++;
    if (failedCount > 0) setError('Some data could not be loaded. Please refresh.');
    setLoading(false);
  }

  async function runAction(path: string, body?: Record<string, unknown>): Promise<void> {
    setActionMessage('');
    setError('');
    setLoading(true);

    const result = await runQueuedAction(path, body);

    if (result.ok) {
      setActionMessage('✅ Action completed');
      setTimeout(() => setActionMessage(''), 3000);
      await loadData();
    } else if (result.queued) {
      setActionMessage('⏳ Offline — action queued. Will sync when connection is restored.');
      setTimeout(() => setActionMessage(''), 5000);
    } else {
      setError(result.error || 'Action failed');
    }

    setLoading(false);
  }

  function fmtTime(iso: string): string {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  function fmtDuration(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  function formatBreakMinutes(session: BreakSession): string {
    if (session.actualMinutes !== null && session.actualMinutes !== undefined) return `${session.actualMinutes}m`;
    if (session.status === 'ACTIVE') {
      const elapsed = Math.max(0, Math.round((nowTick - new Date(session.startedAt).getTime()) / 60000));
      return `${elapsed}m`;
    }
    return '-';
  }

  const breakBlockedReason = useMemo(() => {
    if (!activeSession) return 'Punch ON first';
    if (activeBreak) return `Active break (${activeBreak.breakPolicy.code.toUpperCase()}) — end it first`;
    if (policies.length === 0) return 'No break policies configured';
    return '';
  }, [activeBreak, activeSession, policies.length]);

  return (
    <AppShell
      title="Dashboard"
      subtitle={me ? `${me.displayName}${me.team?.name ? ` · ${me.team.name}` : ''}` : '…'}
      userRole={me?.role}
    >
      {error ? <div className="alert alert-error">⚠ {error}</div> : null}
      {actionMessage ? <div className="alert alert-success">{actionMessage}</div> : null}

      {/* Pending sync banner */}
      {pendingActions > 0 ? (
        <div className="alert alert-warning" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span className="sync-spinner" />
          {pendingActions} action{pendingActions > 1 ? 's' : ''} waiting to sync…
        </div>
      ) : null}

      {/* ── KPI Row ── */}
      <section className="kpi-grid">
        <article className="kpi">
          <p className="kpi-label">Sessions</p>
          <p className="kpi-value">{sessions.length}</p>
        </article>
        <article className="kpi">
          <p className="kpi-label">Duty</p>
          <p className="kpi-value" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <span className={`status-dot ${activeSession ? 'active' : 'inactive'}`} />
            {activeSession ? fmtDuration(activeDutyMinutes) : 'Off'}
          </p>
        </article>
        <article className="kpi">
          <p className="kpi-label">Break</p>
          <p className="kpi-value">
            {activeBreak ? (
              <span style={{ color: 'var(--ok)' }}>{activeBreak.breakPolicy.code.toUpperCase()}</span>
            ) : 'None'}
          </p>
        </article>
        {activeSession?.isLate ? (
          <article className="kpi">
            <p className="kpi-label">Late</p>
            <p className="kpi-value" style={{ color: 'var(--danger)' }}>{activeSession.lateMinutes}m</p>
          </article>
        ) : null}
      </section>

      {/* ── Main Layout ── */}
      <section className="split">
        {/* Left column — Actions */}
        <div className="grid">
          {/* Duty */}
          <article className="card">
            <h3>⚡ Duty</h3>
            <div className="action-row">
              <button
                type="button"
                className="button button-ok"
                disabled={loading || !!activeSession}
                onClick={() => void runAction('/attendance/on')}
              >
                ▶ Punch ON
              </button>
              <button
                type="button"
                className="button button-danger"
                disabled={loading || !activeSession}
                onClick={() => void runAction('/attendance/off')}
              >
                ■ Punch OFF
              </button>
            </div>
          </article>

          {/* Breaks */}
          <article className="card">
            <h3>☕ Breaks</h3>
            {breakBlockedReason ? (
              <div className="alert alert-warning" style={{ marginBottom: '0.4rem' }}>{breakBlockedReason}</div>
            ) : null}

            {/* Active break banner */}
            {activeBreak ? (
              <div className="break-banner" style={{ marginBottom: '0.5rem' }}>
                <span className="status-dot active" />
                <span><strong>{activeBreak.breakPolicy.code.toUpperCase()}</strong> · {activeBreak.breakPolicy.name}</span>
                <span className="elapsed">{activeBreakMinutes}m</span>
                <span style={{ color: 'var(--muted)', fontSize: '0.72rem' }}>/ {activeBreak.expectedDurationMinutes}m</span>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.3rem' }}>
                  <button className="button button-ok button-sm" disabled={loading} onClick={() => void runAction('/breaks/end')} title="Space bar">
                    End <kbd style={{ fontSize: '0.6rem', opacity: 0.7, marginLeft: '0.2rem', padding: '0.1rem 0.3rem', background: 'rgba(255,255,255,0.15)', borderRadius: '3px' }}>␣</kbd>
                  </button>
                  <button className="button button-danger button-sm" disabled={loading} onClick={() => void runAction('/breaks/cancel')} title="Escape">
                    Cancel <kbd style={{ fontSize: '0.6rem', opacity: 0.7, marginLeft: '0.2rem', padding: '0.1rem 0.3rem', background: 'rgba(255,255,255,0.15)', borderRadius: '3px' }}>Esc</kbd>
                  </button>
                </div>
              </div>
            ) : null}

            {/* Break policy chips */}
            <div className="chips-grid">
              {policies.map((policy) => {
                const emojiMap: Record<string, string> = {
                  'wc': '🚽',
                  'bwc': '🪠',
                  'cy': '🚬',
                  'cf+1': '🥐',
                  'cf+2': '🍛',
                  'cf+3': '🍽️',
                };
                const emoji = emojiMap[policy.code] || '☕';
                return (
                  <button
                    key={policy.id}
                    type="button"
                    className="button-chip"
                    disabled={loading || !activeSession || !!activeBreak}
                    onClick={() => void runAction('/breaks/start', { code: policy.code })}
                    title={`${policy.name} — ${policy.expectedDurationMinutes}m, limit ${policy.dailyLimit}/day`}
                  >
                    <span className="chip-emoji">{emoji}</span>
                    <span className="chip-code">{policy.code.toUpperCase()} · {policy.expectedDurationMinutes}m</span>
                    <span className="chip-name">{policy.name}</span>
                  </button>
                );
              })}
              {policies.length === 0 ? (
                <p style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>No break policies available</p>
              ) : null}
            </div>
          </article>
        </div>

        {/* Right column — Current Session */}
        <div className="grid">
          <article className="card">
            <h3>📋 Current Session</h3>
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
                  {activeSession ? (
                    <tr>
                      <td className="mono">{activeSession.shiftDate}</td>
                      <td className="mono">{fmtTime(activeSession.punchedOnAt)}</td>
                      <td className="mono">{activeSession.punchedOffAt ? fmtTime(activeSession.punchedOffAt) : '—'}</td>
                      <td>
                        <span className={`tag ${activeSession.status === 'ACTIVE' ? 'ok' : ''}`}>{activeSession.status}</span>
                      </td>
                      <td>{activeSession.lateMinutes > 0 ? <span className="tag danger">{activeSession.lateMinutes}m</span> : '—'}</td>
                    </tr>
                  ) : (
                    <tr><td colSpan={5} style={{ color: 'var(--muted)' }}>Not on duty</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>

          <article className="card">
            <h3>☕ Session Breaks</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Start</th>
                    <th>End</th>
                    <th>Min</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {sessionBreaks.map((session) => (
                    <tr key={session.id}>
                      <td><span className="tag">{session.breakPolicy.code.toUpperCase()}</span></td>
                      <td className="mono">{fmtTime(session.startedAt)}</td>
                      <td className="mono">{session.endedAt ? fmtTime(session.endedAt) : '—'}</td>
                      <td>{formatBreakMinutes(session)}</td>
                      <td>
                        <span className={`tag ${session.status === 'ACTIVE' ? 'ok' : session.status === 'CANCELLED' ? 'danger' : ''}`}>
                          {session.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {sessionBreaks.length === 0 ? (
                    <tr><td colSpan={5} style={{ color: 'var(--muted)' }}>{activeSession ? 'No breaks this session' : 'Not on duty'}</td></tr>
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
