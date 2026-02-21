'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api';

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
  shiftPreset: { id: string; name: string } | null;
  requestedDate: string;
  reason: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reviewedBy?: { displayName: string } | null;
};
type ShiftPreset = { id: string; name: string };

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
  CUSTOM: 'Custom',
};

const DRIVER_STATUS_CONFIG: Record<string, { emoji: string; label: string; color: string; bg: string }> = {
  AVAILABLE: { emoji: '🚗', label: 'Available', color: 'var(--ok)', bg: 'rgba(34,197,94,0.1)' },
  BUSY:      { emoji: '🏎️', label: 'Driving',   color: 'var(--warning)', bg: 'rgba(245,158,11,0.1)' },
  ON_BREAK:  { emoji: '☕', label: 'On Break',  color: '#f97316', bg: 'rgba(249,115,22,0.1)' },
  OFFLINE:   { emoji: '🏠', label: 'Off Duty',  color: 'var(--danger)', bg: 'rgba(239,68,68,0.1)' },
};

export function LeaderTeamSections() {
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [nowTick, setNowTick] = useState(0);

  const [liveData, setLiveData] = useState<LiveBoard | null>(null);
  const [breakHistory, setBreakHistory] = useState<BreakHistoryItem[]>([]);
  const [requests, setRequests] = useState<ShiftChangeRequest[]>([]);
  const [presets, setPresets] = useState<ShiftPreset[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [drivers, setDrivers] = useState<DriverInfo[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);

  const [approveTarget, setApproveTarget] = useState<ShiftChangeRequest | null>(null);
  const [selectedPresetId, setSelectedPresetId] = useState('');
  const [actionId, setActionId] = useState<string | null>(null);

  const [historyFrom, setHistoryFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  });
  const [historyTo, setHistoryTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [showHistory, setShowHistory] = useState(false);

  const load = useCallback(async () => {
    try {
      const [liveRes, breakRes, reqRes, presetRes, membersRes, driversRes] = await Promise.all([
        apiFetch<LiveBoard>('/leader/live'),
        apiFetch<BreakHistoryItem[]>('/leader/breaks?limit=250'),
        apiFetch<ShiftChangeRequest[]>('/leader/requests'),
        apiFetch<ShiftPreset[]>('/leader/shift-presets'),
        apiFetch<TeamMember[]>('/leader/team'),
        apiFetch<DriverInfo[]>('/leader/drivers'),
      ]);
      setLiveData(liveRes);
      setBreakHistory(breakRes);
      setRequests(reqRes);
      setPresets(presetRes);
      setMembers(membersRes);
      setDrivers(driversRes);
    } catch {
      /* silently retry on next tick */
    }
  }, []);

  useEffect(() => {
    void load();
    setNowTick(Date.now());
    const refreshTimer = window.setInterval(() => void load(), 15_000);
    const tickTimer = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => {
      clearInterval(refreshTimer);
      clearInterval(tickTimer);
    };
  }, [load]);

  async function loadHistory() {
    try {
      const data = await apiFetch<AttendanceRecord[]>(
        `/leader/attendance?from=${historyFrom}&to=${historyTo}&limit=200`,
      );
      setAttendance(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load history');
    }
  }

  useEffect(() => {
    if (showHistory) void loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showHistory, historyFrom, historyTo]);

  async function approveRequest() {
    if (!approveTarget) return;
    setActionId(approveTarget.id);
    setError('');
    try {
      await apiFetch(`/leader/requests/${approveTarget.id}/approve`, {
        method: 'POST',
        body: JSON.stringify({ targetPresetId: selectedPresetId || undefined }),
      });
      setMessage('Request approved');
      setApproveTarget(null);
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

  const pendingRequests = useMemo(
    () => requests.filter((r) => r.status === 'PENDING'),
    [requests],
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

  const sectionHeadingStyle: React.CSSProperties = {
    fontSize: '1rem',
    fontWeight: 700,
    marginBottom: '0.75rem',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  };

  return (
    <>
      {error ? <div className="alert alert-error">{error}</div> : null}
      {message ? <div className="alert alert-success">{message}</div> : null}

      {/* ── DIVIDER ── */}
      <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '1.5rem 0' }} />

      {/* ── TEAM LIVE STATUS ── */}
      <section>
        <h2 style={sectionHeadingStyle}>📡 Team Live Status</h2>
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
      </section>

      {/* ── PENDING REQUESTS ── */}
      <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '1.5rem 0' }} />
      <section>
        <h2 style={sectionHeadingStyle}>
          📋 Pending Requests
          {pendingRequests.length > 0 ? (
            <span style={{
              background: 'var(--danger)', color: '#fff', fontSize: '0.7rem', fontWeight: 700,
              borderRadius: '999px', padding: '0.1rem 0.4rem', minWidth: '1.1rem', textAlign: 'center',
            }}>
              {pendingRequests.length}
            </span>
          ) : null}
        </h2>
        {requests.length === 0 ? (
          <article className="card">
            <p style={{ color: 'var(--muted)', fontSize: '0.85rem', textAlign: 'center', padding: '1rem 0' }}>No requests</p>
          </article>
        ) : (
          <div style={{ display: 'grid', gap: '0.5rem' }}>
            {requests.map((req) => (
              <article key={req.id} className="card" style={{ padding: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.375rem' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{req.user.displayName}</span>
                  <span className={`tag ${req.status === 'APPROVED' ? 'ok' : req.status === 'REJECTED' ? 'danger' : 'warning'}`}>
                    {req.status}
                  </span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem 1rem', fontSize: '0.8rem', color: 'var(--ink-2)', marginBottom: '0.375rem' }}>
                  <span>{REQUEST_TYPE_LABEL[req.requestType] || req.requestType}</span>
                  <span className="mono">{req.requestedDate}</span>
                </div>
                {req.reason ? (
                  <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: '0.375rem' }}>{req.reason}</p>
                ) : null}
                {req.status === 'PENDING' ? (
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
                    <button
                      className="button button-sm button-ok"
                      disabled={!!actionId}
                      onClick={() => {
                        setApproveTarget(req);
                        setSelectedPresetId(req.shiftPreset?.id || (presets[0]?.id ?? ''));
                      }}
                    >
                      Approve
                    </button>
                    <button
                      className="button button-sm button-danger"
                      disabled={!!actionId}
                      onClick={() => void rejectRequest(req.id)}
                    >
                      {actionId === req.id ? '…' : 'Reject'}
                    </button>
                  </div>
                ) : req.reviewedBy ? (
                  <p style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Reviewed by {req.reviewedBy.displayName}</p>
                ) : null}
              </article>
            ))}
          </div>
        )}

        {approveTarget ? (
          <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setApproveTarget(null); }}>
            <div className="modal">
              <h3>Approve Shift Request</h3>
              <p style={{ marginBottom: '0.5rem', fontSize: '0.85rem', color: 'var(--muted)' }}>
                <strong>{approveTarget.user.displayName}</strong> requested{' '}
                <strong>{REQUEST_TYPE_LABEL[approveTarget.requestType]}</strong> on{' '}
                <strong>{approveTarget.requestedDate}</strong>.
              </p>
              <label style={{ fontSize: '0.8rem', marginBottom: '0.25rem', display: 'block' }}>Target Shift Preset</label>
              <select
                className="select"
                value={selectedPresetId}
                onChange={(e) => setSelectedPresetId(e.target.value)}
              >
                {presets.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <div className="modal-footer">
                <button className="button button-ghost" onClick={() => setApproveTarget(null)}>Cancel</button>
                <button
                  className="button button-primary"
                  disabled={!!actionId}
                  onClick={() => void approveRequest()}
                >
                  {actionId ? 'Approving…' : 'Approve'}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </section>

      {/* ── DRIVER AVAILABILITY ── */}
      <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '1.5rem 0' }} />
      <section>
        <h2 style={sectionHeadingStyle}>🚗 Driver Availability</h2>
        {drivers.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>No drivers found.</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(220px, 100%), 1fr))', gap: '0.5rem' }}>
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
      </section>

      {/* ── ATTENDANCE HISTORY ── */}
      <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '1.5rem 0' }} />
      <section>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
          <h2 style={{ ...sectionHeadingStyle, marginBottom: 0 }}>📊 Attendance History</h2>
          <button
            className={`button button-sm ${showHistory ? 'button-ghost' : 'button-primary'}`}
            onClick={() => setShowHistory((v) => !v)}
          >
            {showHistory ? 'Hide' : 'Show'}
          </button>
        </div>
        {showHistory ? (
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
      </section>
    </>
  );
}
