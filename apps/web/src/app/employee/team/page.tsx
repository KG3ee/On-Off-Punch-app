'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { apiFetch } from '@/lib/api';
import { MeUser } from '@/types/auth';

type Tab = 'live' | 'requests' | 'history' | 'drivers';

type LiveBreak = { id: string; breakPolicy: { code: string }; startedAt: string };
type LiveDuty = {
  id: string;
  localDate: string;
  punchedOnAt: string;
  isLate: boolean;
  lateMinutes: number;
  user: { displayName: string };
  team?: { name: string } | null;
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
  localDate: string;
  startedAt: string;
  endedAt?: string | null;
  expectedDurationMinutes: number;
  actualMinutes?: number | null;
  status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED' | 'AUTO_CLOSED';
  isOvertime: boolean;
  breakPolicy: { code: string; name: string };
  user: { displayName: string };
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
  username: string;
  driverStatus: string | null;
};

const REQUEST_TYPE_LABEL: Record<ShiftRequestType, string> = {
  HALF_DAY_MORNING: 'Half Day - Morning Off',
  HALF_DAY_EVENING: 'Half Day - Afternoon Off',
  FULL_DAY_OFF: 'Full Day Off',
  CUSTOM: 'Custom'
};

const DRIVER_STATUS_CONFIG: Record<string, { emoji: string; label: string; color: string; bg: string }> = {
  AVAILABLE: { emoji: '🚗', label: 'Available', color: 'var(--ok)', bg: 'rgba(34,197,94,0.1)' },
  BUSY:      { emoji: '🏎️', label: 'Driving',   color: 'var(--warning)', bg: 'rgba(245,158,11,0.1)' },
  ON_BREAK:  { emoji: '☕', label: 'On Break',  color: '#f97316', bg: 'rgba(249,115,22,0.1)' },
  OFFLINE:   { emoji: '🏠', label: 'Off Duty',  color: 'var(--danger)', bg: 'rgba(239,68,68,0.1)' },
};

