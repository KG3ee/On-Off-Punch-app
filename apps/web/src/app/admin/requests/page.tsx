'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { apiFetch } from '@/lib/api';

type ShiftRequestType = 'HALF_DAY_MORNING' | 'HALF_DAY_EVENING' | 'FULL_DAY_OFF' | 'CUSTOM';

type ShiftPreset = {
  id: string;
  name: string;
};

type ShiftChangeRequest = {
  id: string;
  user: { displayName: string; username: string };
  requestType: ShiftRequestType;
  shiftPreset: { id: string; name: string } | null;
  requestedDate: string;
  reason: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
};

type DriverRequest = {
  id: string;
  user: { id: string; displayName: string; username: string };
  driver: { id: string; displayName: string; username: string } | null;
  requestedDate: string;
  requestedTime: string;
  destination: string;
  purpose: string | null;
  isRoundTrip: boolean;
  returnDate: string | null;
  returnTime: string | null;
  returnLocation: string | null;
  contactNumber: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'IN_PROGRESS' | 'COMPLETED';
};

const REQUEST_TYPE_LABEL: Record<ShiftRequestType, string> = {
  HALF_DAY_MORNING: 'Half Day - Morning Off',
  HALF_DAY_EVENING: 'Half Day - Afternoon Off',
  FULL_DAY_OFF: 'Full Day Off',
  CUSTOM: 'Custom'
};

const DRIVER_STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pending',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed'
};

type DriverUser = {
  id: string;
  displayName: string;
  username: string;
  role: string;
  driverStatus?: string;
};

const DRIVER_AVAIL_CONFIG: Record<string, { emoji: string; label: string; color: string; bg: string }> = {
  AVAILABLE: { emoji: '🚗', label: 'Available', color: 'var(--ok)', bg: 'rgba(34,197,94,0.12)' },
  BUSY:      { emoji: '🏎️', label: 'Driving',   color: 'var(--warning)', bg: 'rgba(245,158,11,0.12)' },
  ON_BREAK:  { emoji: '☕', label: 'On Break',  color: '#f97316', bg: 'rgba(249,115,22,0.12)' },
  OFFLINE:   { emoji: '🏠', label: 'Off Duty',  color: 'var(--danger)', bg: 'rgba(239,68,68,0.12)' },
};

export default function AdminRequestsPage() {
  return <Suspense><AdminRequestsContent /></Suspense>;
}

