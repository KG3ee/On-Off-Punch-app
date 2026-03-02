'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api';

/* ── Break constants (mirrors employee dashboard) ── */
const TOP_BREAK_CODES = ['bwc', 'wc', 'cy'] as const;
const BOTTOM_BREAK_CODES = ['cf+1', 'cf+2', 'cf+3'] as const;
const FIXED_BREAK_CODES: ReadonlySet<string> = new Set([...TOP_BREAK_CODES, ...BOTTOM_BREAK_CODES]);
const BREAK_EMOJI_MAP: Record<string, string> = {
  wc: '🚽',
  bwc: '💩',
  cy: '🚬',
  'cf+1': '🥐',
  'cf+2': '🍛',
  'cf+3': '🍽️',
};
const BREAK_SHORTCUT_CODE_TO_LABEL: Record<string, string> = {
  bwc: 'B',
  wc: 'W',
  cy: 'C',
  'cf+1': '1',
  'cf+2': '2',
  'cf+3': '3',
};

/* ── Types shared with the parent dashboard ── */
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

/* ── Team-specific types ── */
type LiveBreak = { id: string; breakPolicy: { code: string }; startedAt: string };
type LiveDuty = {
  id: string;
  punchedOnAt: string;
  isLate: boolean;
  lateMinutes: number;
  user: { displayName: string };
  breakSessions: LiveBreak[];
};
type LiveBoard = {
  localDate: string;
  activeDutySessions: LiveDuty[];
  summary: { totalSessionsToday: number; totalLateMinutesToday: number };
};

type ShiftRequestType = 'HALF_DAY_MORNING' | 'HALF_DAY_EVENING' | 'FULL_DAY_OFF' | 'CUSTOM';
type ShiftChangeRequest = {
  id: string;
  user: { displayName: string; username: string };
  requestType: ShiftRequestType;
  requestedDate: string;
  reason: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reviewedBy?: { displayName: string } | null;
};

