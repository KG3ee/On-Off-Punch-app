'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { apiFetch } from '@/lib/api';
import {
  clearSynced,
  runQueuedAction,
  subscribeQueue,
  getQueueSnapshot,
  QueuedAction,
} from '@/lib/action-queue';

/* ── Break constants ── */
const TOP_BREAK_CODES = ['bwc', 'wc', 'cy'] as const;
const BOTTOM_BREAK_CODES = ['cf+1', 'cf+2', 'cf+3'] as const;
const FIXED_BREAK_CODES: ReadonlySet<string> = new Set([...TOP_BREAK_CODES, ...BOTTOM_BREAK_CODES]);
const BREAK_EMOJI_MAP: Record<string, string> = {
  wc: '🚽', bwc: '💩', cy: '🚬', 'cf+1': '🥐', 'cf+2': '🍛', 'cf+3': '🍽️',
};
const BREAK_SHORTCUT_CODE_TO_LABEL: Record<string, string> = {
  bwc: 'B', wc: 'W', cy: 'C', 'cf+1': '1', 'cf+2': '2', 'cf+3': '3',
};

/* ── Types ── */
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
  breakPolicy: { code: string; name: string };
};

type LiveBreak = { id: string; breakPolicy: { code: string }; startedAt: string };
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
  summary: { totalSessionsToday: number; totalLateMinutesToday: number };
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
  user: { displayName: string; team?: { name: string } | null };
};

type ShiftRequestsSummary = { pending: number };
type DriverRequestsSummary = { pending: number };
type RegistrationRequestsSummary = { pending: number; readyReview: number; actionable: number };

function queueDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? new Date().toISOString().slice(0, 10) : d.toISOString().slice(0, 10);
}