function getMonthRange(year: number, month: number): [string, string] {
  const from = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const last = new Date(year, month + 1, 0).getDate();
  const to = `${year}-${String(month + 1).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
  return [from, to];
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function AdminRequestsContent() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab') === 'driver' ? 'driver' : 'shift';
  const [tab, setTab] = useState<'shift' | 'driver'>(initialTab);

  const [requests, setRequests] = useState<ShiftChangeRequest[]>([]);
  const [driverRequests, setDriverRequests] = useState<DriverRequest[]>([]);
  const [drivers, setDrivers] = useState<DriverUser[]>([]);
  const [presets, setPresets] = useState<ShiftPreset[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const now = new Date();
  const [filterMode, setFilterMode] = useState<'month' | 'all' | 'custom'>('month');
  const [filterYear, setFilterYear] = useState(now.getFullYear());
  const [filterMonth, setFilterMonth] = useState(now.getMonth());
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const [approveTarget, setApproveTarget] = useState<ShiftChangeRequest | null>(null);
  const [selectedPresetId, setSelectedPresetId] = useState('');
  const [approvingWithPreset, setApprovingWithPreset] = useState(false);

  const [driverActionId, setDriverActionId] = useState<string | null>(null);
  const [driverApproveTarget, setDriverApproveTarget] = useState<DriverRequest | null>(null);
  const [selectedDriverId, setSelectedDriverId] = useState('');

  const load = useCallback(async (silent = false) => {
    if (!silent) { setLoading(true); setError(''); }
    try {
      const [requestsData, presetsData, driverRequestsData, usersData] = await Promise.all([
        apiFetch<ShiftChangeRequest[]>('/admin/requests'),
        apiFetch<ShiftPreset[]>('/admin/shift-presets'),
        apiFetch<DriverRequest[]>('/admin/driver-requests'),
        apiFetch<DriverUser[]>('/admin/users')
      ]);
      setRequests(requestsData);
      setPresets(presetsData);
      setDriverRequests(driverRequestsData);
      setDrivers(usersData.filter((u) => u.role === 'DRIVER'));
    } catch {
      if (!silent) setError('Failed to load requests');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(true), 15_000);
    return () => clearInterval(timer);
  }, [load]);

  async function rejectRequest(id: string) {
    setError(''); setMessage('');
    try {
      await apiFetch(`/admin/requests/${id}/reject`, { method: 'POST' });
      setMessage('Request rejected successfully');
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to reject'); }
  }

  async function approveRequestDirect(id: string) {
    setError(''); setMessage('');
    try {
      await apiFetch(`/admin/requests/${id}/approve`, { method: 'POST', body: JSON.stringify({}) });
      setMessage('Request approved successfully');
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to approve'); }
  }

  function openApproveModal(request: ShiftChangeRequest) {
    setApproveTarget(request);
    setSelectedPresetId(presets[0]?.id || '');
    setError(''); setMessage('');
  }

  function closeApproveModal() {
    setApproveTarget(null);
    setSelectedPresetId('');
    setApprovingWithPreset(false);
  }

  async function approveWithSelectedPreset() {
    if (!approveTarget) return;
    if (!selectedPresetId) { setError('Please select a shift preset'); return; }
    setApprovingWithPreset(true); setError(''); setMessage('');
    try {
      await apiFetch(`/admin/requests/${approveTarget.id}/approve`, {
        method: 'POST',
        body: JSON.stringify({ targetPresetId: selectedPresetId })
      });
      setMessage('Request approved successfully');
      closeApproveModal();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve');
      setApprovingWithPreset(false);
    }
  }

  function openDriverApproveModal(req: DriverRequest) {
    setDriverApproveTarget(req);
    setSelectedDriverId(drivers[0]?.id || '');
    setError(''); setMessage('');
  }

  async function confirmDriverApprove() {
    if (!driverApproveTarget) return;
    if (!selectedDriverId) { setError('Please select a driver'); return; }
    setDriverActionId(driverApproveTarget.id); setError(''); setMessage('');
    try {
      await apiFetch(`/admin/driver-requests/${driverApproveTarget.id}/approve`, {
        method: 'POST',
        body: JSON.stringify({ driverId: selectedDriverId })
      });
      setMessage('Driver request approved and assigned');
      setDriverApproveTarget(null); setSelectedDriverId('');
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to approve'); }
    finally { setDriverActionId(null); }
  }

  async function rejectDriverRequest(id: string) {
    setDriverActionId(id); setError(''); setMessage('');
    try {
      await apiFetch(`/admin/driver-requests/${id}/reject`, { method: 'POST', body: JSON.stringify({}) });
      setMessage('Driver request rejected');
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to reject'); }
    finally { setDriverActionId(null); }
  }

  function inRange(dateStr: string): boolean {
    if (filterMode === 'all') return true;
    const d = dateStr.slice(0, 10);
    if (filterMode === 'month') {
      const [from, to] = getMonthRange(filterYear, filterMonth);
      return d >= from && d <= to;
    }
    if (customFrom && d < customFrom) return false;
    if (customTo && d > customTo) return false;
    return true;
  }

  const filteredShifts = useMemo(() => requests.filter(r => inRange(r.requestedDate)), [requests, filterMode, filterYear, filterMonth, customFrom, customTo]);
  const filteredDriverReqs = useMemo(() => driverRequests.filter(r => inRange(r.requestedDate)), [driverRequests, filterMode, filterYear, filterMonth, customFrom, customTo]);

  const pendingShifts = useMemo(() => filteredShifts.filter(r => r.status === 'PENDING'), [filteredShifts]);
  const resolvedShifts = useMemo(() => filteredShifts.filter(r => r.status !== 'PENDING'), [filteredShifts]);
  const pendingDriverReqs = useMemo(() => filteredDriverReqs.filter(r => r.status === 'PENDING'), [filteredDriverReqs]);
  const resolvedDriverReqs = useMemo(() => filteredDriverReqs.filter(r => r.status !== 'PENDING'), [filteredDriverReqs]);
  const approvedShifts = useMemo(() => filteredShifts.filter(r => r.status === 'APPROVED').length, [filteredShifts]);
  const rejectedShifts = useMemo(() => filteredShifts.filter(r => r.status === 'REJECTED').length, [filteredShifts]);
  const approvedDrivers = useMemo(() => filteredDriverReqs.filter(r => r.status === 'APPROVED' || r.status === 'IN_PROGRESS' || r.status === 'COMPLETED').length, [filteredDriverReqs]);
  const rejectedDrivers = useMemo(() => filteredDriverReqs.filter(r => r.status === 'REJECTED').length, [filteredDriverReqs]);

  function prevMonth() { if (filterMonth === 0) { setFilterMonth(11); setFilterYear(y => y - 1); } else setFilterMonth(m => m - 1); }
  function nextMonth() { if (filterMonth === 11) { setFilterMonth(0); setFilterYear(y => y + 1); } else setFilterMonth(m => m + 1); }
  function goThisMonth() { setFilterMode('month'); setFilterYear(now.getFullYear()); setFilterMonth(now.getMonth()); }

  return (
    <AppShell title="Requests" subtitle="Approve or reject shift and driver requests" admin userRole="ADMIN">
      <div className="dash-layout">
        {message ? <div className="alert alert-success">{message}</div> : null}
        {error ? <div className="alert alert-error">{error}</div> : null}

        {/* ═══ Date Filter ═══ */}
        <div className="toolbar" style={{ marginBottom: 0 }}>
          <nav className="nav">
            <a style={{ cursor: 'pointer', userSelect: 'none', padding: '0.25rem 0.4rem', fontSize: '0.8rem' }} onClick={prevMonth}>‹</a>
            <a
              className={filterMode === 'month' ? 'active' : ''}
              style={{ cursor: 'pointer', fontWeight: 600, minWidth: '5.5rem', textAlign: 'center' }}
              onClick={() => setFilterMode('month')}
            >
              {MONTH_NAMES[filterMonth]} {filterYear}
            </a>
            <a style={{ cursor: 'pointer', userSelect: 'none', padding: '0.25rem 0.4rem', fontSize: '0.8rem' }} onClick={nextMonth}>›</a>
            <a className={filterMode === 'all' ? 'active' : ''} style={{ cursor: 'pointer' }} onClick={() => setFilterMode('all')}>All</a>
            <a className={filterMode === 'custom' ? 'active' : ''} style={{ cursor: 'pointer' }} onClick={() => setFilterMode('custom')}>Range</a>
          </nav>
          {filterMode === 'custom' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginLeft: 'auto' }}>
              <input type="date" className="input" style={{ padding: '0.25rem 0.4rem', fontSize: '0.75rem' }} value={customFrom} onChange={(e) => { setCustomFrom(e.target.value); setFilterMode('custom'); }} />
              <span style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>–</span>
              <input type="date" className="input" style={{ padding: '0.25rem 0.4rem', fontSize: '0.75rem' }} value={customTo} onChange={(e) => { setCustomTo(e.target.value); setFilterMode('custom'); }} />
            </div>
          ) : (
            <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--muted)' }}>
              {filterMode === 'all' ? 'All time' : filterMode === 'month' && filterYear === now.getFullYear() && filterMonth === now.getMonth() ? 'This month' : `${MONTH_NAMES[filterMonth]} ${filterYear}`}
            </span>
          )}
        </div>

        {/* ═══ Tab Selectors ═══ */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
          <button
            type="button"
            onClick={() => setTab('shift')}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '0.65rem 0.85rem', borderRadius: 'var(--radius-lg)',
              background: tab === 'shift' ? 'var(--brand)' : 'var(--card)',
              border: tab === 'shift' ? '1px solid var(--brand)' : '1px solid var(--line)',
              color: tab === 'shift' ? '#fff' : 'var(--ink)',
              cursor: 'pointer', transition: 'all 0.15s ease',
            }}
          >
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em', opacity: 0.8 }}>Shift Requests</div>
              <div style={{ fontSize: '0.75rem', marginTop: '0.15rem', opacity: 0.7 }}>
                {approvedShifts} approved · {rejectedShifts} rejected
              </div>
            </div>
            {pendingShifts.length > 0 ? (
              <span style={{ background: tab === 'shift' ? 'rgba(255,255,255,0.25)' : 'var(--danger)', color: '#fff', fontSize: '0.75rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: '999px', minWidth: '1.5rem', textAlign: 'center' }}>
                {pendingShifts.length}
              </span>
            ) : (
              <span style={{ fontSize: '0.75rem', opacity: 0.5 }}>0 pending</span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setTab('driver')}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '0.65rem 0.85rem', borderRadius: 'var(--radius-lg)',
              background: tab === 'driver' ? 'var(--brand)' : 'var(--card)',
              border: tab === 'driver' ? '1px solid var(--brand)' : '1px solid var(--line)',
              color: tab === 'driver' ? '#fff' : 'var(--ink)',
              cursor: 'pointer', transition: 'all 0.15s ease',
            }}
          >
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em', opacity: 0.8 }}>Driver Requests</div>
              <div style={{ fontSize: '0.75rem', marginTop: '0.15rem', opacity: 0.7 }}>
                {approvedDrivers} approved · {rejectedDrivers} rejected
              </div>
            </div>
            {pendingDriverReqs.length > 0 ? (
              <span style={{ background: tab === 'driver' ? 'rgba(255,255,255,0.25)' : 'var(--danger)', color: '#fff', fontSize: '0.75rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: '999px', minWidth: '1.5rem', textAlign: 'center' }}>
                {pendingDriverReqs.length}
              </span>
            ) : (
              <span style={{ fontSize: '0.75rem', opacity: 0.5 }}>0 pending</span>
            )}
          </button>
        </div>

        {/* ═══ SHIFT TAB ═══ */}
        {tab === 'shift' ? (
          <>
            {/* Pending shift requests as cards */}
            {pendingShifts.length > 0 ? (
              <section className="dash-section">
                <h2 className="dash-section-title">
                  Pending Shift Requests <span className="dash-badge">{pendingShifts.length}</span>
                </h2>
                <div className="dash-cards">
                  {pendingShifts.map(req => (
                    <article key={req.id} className="card" style={{ padding: '0.75rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{req.user.displayName}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>@{req.user.username}</div>
                        </div>
                        <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
                          <button
                            className="button button-sm button-ok"
                            disabled={loading}
                            onClick={() => req.shiftPreset ? void approveRequestDirect(req.id) : openApproveModal(req)}
                          >
                            Approve
                          </button>
                          <button className="button button-sm button-danger" disabled={loading} onClick={() => void rejectRequest(req.id)}>
                            Reject
                          </button>
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem', fontSize: '0.8rem' }}>
                        <span className="tag">{REQUEST_TYPE_LABEL[req.requestType]}</span>
                        <span className="mono">{new Date(req.requestedDate).toLocaleDateString()}</span>
                        {req.shiftPreset ? <span className="tag brand">{req.shiftPreset.name}</span> : <span style={{ color: 'var(--warning)', fontWeight: 600 }}>Admin must choose</span>}
                      </div>
                      {req.reason ? <div style={{ marginTop: '0.35rem', fontSize: '0.8rem', color: 'var(--muted)' }}>{req.reason}</div> : null}
                    </article>
                  ))}
                </div>
              </section>
            ) : null}

            {/* Resolved shift history */}
            <section className="dash-section">
              <h2 className="dash-section-title">Shift Request History</h2>
              <article className="card">
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Employee</th>
                        <th>Date</th>
                        <th>Type</th>
                        <th>Shift</th>
                        <th>Reason</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resolvedShifts.map(req => (
                        <tr key={req.id}>
                          <td>
                            <div>{req.user.displayName}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>@{req.user.username}</div>
                          </td>
                          <td>{new Date(req.requestedDate).toLocaleDateString()}</td>
                          <td>{REQUEST_TYPE_LABEL[req.requestType]}</td>
                          <td>{req.shiftPreset?.name || '—'}</td>
                          <td>{req.reason || '-'}</td>
                          <td>
                            <span className={`tag ${req.status === 'APPROVED' ? 'ok' : req.status === 'REJECTED' ? 'danger' : ''}`}>
                              {req.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {resolvedShifts.length === 0 ? (
                        <tr><td colSpan={6} className="table-empty">No resolved requests yet</td></tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </article>
            </section>

            {/* Approve modal */}
            {approveTarget ? (
              <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeApproveModal(); }}>
                <div className="modal">
                  <h3>Approve Request</h3>
                  <p style={{ marginBottom: '0.65rem', fontSize: '0.85rem', color: 'var(--muted)' }}>
                    {approveTarget.user.displayName} requested <strong>{REQUEST_TYPE_LABEL[approveTarget.requestType]}</strong> on{' '}
                    <strong>{new Date(approveTarget.requestedDate).toLocaleDateString()}</strong>. Select the concrete shift preset to apply.
                  </p>
                  <label style={{ fontSize: '0.8rem', marginBottom: '0.25rem', display: 'block' }}>Target Shift Preset</label>
                  <select className="select" value={selectedPresetId} onChange={(e) => setSelectedPresetId(e.target.value)}>
                    <option value="">Select preset...</option>
                    {presets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <div className="modal-footer">
                    <button type="button" className="button button-ghost" onClick={closeApproveModal}>Cancel</button>
                    <button type="button" className="button button-primary" disabled={approvingWithPreset} onClick={() => void approveWithSelectedPreset()}>
                      {approvingWithPreset ? 'Approving...' : 'Confirm Approve'}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <>
            {/* ═══ DRIVER TAB ═══ */}

            {/* Driver Availability */}
            <section className="dash-section">
              <h2 className="dash-section-title">Driver Availability</h2>
              {drivers.length === 0 ? (
                <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>No drivers found.</p>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(200px, 100%), 1fr))', gap: '0.5rem' }}>
                  {drivers.map(d => {
                    const status = d.driverStatus || 'OFFLINE';
                    const cfg = DRIVER_AVAIL_CONFIG[status] || DRIVER_AVAIL_CONFIG.OFFLINE;
                    return (
                      <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '0.625rem 0.75rem', background: cfg.bg, borderRadius: 'var(--radius)', border: '1px solid transparent' }}>
                        <span style={{ fontSize: '1.25rem', lineHeight: 1, flexShrink: 0 }}>{cfg.emoji}</span>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.displayName}</div>
                          <div style={{ fontSize: '0.75rem', color: cfg.color, fontWeight: 600 }}>{cfg.label}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Pending driver requests as cards */}
            {pendingDriverReqs.length > 0 ? (
              <section className="dash-section">
                <h2 className="dash-section-title">
                  Pending Driver Requests <span className="dash-badge">{pendingDriverReqs.length}</span>
                </h2>
                <div className="dash-cards">
                  {pendingDriverReqs.map(req => (
                    <article key={req.id} className="card" style={{ padding: '0.75rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{req.user.displayName}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>@{req.user.username}</div>
                        </div>
                        <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
                          <button className="button button-sm button-ok" disabled={loading || driverActionId === req.id} onClick={() => openDriverApproveModal(req)}>Approve</button>
                          <button className="button button-sm button-danger" disabled={loading || driverActionId === req.id} onClick={() => void rejectDriverRequest(req.id)}>Reject</button>
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem', fontSize: '0.8rem' }}>
                        <span className="mono">{new Date(req.requestedDate).toLocaleDateString()}</span>
                        <span className="mono">{req.requestedTime}</span>
                        <span>{req.destination}</span>
                        {req.isRoundTrip ? <span className="tag brand" style={{ fontSize: '0.7rem' }}>Round trip</span> : null}
                      </div>
                      {req.isRoundTrip && (req.returnDate || req.returnTime || req.returnLocation) ? (
                        <div style={{ marginTop: '0.35rem', fontSize: '0.78rem', color: 'var(--muted)' }}>
                          Return: {req.returnDate ? new Date(req.returnDate).toLocaleDateString() : ''} {req.returnTime || ''} {req.returnLocation ? `@ ${req.returnLocation}` : ''}
                        </div>
                      ) : null}
                      {req.contactNumber ? <div style={{ marginTop: '0.15rem', fontSize: '0.78rem', color: 'var(--muted)' }}>Tel: {req.contactNumber}</div> : null}
                      {req.purpose ? <div style={{ marginTop: '0.15rem', fontSize: '0.78rem', color: 'var(--muted)' }}>{req.purpose}</div> : null}
                    </article>
                  ))}
                </div>
              </section>
            ) : null}

            {/* Resolved driver history */}
            <section className="dash-section">
              <h2 className="dash-section-title">Driver Request History</h2>
              <article className="card">
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Employee</th>
                        <th>Date</th>
                        <th>Time</th>
                        <th>Destination</th>
                        <th>Info</th>
                        <th>Status</th>
                        <th>Driver</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resolvedDriverReqs.map(req => (
                        <tr key={req.id}>
                          <td>
                            <div>{req.user.displayName}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>@{req.user.username}</div>
                          </td>
                          <td>{new Date(req.requestedDate).toLocaleDateString()}</td>
                          <td className="mono">{req.requestedTime}</td>
                          <td>{req.destination}</td>
                          <td style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                            {req.isRoundTrip ? (
                              <span style={{ display: 'inline-flex', flexDirection: 'column', gap: '0.15rem' }}>
                                <span className="tag brand" style={{ fontSize: '0.7rem' }}>Round trip</span>
                                {req.returnDate || req.returnTime ? <span>Return: {req.returnDate ? new Date(req.returnDate).toLocaleDateString() : ''} {req.returnTime || ''}</span> : null}
                                {req.returnLocation ? <span>{req.returnLocation}</span> : null}
                              </span>
                            ) : null}
                            {req.contactNumber ? <span style={{ display: 'block' }}>Tel: {req.contactNumber}</span> : null}
                            {req.purpose ? <span style={{ display: 'block' }}>{req.purpose}</span> : null}
                            {!req.isRoundTrip && !req.contactNumber && !req.purpose ? '-' : null}
                          </td>
                          <td>
                            <span className={`tag ${req.status === 'APPROVED' ? 'ok' : req.status === 'REJECTED' ? 'danger' : req.status === 'IN_PROGRESS' ? 'warning' : req.status === 'COMPLETED' ? 'brand' : ''}`}>
                              {DRIVER_STATUS_LABEL[req.status] || req.status}
                            </span>
                          </td>
                          <td>{req.driver?.displayName || '-'}</td>
                        </tr>
                      ))}
                      {resolvedDriverReqs.length === 0 ? (
                        <tr><td colSpan={7} className="table-empty">No resolved driver requests</td></tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </article>
            </section>

            {/* Driver approve modal */}
            {driverApproveTarget ? (
              <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) { setDriverApproveTarget(null); setSelectedDriverId(''); } }}>
                <div className="modal">
                  <h3>Approve &amp; Assign Driver</h3>
                  <p style={{ marginBottom: '0.65rem', fontSize: '0.85rem', color: 'var(--muted)' }}>
                    <strong>{driverApproveTarget.user.displayName}</strong> requested a driver to{' '}
                    <strong>{driverApproveTarget.destination}</strong> on{' '}
                    <strong>{new Date(driverApproveTarget.requestedDate).toLocaleDateString()}</strong> at{' '}
                    <strong>{driverApproveTarget.requestedTime}</strong>.
                    {driverApproveTarget.purpose ? <span> Reason: {driverApproveTarget.purpose}</span> : null}
                    {driverApproveTarget.contactNumber ? <span> | Tel: {driverApproveTarget.contactNumber}</span> : null}
                  </p>
                  {driverApproveTarget.isRoundTrip ? (
                    <div style={{ marginBottom: '0.65rem', padding: '0.5rem 0.75rem', background: 'rgba(99,102,241,0.08)', borderRadius: 'var(--radius)', fontSize: '0.85rem' }}>
                      <strong style={{ color: 'var(--brand)' }}>Round Trip</strong>
                      {driverApproveTarget.returnDate ? <span> | Date: {new Date(driverApproveTarget.returnDate).toLocaleDateString()}</span> : null}
                      {driverApproveTarget.returnTime ? <span> | Time: {driverApproveTarget.returnTime}</span> : null}
                      {driverApproveTarget.returnLocation ? <span> | Pickup: {driverApproveTarget.returnLocation}</span> : null}
                    </div>
                  ) : null}
                  <label style={{ fontSize: '0.8rem', marginBottom: '0.25rem', display: 'block' }}>Assign to Driver</label>
                  <select className="select" value={selectedDriverId} onChange={(e) => setSelectedDriverId(e.target.value)}>
                    <option value="">Select a driver…</option>
                    {drivers.map(d => {
                      const status = d.driverStatus || 'OFFLINE';
                      const cfg = DRIVER_AVAIL_CONFIG[status] || DRIVER_AVAIL_CONFIG.OFFLINE;
                      return <option key={d.id} value={d.id}>{cfg.emoji} {d.displayName} — {cfg.label}</option>;
                    })}
                  </select>
                  <div className="modal-footer">
                    <button type="button" className="button button-ghost" onClick={() => { setDriverApproveTarget(null); setSelectedDriverId(''); }}>Cancel</button>
                    <button type="button" className="button button-primary" disabled={!!driverActionId || !selectedDriverId} onClick={() => void confirmDriverApprove()}>
                      {driverActionId ? 'Approving…' : 'Approve & Assign'}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </AppShell>
  );
}