export default function LeaderTeamPage() {
  const router = useRouter();
  const [me, setMe] = useState<MeUser | null>(null);
  const [tab, setTab] = useState<Tab>('live');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [nowTick, setNowTick] = useState(Date.now());

  // Live
  const [liveData, setLiveData] = useState<LiveBoard | null>(null);
  const [breakHistory, setBreakHistory] = useState<BreakHistoryItem[]>([]);

  // Requests
  const [requests, setRequests] = useState<ShiftChangeRequest[]>([]);
  const [actionId, setActionId] = useState<string | null>(null);

  // History
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [historyFrom, setHistoryFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  });
  const [historyTo, setHistoryTo] = useState(() => new Date().toISOString().slice(0, 10));

  // Drivers
  const [drivers, setDrivers] = useState<DriverInfo[]>([]);

  // Team members
  const [members, setMembers] = useState<TeamMember[]>([]);

  const load = useCallback(async (silent = false) => {
    if (!silent) { setLoading(true); setError(''); }
    try {
      const meData = await apiFetch<MeUser>('/me');
      if (meData.role !== 'LEADER') {
        router.replace('/employee/dashboard');
        return;
      }
      setMe(meData);

      const [liveRes, breakRes, reqRes, membersRes, driversRes] = await Promise.all([
        apiFetch<LiveBoard>('/leader/live'),
        apiFetch<BreakHistoryItem[]>('/leader/breaks?limit=250'),
        apiFetch<ShiftChangeRequest[]>('/leader/requests'),
        apiFetch<TeamMember[]>('/leader/team'),
        apiFetch<DriverInfo[]>('/leader/drivers'),
      ]);
      setLiveData(liveRes);
      setBreakHistory(breakRes);
      setRequests(reqRes);
      setMembers(membersRes);
      setDrivers(driversRes);
    } catch (err) {
      if (!silent) setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
    const refreshTimer = window.setInterval(() => void load(true), 15_000);
    const tickTimer = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => {
      clearInterval(refreshTimer);
      clearInterval(tickTimer);
    };
  }, [load]);

  async function loadHistory() {
    try {
      const data = await apiFetch<AttendanceRecord[]>(
        `/leader/attendance?from=${historyFrom}&to=${historyTo}&limit=200`
      );
      setAttendance(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load history');
    }
  }

  useEffect(() => {
    if (tab === 'history' && me) void loadHistory();
  }, [tab, historyFrom, historyTo, me]);

  async function approveRequest(id: string) {
    setActionId(id);
    setError('');
    try {
      await apiFetch(`/leader/requests/${id}/approve`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setMessage('Request approved');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve');
    } finally {
      setActionId(null);
    }
  }

  async function rejectRequest(id: string) {
    setActionId(id);
    setError('');
    try {
      await apiFetch(`/leader/requests/${id}/reject`, { method: 'POST' });
      setMessage('Request rejected');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject');
    } finally {
      setActionId(null);
    }
  }

  const pendingCount = useMemo(
    () => requests.filter((r) => r.status === 'PENDING').length,
    [requests]
  );

  function fmtTime(iso: string): string {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  function breakMinutes(item: BreakHistoryItem): string {
    if (item.actualMinutes != null) return `${item.actualMinutes}m`;
    if (item.status === 'ACTIVE') {
      return `${Math.max(0, Math.round((nowTick - new Date(item.startedAt).getTime()) / 60000))}m`;
    }
    return '-';
  }

  if (loading) {
    return (
      <AppShell title="Team" subtitle="Loading…" userRole={me?.role}>
        <p style={{ color: 'var(--muted)' }}>Loading…</p>
      </AppShell>
    );
  }

  return (
    <AppShell title="Team" subtitle={me?.team?.name || 'Your Team'} userRole={me?.role}>
      {error ? <div className="alert alert-error">{error}</div> : null}
      {message ? <div className="alert alert-success">{message}</div> : null}

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: '0.375rem', marginBottom: '1rem', overflowX: 'auto' }}>
        {(['live', 'requests', 'history', 'drivers'] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            className={`button ${tab === t ? 'button-primary' : 'button-ghost'}`}
            onClick={() => { setTab(t); setMessage(''); }}
            style={{ position: 'relative', flex: 1, justifyContent: 'center', padding: '0.625rem 1rem', fontSize: '0.875rem', minHeight: '2.75rem' }}
          >
            {t === 'live' ? '📡 Live' : t === 'requests' ? '📋 Requests' : t === 'history' ? '📊 History' : '🚗 Drivers'}
            {t === 'requests' && pendingCount > 0 ? (
              <span style={{
                position: 'absolute',
                top: '-0.25rem',
                right: '-0.25rem',
                background: 'var(--danger)',
                color: '#fff',
                fontSize: '0.7rem',
                fontWeight: 700,
                borderRadius: '999px',
                padding: '0.05rem 0.35rem',
                minWidth: '1.1rem',
                textAlign: 'center',
                lineHeight: '1.2'
              }}>
                {pendingCount}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {/* ── LIVE TAB ── */}
      {tab === 'live' ? (
        <>
          <section className="kpi-grid">
            <article className="kpi">
              <p className="kpi-label">Date</p>
              <p className="kpi-value mono">{liveData?.localDate || '—'}</p>
            </article>
            <article className="kpi">
              <p className="kpi-label">Active Now</p>
              <p className="kpi-value" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                {(liveData?.activeDutySessions.length || 0) > 0 && <span className="status-dot active" />}
                {liveData?.activeDutySessions.length || 0}
              </p>
            </article>
            <article className="kpi">
              <p className="kpi-label">Total Today</p>
              <p className="kpi-value">{liveData?.summary.totalSessionsToday || 0}</p>
            </article>
            <article className="kpi">
              <p className="kpi-label">Late Min</p>
              <p className="kpi-value">{liveData?.summary.totalLateMinutesToday || 0}</p>
            </article>
          </section>

          <article className="card">
            <h3>Active Sessions</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Punched On</th>
                    <th>Late</th>
                    <th>Break</th>
                  </tr>
                </thead>
                <tbody>
                  {liveData?.activeDutySessions.map((s) => (
                    <tr key={s.id}>
                      <td>{s.user.displayName}</td>
                      <td className="mono">{fmtTime(s.punchedOnAt)}</td>
                      <td>
                        {s.lateMinutes > 0 ? (
                          <span className="tag danger">{s.lateMinutes}m</span>
                        ) : (
                          <span className="tag ok">On time</span>
                        )}
                      </td>
                      <td>
                        {s.breakSessions.length > 0 ? (
                          <span className="tag warning">
                            {s.breakSessions[0].breakPolicy.code.toUpperCase()} · {fmtTime(s.breakSessions[0].startedAt)}
                          </span>
                        ) : '—'}
                      </td>
                    </tr>
                  ))}
                  {!liveData?.activeDutySessions.length ? (
                    <tr><td colSpan={4} style={{ color: 'var(--muted)' }}>No active sessions</td></tr>
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
                    <th>Employee</th>
                    <th>Code</th>
                    <th>Start</th>
                    <th>End</th>
                    <th>Min</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {breakHistory.map((item) => (
                    <tr key={item.id}>
                      <td>{item.user.displayName}</td>
                      <td><span className="tag">{item.breakPolicy.code.toUpperCase()}</span></td>
                      <td className="mono">{fmtTime(item.startedAt)}</td>
                      <td className="mono">{item.endedAt ? fmtTime(item.endedAt) : '—'}</td>
                      <td>{breakMinutes(item)}</td>
                      <td>
                        <span className={`tag ${item.status === 'ACTIVE' ? 'ok' : item.status === 'CANCELLED' ? 'danger' : ''}`}>
                          {item.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {breakHistory.length === 0 ? (
                    <tr><td colSpan={6} style={{ color: 'var(--muted)' }}>No breaks today</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </article>

          <article className="card" style={{ marginTop: '0.5rem' }}>
            <h3>Team Members ({members.length})</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Username</th>
                    <th>Role</th>
                    <th>Active</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => (
                    <tr key={m.id}>
                      <td>{m.displayName}</td>
                      <td className="mono">{m.username}</td>
                      <td>
                        <span className={`tag ${m.role === 'LEADER' ? 'brand' : ''}`}>{m.role}</span>
                      </td>
                      <td>{m.isActive ? <span className="tag ok">Yes</span> : <span className="tag danger">No</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        </>
      ) : null}

      {/* ── REQUESTS TAB ── */}
      {tab === 'requests' ? (
        <>
          <article className="card">
            <h3>Team Day Off Requests</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Type</th>
                    <th>Date</th>
                    <th>Reason</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((req) => (
                    <tr key={req.id}>
                      <td>{req.user.displayName}</td>
                      <td>{REQUEST_TYPE_LABEL[req.requestType] || req.requestType}</td>
                      <td className="mono">{req.requestedDate}</td>
                      <td>{req.reason || '—'}</td>
                      <td>
                        <span className={`tag ${req.status === 'APPROVED' ? 'ok' : req.status === 'REJECTED' ? 'danger' : 'warning'}`}>
                          {req.status}
                        </span>
                      </td>
                      <td>
                        {req.status === 'PENDING' ? (
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button
                              className="button button-sm button-ok"
                              disabled={!!actionId}
                              onClick={() => void approveRequest(req.id)}
                            >
                              {actionId === req.id ? '…' : 'Approve'}
                            </button>
                            <button
                              className="button button-sm button-danger"
                              disabled={!!actionId}
                              onClick={() => void rejectRequest(req.id)}
                            >
                              {actionId === req.id ? '…' : 'Reject'}
                            </button>
                          </div>
                        ) : (
                          <span style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>
                            {req.reviewedBy?.displayName || '—'}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {requests.length === 0 ? (
                    <tr><td colSpan={6} style={{ color: 'var(--muted)' }}>No requests</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </article>

        </>
      ) : null}

      {/* ── HISTORY TAB ── */}
      {tab === 'history' ? (
        <>
          <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <label style={{ fontSize: '0.8rem', display: 'block', marginBottom: '0.2rem' }}>From</label>
              <input type="date" className="input" value={historyFrom} onChange={(e) => setHistoryFrom(e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: '0.8rem', display: 'block', marginBottom: '0.2rem' }}>To</label>
              <input type="date" className="input" value={historyTo} onChange={(e) => setHistoryTo(e.target.value)} />
            </div>
          </div>

          <article className="card">
            <h3>Attendance History</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Date</th>
                    <th>Punch On</th>
                    <th>Punch Off</th>
                    <th>Status</th>
                    <th>Late</th>
                  </tr>
                </thead>
                <tbody>
                  {attendance.map((rec) => (
                    <tr key={rec.id}>
                      <td>{rec.user.displayName}</td>
                      <td className="mono">{rec.localDate}</td>
                      <td className="mono">{fmtTime(rec.punchedOnAt)}</td>
                      <td className="mono">{rec.punchedOffAt ? fmtTime(rec.punchedOffAt) : '—'}</td>
                      <td>
                        <span className={`tag ${rec.status === 'ACTIVE' ? 'ok' : rec.status === 'COMPLETED' ? '' : 'danger'}`}>
                          {rec.status}
                        </span>
                      </td>
                      <td>
                        {rec.lateMinutes > 0 ? (
                          <span className="tag danger">{rec.lateMinutes}m</span>
                        ) : (
                          <span className="tag ok">On time</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {attendance.length === 0 ? (
                    <tr><td colSpan={6} style={{ color: 'var(--muted)' }}>No records for this period</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </article>
        </>
      ) : null}

      {/* ── DRIVERS TAB ── */}
      {tab === 'drivers' ? (
        <article className="card" style={{ padding: '1rem' }}>
          <h3 style={{ marginBottom: '0.75rem' }}>Driver Availability</h3>
          {drivers.length === 0 ? (
            <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>No drivers found.</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.5rem' }}>
              {drivers.map((d) => {
                const status = d.driverStatus || 'OFFLINE';
                const cfg = DRIVER_STATUS_CONFIG[status] || DRIVER_STATUS_CONFIG.OFFLINE;
                return (
                  <div
                    key={d.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.625rem',
                      padding: '0.625rem 0.75rem',
                      background: cfg.bg,
                      borderRadius: 'var(--radius)',
                    }}
                  >
                    <span style={{ fontSize: '1.25rem', lineHeight: 1, flexShrink: 0 }}>{cfg.emoji}</span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {d.displayName}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: cfg.color, fontWeight: 600 }}>
                        {cfg.label}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </article>
      ) : null}
    </AppShell>
  );
}