export default function AdminLivePage() {
  const router = useRouter();

  /* ── Monitoring state ── */
  const [data, setData] = useState<LiveBoard | null>(null);
  const [breakHistory, setBreakHistory] = useState<BreakHistoryItem[]>([]);
  const [error, setError] = useState('');
  const [nowTick, setNowTick] = useState(0);
  const [pendingShifts, setPendingShifts] = useState(0);
  const [pendingDrivers, setPendingDrivers] = useState(0);
  const [pendingSignups, setPendingSignups] = useState(0);

  /* ── Personal duty/break state ── */
  const [sessions, setSessions] = useState<DutySession[]>([]);
  const [policies, setPolicies] = useState<BreakPolicy[]>([]);
  const [breakSessions, setBreakSessions] = useState<BreakSession[]>([]);
  const [personalLoading, setPersonalLoading] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [actionMsg, setActionMsg] = useState('');
  const [queueActions, setQueueActions] = useState<QueuedAction[]>([]);
  const syncedIdsRef = useRef<Set<string>>(new Set());

  const serverActiveSession = useMemo(() => sessions.find(s => s.status === 'ACTIVE') || null, [sessions]);
  const serverActiveBreak = useMemo(() => breakSessions.find(b => b.status === 'ACTIVE') || null, [breakSessions]);

  const { activeSession, activeBreak } = useMemo(() => {
    const pending = queueActions
      .filter(a => a.status === 'pending' || a.status === 'syncing')
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    let projectedSession: DutySession | null = serverActiveSession;
    let projectedBreak: BreakSession | null = serverActiveBreak;

    for (const action of pending) {
      if (action.path === '/attendance/on') {
        if (!projectedSession) {
          const date = queueDate(action.clientTimestamp);
          projectedSession = { id: `local-duty-${action.id}`, shiftDate: date, localDate: date, punchedOnAt: action.clientTimestamp, status: 'ACTIVE', isLate: false, lateMinutes: 0, overtimeMinutes: 0 };
        }
        continue;
      }
      if (action.path === '/attendance/off') { projectedSession = null; projectedBreak = null; continue; }
      if (action.path === '/breaks/start') {
        if (projectedSession && !projectedBreak) {
          const rawCode = action.body?.code;
          const code = typeof rawCode === 'string' ? rawCode : 'break';
          const policy = policies.find(p => p.code.toLowerCase() === code.toLowerCase());
          projectedBreak = { id: `local-break-${action.id}`, localDate: queueDate(action.clientTimestamp), dutySessionId: projectedSession.id, startedAt: action.clientTimestamp, expectedDurationMinutes: policy?.expectedDurationMinutes ?? 10, status: 'ACTIVE', isOvertime: false, breakPolicy: { code: policy?.code || code, name: policy?.name || 'Queued Break' } };
        }
        continue;
      }
      if (action.path === '/breaks/end' || action.path === '/breaks/cancel') { projectedBreak = null; }
    }
    return { activeSession: projectedSession, activeBreak: projectedBreak };
  }, [queueActions, serverActiveSession, serverActiveBreak, policies]);

  const activeBreakMinutes = useMemo(() => {
    if (!activeBreak) return 0;
    return Math.max(0, Math.round((nowTick - new Date(activeBreak.startedAt).getTime()) / 60000));
  }, [activeBreak, nowTick]);

  const topRowPolicies = useMemo(() =>
    TOP_BREAK_CODES.map(code => policies.find(p => p.code.toLowerCase() === code)).filter((p): p is BreakPolicy => Boolean(p)),
    [policies]
  );
  const bottomRowPolicies = useMemo(() =>
    BOTTOM_BREAK_CODES.map(code => policies.find(p => p.code.toLowerCase() === code)).filter((p): p is BreakPolicy => Boolean(p)),
    [policies]
  );
  const extraPolicies = useMemo(() =>
    policies.filter(p => !FIXED_BREAK_CODES.has(p.code.toLowerCase())).sort((a, b) => a.code.localeCompare(b.code)),
    [policies]
  );

  const breakBlockedReason = useMemo(() => {
    if (!activeSession) return 'Punch ON first';
    if (activeBreak) return `Active break (${activeBreak.breakPolicy.code.toUpperCase()}) — end it first`;
    if (policies.length === 0) return 'No break policies configured';
    return '';
  }, [activeBreak, activeSession, policies.length]);

  const sessionBreaks = useMemo(() => {
    if (!activeSession) return [];
    const linked = breakSessions.filter(b => b.dutySessionId === activeSession.id);
    if (!activeBreak) return linked;
    const hasActive = linked.some(b => b.id === activeBreak.id);
    return hasActive ? linked : [activeBreak, ...linked];
  }, [breakSessions, activeBreak, activeSession]);

  /* ── Load personal data ── */
  async function loadPersonal(background = false) {
    if (!background) setPersonalLoading(true);
    const [sessResult, polResult, brResult] = await Promise.allSettled([
      apiFetch<DutySession[]>('/attendance/me/today'),
      apiFetch<BreakPolicy[]>('/breaks/policies'),
      apiFetch<BreakSession[]>('/breaks/me/today'),
    ]);
    if (sessResult.status === 'fulfilled') setSessions(sessResult.value);
    if (polResult.status === 'fulfilled') setPolicies(polResult.value);
    if (brResult.status === 'fulfilled') setBreakSessions(brResult.value);
    if (!background) setPersonalLoading(false);
  }

  /* ── Queue subscription ── */
  useEffect(() => {
    const init = getQueueSnapshot();
    setQueueActions(init);
    syncedIdsRef.current = new Set(init.filter(a => a.status === 'synced').map(a => a.id));
    const unsub = subscribeQueue((q: QueuedAction[]) => {
      setQueueActions(q);
      const syncedIds = q.filter(a => a.status === 'synced').map(a => a.id);
      const hadNew = syncedIds.some(id => !syncedIdsRef.current.has(id));
      syncedIdsRef.current = new Set(syncedIds);
      if (hadNew) { void loadPersonal(true); clearSynced(); }
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Online/Offline ── */
  useEffect(() => {
    setIsOffline(!navigator.onLine);
    const onOnline = () => { setIsOffline(false); void loadPersonal(true); };
    const onOffline = () => setIsOffline(true);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Personal action runner ── */
  async function runAction(path: string, body?: Record<string, unknown>) {
    setActionMsg('');
    setError('');
    if (!navigator.onLine) { /* queue will handle it */ }
    else setPersonalLoading(true);

    const result = await runQueuedAction(path, body);
    if (result.ok) {
      setActionMsg(path === '/breaks/start' ? 'Break started' : 'Done');
      setTimeout(() => setActionMsg(''), 3000);
      if (path.startsWith('/breaks')) {
        const br = await apiFetch<BreakSession[]>('/breaks/me/today').catch(() => null);
        if (br) setBreakSessions(br);
      } else {
        const [sess, br] = await Promise.allSettled([
          apiFetch<DutySession[]>('/attendance/me/today'),
          apiFetch<BreakSession[]>('/breaks/me/today'),
        ]);
        if (sess.status === 'fulfilled') setSessions(sess.value);
        if (br.status === 'fulfilled') setBreakSessions(br.value);
      }
      void loadPersonal(true);
    } else if (result.queued) {
      setActionMsg('Queued — will sync when online.');
      setTimeout(() => setActionMsg(''), 4000);
    } else {
      setError(result.error || 'Action failed');
    }
    setPersonalLoading(false);
  }

  function renderPolicyButton(policy: BreakPolicy) {
    const code = policy.code.toLowerCase();
    const emoji = BREAK_EMOJI_MAP[code] || '☕';
    const shortcutLabel = BREAK_SHORTCUT_CODE_TO_LABEL[code];
    return (
      <button
        key={policy.id}
        type="button"
        className="button-chip"
        disabled={(personalLoading && !isOffline) || !activeSession || !!activeBreak}
        onClick={() => void runAction('/breaks/start', { code: policy.code })}
        title={`${policy.name} — ${policy.expectedDurationMinutes}m, limit ${policy.dailyLimit}/day`}
      >
        {shortcutLabel ? <span className="chip-shortcut" aria-hidden="true">{shortcutLabel}</span> : null}
        <span className="chip-emoji">{emoji}</span>
        <span className="chip-code">{policy.code.toUpperCase()} · {policy.expectedDurationMinutes}m</span>
        <span className="chip-name">{policy.name}</span>
      </button>
    );
  }

  /* ── Monitoring load ── */
  useEffect(() => {
    setNowTick(Date.now());
    void loadPersonal();
    void load();
    const refreshTimer = window.setInterval(() => {
      if (!document.hidden) {
        void load();
        void loadPersonal(true);
      }
    }, 15000);
    const tickTimer = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => { window.clearInterval(refreshTimer); window.clearInterval(tickTimer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load(): Promise<void> {
    try {
      const [live, history, shifts, drivers, signups] = await Promise.all([
        apiFetch<LiveBoard>('/attendance/admin/live'),
        apiFetch<BreakHistoryItem[]>(`/breaks/admin/history?from=${encodeURIComponent(new Date().toISOString().slice(0, 10))}&to=${encodeURIComponent(new Date().toISOString().slice(0, 10))}&limit=250`),
        apiFetch<ShiftRequestsSummary>('/admin/requests/summary'),
        apiFetch<DriverRequestsSummary>('/admin/driver-requests/summary'),
        apiFetch<RegistrationRequestsSummary>('/admin/registration-requests/summary'),
      ]);
      setData(live);
      setBreakHistory(history);
      setPendingShifts(shifts.pending);
      setPendingDrivers(drivers.pending);
      setPendingSignups(signups.actionable);
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
    if (item.status === 'ACTIVE') return `${Math.max(0, Math.round((nowTick - new Date(item.startedAt).getTime()) / 60000))}m`;
    return '-';
  }

  function sessionBreakMin(b: BreakSession) {
    if (b.actualMinutes != null) return `${b.actualMinutes}m`;
    if (b.status === 'ACTIVE') return `${Math.max(0, Math.round((nowTick - new Date(b.startedAt).getTime()) / 60000))}m`;
    return '-';
  }

  const totalPending = pendingShifts + pendingDrivers;

  return (
    <AppShell title="Dashboard" subtitle="Real-time overview" admin userRole="ADMIN">
      <div className="dash-layout">
        {error ? <div className="alert alert-error">{error}</div> : null}

        {/* ═══ MY DUTY & BREAKS ═══ */}
        <section className="dash-section">
          <h2 className="dash-section-title">🧑‍💼 My Duty</h2>

          {/* Punch strip */}
          <div className="dash-punch-strip" style={{ marginBottom: '0.75rem' }}>
            <button
              type="button"
              className="punch-btn punch-on"
              disabled={(personalLoading && !isOffline) || !!activeSession}
              onClick={() => void runAction('/attendance/on')}
              style={{ padding: '0.5rem 1rem', flexDirection: 'row', gap: '0.375rem' }}
            >
              <span className="punch-icon" style={{ fontSize: '1.1rem' }}>⏻</span>
              <span className="punch-label" style={{ fontSize: '0.7rem' }}>ON</span>
            </button>

            <div className="dash-punch-status">
              {activeSession ? (
                <>
                  <span className="status-dot active" />
                  <span style={{ fontWeight: 700, color: 'var(--ok)', fontSize: '1rem' }}>
                    {Math.max(0, Math.round((nowTick - new Date(activeSession.punchedOnAt).getTime()) / 60000))}m
                  </span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>on duty</span>
                </>
              ) : (
                <span style={{ color: 'var(--muted)', fontSize: '0.8rem', fontWeight: 500 }}>Off Duty</span>
              )}
            </div>

            <button
              type="button"
              className="punch-btn punch-off"
              disabled={(personalLoading && !isOffline) || !activeSession}
              onClick={() => void runAction('/attendance/off')}
              style={{ padding: '0.5rem 1rem', flexDirection: 'row', gap: '0.375rem' }}
            >
              <span className="punch-icon" style={{ fontSize: '1.1rem' }}>⏼</span>
              <span className="punch-label" style={{ fontSize: '0.7rem' }}>OFF</span>
            </button>
          </div>

          {actionMsg ? <div className="alert alert-success" style={{ marginBottom: '0.5rem' }}>{actionMsg}</div> : null}

          {/* Break buttons */}
          <article className="card">
            <h3>Breaks</h3>
            {activeBreak ? (
              <div className="break-banner">
                <span className="status-dot active" />
                <span><strong>{activeBreak.breakPolicy.code.toUpperCase()}</strong> · {activeBreak.breakPolicy.name}</span>
                <span className="elapsed">{activeBreakMinutes}m</span>
                <span style={{ color: 'var(--muted)', fontSize: '0.72rem' }}>/ {activeBreak.expectedDurationMinutes}m</span>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.3rem' }}>
                  <button className="button button-ok button-sm" disabled={personalLoading && !isOffline} onClick={() => void runAction('/breaks/end')}>
                    End
                  </button>
                  {activeBreakMinutes < 2 ? (
                    <button className="button button-danger button-sm" disabled={personalLoading && !isOffline} onClick={() => void runAction('/breaks/cancel')}>
                      Cancel
                    </button>
                  ) : null}
                </div>
              </div>
            ) : (
              <>
                {breakBlockedReason ? <div className="alert alert-warning">{breakBlockedReason}</div> : null}
                <div className="break-chips-layout">
                  {topRowPolicies.length > 0 ? <div className="chips-row">{topRowPolicies.map(renderPolicyButton)}</div> : null}
                  {bottomRowPolicies.length > 0 ? <div className="chips-row chips-row-bottom">{bottomRowPolicies.map(renderPolicyButton)}</div> : null}
                  {extraPolicies.length > 0 ? <div className="chips-grid">{extraPolicies.map(renderPolicyButton)}</div> : null}
                  {policies.length === 0 ? <p style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>No break policies available</p> : null}
                </div>
              </>
            )}

            {/* Session breaks log */}
            {sessionBreaks.length > 0 ? (
              <div className="table-wrap" style={{ marginTop: '0.75rem' }}>
                <table>
                  <thead><tr><th>Code</th><th>Start</th><th>Min</th><th>Status</th></tr></thead>
                  <tbody>
                    {sessionBreaks.map(b => (
                      <tr key={b.id}>
                        <td><span className="tag">{b.breakPolicy.code.toUpperCase()}</span></td>
                        <td className="mono">{fmtTime(b.startedAt)}</td>
                        <td>{sessionBreakMin(b)}</td>
                        <td>
                          {b.status === 'CANCELLED' ? <span className="tag danger">Cancelled</span>
                            : b.status === 'ACTIVE' ? <span className="tag ok">Active</span>
                              : b.isOvertime ? <span className="tag warning">Late</span>
                                : <span className="tag brand">On time</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </article>
        </section>

        {/* ═══ KPIs ═══ */}
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
            <p className="kpi-label">Late</p>
            <p className="kpi-value" style={{ color: (data?.summary.totalLateMinutesToday || 0) > 0 ? 'var(--danger)' : undefined }}>
              {data?.summary.totalLateMinutesToday || 0}m
            </p>
          </article>
          <article
            className="kpi"
            style={{ cursor: totalPending > 0 ? 'pointer' : undefined }}
            onClick={() => { if (totalPending > 0) router.push('/admin/requests'); }}
          >
            <p className="kpi-label">Requests</p>
            <p className="kpi-value" style={{ color: totalPending > 0 ? 'var(--danger)' : undefined }}>
              {totalPending}
            </p>
          </article>
          <article
            className="kpi"
            style={{ cursor: pendingSignups > 0 ? 'pointer' : undefined }}
            onClick={() => { if (pendingSignups > 0) router.push('/admin/users?section=registrations'); }}
          >
            <p className="kpi-label">Signups</p>
            <p className="kpi-value" style={{ color: pendingSignups > 0 ? 'var(--warning)' : undefined }}>
              {pendingSignups}
            </p>
          </article>
        </section>

        {/* ═══ Active Sessions ═══ */}
        <section className="dash-section">
          <h2 className="dash-section-title">🟢 Active Sessions</h2>
          <article className="card">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Group</th>
                    <th>Role</th>
                    <th>Punched On</th>
                    <th>Late</th>
                    <th>Break</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.activeDutySessions.map((session) => (
                    <tr key={session.id}>
                      <td>{session.user.displayName}</td>
                      <td>{session.team?.name ? <span className="tag brand">{session.team.name}</span> : <span className="tag">Service</span>}</td>
                      <td>{session.user.role ? <span className={`tag role-${session.user.role.toLowerCase()}`}>{session.user.role}</span> : '—'}</td>
                      <td className="mono">{fmtTime(session.punchedOnAt)}</td>
                      <td>
                        {session.lateMinutes > 0 ? (
                          <span className="tag danger">{session.lateMinutes}m</span>
                        ) : (
                          <span className="tag ok">OK</span>
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
                    <tr><td colSpan={6} className="table-empty">No active sessions</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </article>
        </section>

        {/* ═══ Break History ═══ */}
        <section className="dash-section">
          <h2 className="dash-section-title">☕ Today Break History</h2>
          <article className="card">
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
                    <tr><td colSpan={8} className="table-empty">No breaks today</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </article>
        </section>
      </div>
    </AppShell>
  );
}