type BreakHistoryItem = {
  id: string;
  startedAt: string;
  endedAt?: string | null;
  expectedDurationMinutes: number;
  actualMinutes?: number | null;
  status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED' | 'AUTO_CLOSED';
  isOvertime: boolean;
  breakPolicy: { code: string; name: string };
  user: { displayName: string };
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

type AttendanceRecord = {
  id: string;
  localDate: string;
  punchedOnAt: string;
  punchedOffAt?: string | null;
  status: string;
  isLate: boolean;
  lateMinutes: number;
  user: { displayName: string };
};

type TeamMember = {
  id: string;
  displayName: string;
  username: string;
  role: string;
  isActive: boolean;
};

type DriverInfo = {
  id: string;
  displayName: string;
  driverStatus: string | null;
};

/* ── Props from parent dashboard ── */
export type LeaderDashboardProps = {
  activeSession: DutySession | null;
  activeDutyMinutes: number;
  activeBreak: BreakSession | null;
  activeBreakMinutes: number;
  policies: BreakPolicy[];
  breakSessions: BreakSession[];
  monthlySummary: MonthlySummary | null;
  loading: boolean;
  isOffline: boolean;
  runAction: (path: string, body?: Record<string, unknown>) => Promise<void>;
};

/* ── Constants ── */
const REQUEST_TYPE_LABEL: Record<ShiftRequestType, string> = {
  HALF_DAY_MORNING: 'Half Day - Morning',
  HALF_DAY_EVENING: 'Half Day - Afternoon',
  FULL_DAY_OFF: 'Full Day Off',
  CUSTOM: 'Custom',
};

const DRIVER_STATUS: Record<string, { emoji: string; label: string; cls: string }> = {
  AVAILABLE: { emoji: '🟢', label: 'Available', cls: 'ok' },
  BUSY: { emoji: '🟡', label: 'Driving', cls: 'warning' },
  ON_BREAK: { emoji: '🟠', label: 'On Break', cls: 'warning' },
  OFFLINE: { emoji: '⚫', label: 'Off Duty', cls: '' },
};

export function LeaderDashboard({
  activeSession,
  activeDutyMinutes,
  activeBreak,
  activeBreakMinutes,
  policies,
  breakSessions,
  monthlySummary,
  loading,
  isOffline,
  runAction,
}: LeaderDashboardProps) {
  const [nowTick, setNowTick] = useState(0);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  /* ── Team state ── */
  const [liveData, setLiveData] = useState<LiveBoard | null>(null);
  const [breakHistory, setBreakHistory] = useState<BreakHistoryItem[]>([]);
  const [requests, setRequests] = useState<ShiftChangeRequest[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [drivers, setDrivers] = useState<DriverInfo[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);

  const [actionId, setActionId] = useState<string | null>(null);

  const [showTeam, setShowTeam] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [historyFrom, setHistoryFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  });
  const [historyTo, setHistoryTo] = useState(() => new Date().toISOString().slice(0, 10));

  /* ── Data loading ── */
  const loadTeam = useCallback(async () => {
    try {
      const [live, breaks, reqs, mems, drvs] = await Promise.all([
        apiFetch<LiveBoard>('/leader/live'),
        apiFetch<BreakHistoryItem[]>('/leader/breaks?limit=250'),
        apiFetch<ShiftChangeRequest[]>('/leader/requests'),
        apiFetch<TeamMember[]>('/leader/team'),
        apiFetch<DriverInfo[]>('/leader/drivers'),
      ]);
      setLiveData(live);
      setBreakHistory(breaks);
      setRequests(reqs);
      setMembers(mems);
      setDrivers(drvs);
    } catch { /* retry on next interval */ }
  }, []);

  useEffect(() => {
    void loadTeam();
    setNowTick(Date.now());
    const refresh = setInterval(() => void loadTeam(), 15_000);
    const tick = setInterval(() => setNowTick(Date.now()), 1000);
    return () => { clearInterval(refresh); clearInterval(tick); };
  }, [loadTeam]);

  useEffect(() => {
    if (showHistory) void loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showHistory, historyFrom, historyTo]);

  async function loadHistory() {
    try {
      setAttendance(await apiFetch<AttendanceRecord[]>(
        `/leader/attendance?from=${historyFrom}&to=${historyTo}&limit=200`
      ));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Load failed');
    }
  }

  /* ── Request actions ── */
  async function approveRequest(id: string) {
    setActionId(id);
    setError('');
    try {
      await apiFetch(`/leader/requests/${id}/approve`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setMessage('Request approved');
      await loadTeam();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally { setActionId(null); }
  }

  async function rejectRequest(id: string) {
    setActionId(id);
    setError('');
    try {
      await apiFetch(`/leader/requests/${id}/reject`, { method: 'POST' });
      setMessage('Request rejected');
      await loadTeam();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally { setActionId(null); }
  }

  /* ── Derived data ── */
  const pendingReqs = useMemo(() => requests.filter(r => r.status === 'PENDING'), [requests]);
  const resolvedReqs = useMemo(() => requests.filter(r => r.status !== 'PENDING'), [requests]);

  const topRowPolicies = useMemo(
    () => TOP_BREAK_CODES.map(code => policies.find(p => p.code.toLowerCase() === code)).filter((p): p is BreakPolicy => Boolean(p)),
    [policies]
  );
  const bottomRowPolicies = useMemo(
    () => BOTTOM_BREAK_CODES.map(code => policies.find(p => p.code.toLowerCase() === code)).filter((p): p is BreakPolicy => Boolean(p)),
    [policies]
  );
  const extraPolicies = useMemo(
    () => policies.filter(p => !FIXED_BREAK_CODES.has(p.code.toLowerCase())).sort((a, b) => a.code.localeCompare(b.code)),
    [policies]
  );

  const canStartBreak = !!activeSession && !activeBreak && !((loading && !isOffline));
  const breakBlockedReason = useMemo(() => {
    if (!activeSession) return 'Punch ON first';
    if (activeBreak) return `Active break (${activeBreak.breakPolicy.code.toUpperCase()}) — end it first`;
    if (policies.length === 0) return 'No break policies configured';
    return '';
  }, [activeBreak, activeSession, policies.length]);

  /* ── Helpers ── */
  function fmtTime(iso: string) {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
  function fmtDur(m: number) {
    const h = Math.floor(m / 60); const r = m % 60;
    return h > 0 ? `${h}h ${r}m` : `${m}m`;
  }
  function breakMin(item: BreakHistoryItem) {
    if (item.actualMinutes != null) return `${item.actualMinutes}m`;
    if (item.status === 'ACTIVE') return `${Math.max(0, Math.round((nowTick - new Date(item.startedAt).getTime()) / 60000))}m`;
    return '-';
  }
  function sessionBreakMin(b: BreakSession) {
    if (b.actualMinutes != null) return `${b.actualMinutes}m`;
    if (b.status === 'ACTIVE') return `${Math.max(0, Math.round((nowTick - new Date(b.startedAt).getTime()) / 60000))}m`;
    return '-';
  }

  function renderPolicyButton(policy: BreakPolicy) {
    const normalizedCode = policy.code.toLowerCase();
    const emoji = BREAK_EMOJI_MAP[normalizedCode] || '☕';
    const shortcutLabel = BREAK_SHORTCUT_CODE_TO_LABEL[normalizedCode];
    return (
      <button
        key={policy.id}
        type="button"
        className="button-chip"
        disabled={(loading && !isOffline) || !activeSession || !!activeBreak}
        onClick={() => void runAction('/breaks/start', { code: policy.code })}
        title={`${policy.name} — ${policy.expectedDurationMinutes}m, limit ${policy.dailyLimit}/day${shortcutLabel ? ` · Shortcut ${shortcutLabel}` : ''}`}
      >
        {shortcutLabel ? <span className="chip-shortcut" aria-hidden="true">{shortcutLabel}</span> : null}
        <span className="chip-emoji">{emoji}</span>
        <span className="chip-code">{policy.code.toUpperCase()} · {policy.expectedDurationMinutes}m</span>
        <span className="chip-name">{policy.name}</span>
      </button>
    );
  }

  return (
    <div className="dash-layout">
      {error ? <div className="alert alert-error">{error}</div> : null}
      {message ? <div className="alert alert-success">{message}</div> : null}

      {/* ═══ 1. PUNCH STRIP ═══ */}
      <div className="dash-punch-strip">
        <button
          type="button"
          className="punch-btn punch-on"
          disabled={(loading && !isOffline) || !!activeSession}
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
              <span style={{ fontWeight: 700, color: 'var(--ok)', fontSize: '1rem' }}>{fmtDur(activeDutyMinutes)}</span>
              <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>on duty</span>
            </>
          ) : (
            <span style={{ color: 'var(--muted)', fontSize: '0.8rem', fontWeight: 500 }}>Off Duty</span>
          )}
        </div>

        <button
          type="button"
          className="punch-btn punch-off"
          disabled={(loading && !isOffline) || !activeSession}
          onClick={() => void runAction('/attendance/off')}
          style={{ padding: '0.5rem 1rem', flexDirection: 'row', gap: '0.375rem' }}
        >
          <span className="punch-icon" style={{ fontSize: '1.1rem' }}>⏼</span>
          <span className="punch-label" style={{ fontSize: '0.7rem' }}>OFF</span>
        </button>
      </div>

      {/* ═══ 1b. PERSONAL BREAKS ═══ */}
      <article className="card">
        <h3>Breaks</h3>
        {activeBreak ? (
          <div className="break-banner">
            <span className="status-dot active" />
            <span><strong>{activeBreak.breakPolicy.code.toUpperCase()}</strong> · {activeBreak.breakPolicy.name}</span>
            <span className="elapsed">{activeBreakMinutes}m</span>
            <span style={{ color: 'var(--muted)', fontSize: '0.72rem' }}>/ {activeBreak.expectedDurationMinutes}m</span>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.3rem' }}>
              <button className="button button-ok button-sm" disabled={loading && !isOffline} onClick={() => void runAction('/breaks/end')}>
                End
              </button>
              {activeBreakMinutes < 2 ? (
                <button className="button button-danger button-sm" disabled={loading && !isOffline} onClick={() => void runAction('/breaks/cancel')}>
                  Cancel
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <>
            {breakBlockedReason ? (
              <div className="alert alert-warning">{breakBlockedReason}</div>
            ) : null}
            <div className="break-chips-layout">
              {topRowPolicies.length > 0 ? <div className="chips-row">{topRowPolicies.map(renderPolicyButton)}</div> : null}
              {bottomRowPolicies.length > 0 ? <div className="chips-row chips-row-bottom">{bottomRowPolicies.map(renderPolicyButton)}</div> : null}
              {extraPolicies.length > 0 ? <div className="chips-grid">{extraPolicies.map(renderPolicyButton)}</div> : null}
              {policies.length === 0 ? <p style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>No break policies available</p> : null}
            </div>
          </>
        )}
        {breakSessions.filter(b => b.dutySessionId === activeSession?.id).length > 0 ? (
          <div className="table-wrap" style={{ marginTop: '0.75rem' }}>
            <table>
              <thead><tr><th>Code</th><th>Start</th><th>Min</th><th>Status</th></tr></thead>
              <tbody>
                {breakSessions.filter(b => b.dutySessionId === activeSession?.id).map(b => (
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

      {/* ═══ 2. TEAM KPIs ═══ */}
      <section className="kpi-grid">
        <article className="kpi">
          <p className="kpi-label">Active</p>
          <p className="kpi-value" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            {(liveData?.activeDutySessions.length || 0) > 0 && <span className="status-dot active" />}
            {liveData?.activeDutySessions.length || 0}
          </p>
        </article>
        <article className="kpi">
          <p className="kpi-label">Total</p>
          <p className="kpi-value">{liveData?.summary.totalSessionsToday || 0}</p>
        </article>
        <article className="kpi">
          <p className="kpi-label">Late</p>
          <p className="kpi-value" style={{ color: (liveData?.summary.totalLateMinutesToday || 0) > 0 ? 'var(--danger)' : undefined }}>
            {liveData?.summary.totalLateMinutesToday || 0}m
          </p>
        </article>
        <article className="kpi">
          <p className="kpi-label">Requests</p>
          <p className="kpi-value" style={{ color: pendingReqs.length > 0 ? 'var(--danger)' : undefined }}>
            {pendingReqs.length}
          </p>
        </article>
      </section>

      {/* ═══ 3. MEMBER REQUESTS ═══ */}
      <section className="dash-section">
        <h2 className="dash-section-title">
          📋 Day Off Requests
          {pendingReqs.length > 0 ? <span className="dash-badge">{pendingReqs.length}</span> : null}
        </h2>
        {pendingReqs.length > 0 ? (
          <div className="dash-cards">
            {pendingReqs.map((req) => (
              <article key={req.id} className="card">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.25rem' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{req.user.displayName}</span>
                  <span className="tag warning">PENDING</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem 0.75rem', fontSize: '0.8rem', color: 'var(--ink-2)', marginBottom: '0.5rem' }}>
                  <span>{REQUEST_TYPE_LABEL[req.requestType] || req.requestType}</span>
                  <span className="mono">{req.requestedDate}</span>
                </div>
                {req.reason ? <p style={{ fontSize: '0.78rem', color: 'var(--muted)', marginBottom: '0.5rem' }}>{req.reason}</p> : null}
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button className="button button-sm button-ok" disabled={!!actionId}
                    onClick={() => void approveRequest(req.id)}>
                    {actionId === req.id ? '…' : 'Approve'}
                  </button>
                  <button className="button button-sm button-danger" disabled={!!actionId}
                    onClick={() => void rejectRequest(req.id)}>
                    {actionId === req.id ? '…' : 'Reject'}
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : null}
        {resolvedReqs.length > 0 ? (
          <article className="card">
            <div className="table-wrap">
              <table>
                <thead><tr><th>Employee</th><th>Date</th><th>Type</th><th>Status</th></tr></thead>
                <tbody>
                  {resolvedReqs.map((req) => (
                    <tr key={req.id}>
                      <td>{req.user.displayName}</td>
                      <td className="mono">{req.requestedDate}</td>
                      <td>{REQUEST_TYPE_LABEL[req.requestType] || req.requestType}</td>
                      <td>
                        <span className={`tag ${req.status === 'APPROVED' ? 'ok' : req.status === 'REJECTED' ? 'danger' : ''}`}>{req.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        ) : null}
        {pendingReqs.length === 0 && resolvedReqs.length === 0 ? (
          <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>No day off requests</p>
        ) : null}
      </section>

      {/* ═══ 4. ACTIVE SESSIONS ═══ */}
      <section className="dash-section">
        <h2 className="dash-section-title">📡 Who&apos;s On Duty</h2>
        <article className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Employee</th><th>Punched On</th><th>Late</th><th>Break</th></tr>
              </thead>
              <tbody>
                {liveData?.activeDutySessions.map((s) => (
                  <tr key={s.id}>
                    <td>{s.user.displayName}</td>
                    <td className="mono">{fmtTime(s.punchedOnAt)}</td>
                    <td>{s.lateMinutes > 0 ? <span className="tag danger">{s.lateMinutes}m</span> : <span className="tag ok">OK</span>}</td>
                    <td>{s.breakSessions.length > 0
                      ? <span className="tag warning">{s.breakSessions[0].breakPolicy.code.toUpperCase()}</span>
                      : '—'}</td>
                  </tr>
                ))}
                {!liveData?.activeDutySessions.length
                  ? <tr><td colSpan={4} className="table-empty">No active sessions</td></tr>
                  : null}
              </tbody>
            </table>
          </div>
        </article>
      </section>

      {/* ═══ 5. TEAM MEMBERS (collapsible, right under Who's On Duty) ═══ */}
      <section className="dash-section">
        <div className="dash-collapse-header" onClick={() => setShowTeam(v => !v)}>
          <h2 className="dash-section-title" style={{ marginBottom: 0 }}>👥 Team Members ({members.length})</h2>
          <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{showTeam ? '▲ Hide' : '▼ Show'}</span>
        </div>
        {showTeam ? (
          <article className="card">
            <div className="table-wrap">
              <table>
                <thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Active</th></tr></thead>
                <tbody>
                  {members.map((m) => (
                    <tr key={m.id}>
                      <td>{m.displayName}</td>
                      <td className="mono">{m.username}</td>
                      <td><span className={`tag ${m.role === 'LEADER' ? 'brand' : ''}`}>{m.role}</span></td>
                      <td>{m.isActive ? <span className="tag ok">Yes</span> : <span className="tag danger">No</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        ) : null}
      </section>

      {/* ═══ 6. ATTENDANCE HISTORY (collapsible) ═══ */}
      <section className="dash-section">
        <div className="dash-collapse-header" onClick={() => setShowHistory(v => !v)}>
          <h2 className="dash-section-title" style={{ marginBottom: 0 }}>📊 Attendance History</h2>
          <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{showHistory ? '▲ Hide' : '▼ Show'}</span>
        </div>
        {showHistory ? (
          <>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div>
                <label style={{ fontSize: '0.75rem', display: 'block', marginBottom: '0.15rem', color: 'var(--muted)' }}>From</label>
                <input type="date" className="input" value={historyFrom} onChange={(e) => setHistoryFrom(e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', display: 'block', marginBottom: '0.15rem', color: 'var(--muted)' }}>To</label>
                <input type="date" className="input" value={historyTo} onChange={(e) => setHistoryTo(e.target.value)} />
              </div>
            </div>
            <article className="card">
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Employee</th><th>Date</th><th>On</th><th>Off</th><th>Status</th><th>Late</th></tr></thead>
                  <tbody>
                    {attendance.map((r) => (
                      <tr key={r.id}>
                        <td>{r.user.displayName}</td>
                        <td className="mono">{r.localDate}</td>
                        <td className="mono">{fmtTime(r.punchedOnAt)}</td>
                        <td className="mono">{r.punchedOffAt ? fmtTime(r.punchedOffAt) : '—'}</td>
                        <td><span className={`tag ${r.status === 'ACTIVE' ? 'ok' : r.status === 'COMPLETED' ? '' : 'danger'}`}>{r.status}</span></td>
                        <td>{r.lateMinutes > 0 ? <span className="tag danger">{r.lateMinutes}m</span> : <span className="tag ok">OK</span>}</td>
                      </tr>
                    ))}
                    {attendance.length === 0 ? <tr><td colSpan={6} className="table-empty">No records</td></tr> : null}
                  </tbody>
                </table>
              </div>
            </article>
          </>
        ) : null}
      </section>

      {/* ═══ 7. TODAY BREAKS ═══ */}
      <section className="dash-section">
        <h2 className="dash-section-title">☕ Today Breaks</h2>
        <article className="card">
          <div className="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Code</th><th>Start</th><th>Min</th><th>Status</th></tr></thead>
              <tbody>
                {breakHistory.map((b) => (
                  <tr key={b.id}>
                    <td>{b.user.displayName}</td>
                    <td><span className="tag">{b.breakPolicy.code.toUpperCase()}</span></td>
                    <td className="mono">{fmtTime(b.startedAt)}</td>
                    <td>{breakMin(b)}</td>
                    <td><span className={`tag ${b.status === 'ACTIVE' ? 'ok' : b.status === 'CANCELLED' ? 'danger' : ''}`}>{b.status}</span></td>
                  </tr>
                ))}
                {breakHistory.length === 0 ? <tr><td colSpan={5} className="table-empty">No breaks today</td></tr> : null}
              </tbody>
            </table>
          </div>
        </article>
      </section>

      {/* ═══ 8. DRIVERS ═══ */}
      <section className="dash-section">
        <h2 className="dash-section-title">🚗 Drivers</h2>
        <article className="card">
          {drivers.length === 0
            ? <p style={{ color: 'var(--muted)', fontSize: '0.8rem', textAlign: 'center', padding: '0.5rem 0' }}>No drivers</p>
            : <div style={{ display: 'grid', gap: '0.375rem' }}>
              {drivers.map((d) => {
                const st = d.driverStatus || 'OFFLINE';
                const cfg = DRIVER_STATUS[st] || DRIVER_STATUS.OFFLINE;
                return (
                  <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.25rem 0' }}>
                    <span style={{ fontSize: '0.8rem', flexShrink: 0 }}>{cfg.emoji}</span>
                    <span style={{ fontSize: '0.8rem', fontWeight: 500, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.displayName}</span>
                    <span className={`tag ${cfg.cls}`} style={{ fontSize: '0.6rem' }}>{cfg.label}</span>
                  </div>
                );
              })}
            </div>
          }
        </article>
      </section>

      {/* ═══ 8. PERSONAL MONTHLY STATS ═══ */}
      {monthlySummary ? (
        <section className="kpi-grid" style={{ opacity: 0.8 }}>
          <article className="kpi">
            <p className="kpi-label">Month Hours</p>
            <p className="kpi-value" style={{ fontSize: '1rem' }}>{fmtDur(monthlySummary.totalWorkedMinutes)}</p>
          </article>
          <article className="kpi">
            <p className="kpi-label">Month Late</p>
            <p className="kpi-value" style={{ fontSize: '1rem', color: monthlySummary.totalLateMinutes > 0 ? 'var(--danger)' : undefined }}>
              {monthlySummary.totalLateMinutes}m
            </p>
          </article>
          <article className="kpi">
            <p className="kpi-label">Overtime</p>
            <p className="kpi-value" style={{ fontSize: '1rem', color: monthlySummary.totalOvertimeMinutes > 0 ? 'var(--ok)' : undefined }}>
              {monthlySummary.totalOvertimeMinutes}m
            </p>
          </article>
        </section>
      ) : null}


    </div>
  );
}
