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

  const [approveTarget, setApproveTarget] = useState<ShiftChangeRequest | null>(null);
  const [selectedPresetId, setSelectedPresetId] = useState('');
  const [approvingWithPreset, setApprovingWithPreset] = useState(false);

  const [driverActionId, setDriverActionId] = useState<string | null>(null);
  const [driverApproveTarget, setDriverApproveTarget] = useState<DriverRequest | null>(null);
  const [selectedDriverId, setSelectedDriverId] = useState('');

  const silentRef = useRef(false);

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
    setError('');
    setMessage('');
    try {
      await apiFetch(`/admin/requests/${id}/reject`, { method: 'POST' });
      setMessage('Request rejected successfully');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject request');
    }
  }

  async function approveRequestDirect(id: string) {
    setError('');
    setMessage('');
    try {
      await apiFetch(`/admin/requests/${id}/approve`, { method: 'POST', body: JSON.stringify({}) });
      setMessage('Request approved successfully');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve request');
    }
  }

  function openApproveModal(request: ShiftChangeRequest) {
    setApproveTarget(request);
    setSelectedPresetId(presets[0]?.id || '');
    setError('');
    setMessage('');
  }

  function closeApproveModal() {
    setApproveTarget(null);
    setSelectedPresetId('');
    setApprovingWithPreset(false);
  }

  async function approveWithSelectedPreset() {
    if (!approveTarget) return;
    if (!selectedPresetId) {
      setError('Please select a shift preset to approve this request');
      return;
    }

    setApprovingWithPreset(true);
    setError('');
    setMessage('');
    try {
      await apiFetch(`/admin/requests/${approveTarget.id}/approve`, {
        method: 'POST',
        body: JSON.stringify({ targetPresetId: selectedPresetId })
      });
      setMessage('Request approved successfully');
      closeApproveModal();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve request');
      setApprovingWithPreset(false);
    }
  }

  function openDriverApproveModal(req: DriverRequest) {
    setDriverApproveTarget(req);
    setSelectedDriverId(drivers[0]?.id || '');
    setError('');
    setMessage('');
  }

  async function confirmDriverApprove() {
    if (!driverApproveTarget) return;
    if (!selectedDriverId) {
      setError('Please select a driver to assign');
      return;
    }
    setDriverActionId(driverApproveTarget.id);
    setError('');
    setMessage('');
    try {
      await apiFetch(`/admin/driver-requests/${driverApproveTarget.id}/approve`, {
        method: 'POST',
        body: JSON.stringify({ driverId: selectedDriverId })
      });
      setMessage('Driver request approved and assigned');
      setDriverApproveTarget(null);
      setSelectedDriverId('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve driver request');
    } finally {
      setDriverActionId(null);
    }
  }

  async function rejectDriverRequest(id: string) {
    setDriverActionId(id);
    setError('');
    setMessage('');
    try {
      await apiFetch(`/admin/driver-requests/${id}/reject`, {
        method: 'POST',
        body: JSON.stringify({})
      });
      setMessage('Driver request rejected successfully');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject driver request');
    } finally {
      setDriverActionId(null);
    }
  }

  const shiftPendingCount = useMemo(
    () => requests.filter((r) => r.status === 'PENDING').length,
    [requests]
  );
  const driverPendingCount = useMemo(
    () => driverRequests.filter((r) => r.status === 'PENDING').length,
    [driverRequests]
  );

  return (
    <AppShell title="Requests" subtitle="Approve or reject shift and driver requests" admin userRole="ADMIN">
      {message ? <div className="alert alert-success">{message}</div> : null}
      {error ? <div className="alert alert-error">{error}</div> : null}

      <div className="toolbar" style={{ marginBottom: '0.75rem' }}>
        <nav className="nav">
          <a
            className={tab === 'shift' ? 'active' : ''}
            onClick={() => setTab('shift')}
            style={{ cursor: 'pointer' }}
          >
            Shift Requests ({shiftPendingCount} pending)
          </a>
          <a
            className={tab === 'driver' ? 'active' : ''}
            onClick={() => setTab('driver')}
            style={{ cursor: 'pointer' }}
          >
            Driver Requests ({driverPendingCount} pending)
          </a>
        </nav>
      </div>

      {tab === 'shift' ? (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Selected Shift</th>
                  <th>Reason</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((req) => (
                  <tr key={req.id}>
                    <td>
                      <div>{req.user.displayName}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>@{req.user.username}</div>
                    </td>
                    <td>{new Date(req.requestedDate).toLocaleDateString()}</td>
                    <td>{REQUEST_TYPE_LABEL[req.requestType]}</td>
                    <td>{req.shiftPreset?.name || 'Admin must choose'}</td>
                    <td>{req.reason || '-'}</td>
                    <td>
                      <span className={`tag ${req.status === 'APPROVED' ? 'ok' : req.status === 'REJECTED' ? 'danger' : ''}`}>
                        {req.status}
                      </span>
                    </td>
                    <td>
                      {req.status === 'PENDING' ? (
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button
                            className="button button-sm button-ok"
                            disabled={loading}
                            onClick={() =>
                              req.shiftPreset
                                ? void approveRequestDirect(req.id)
                                : openApproveModal(req)
                            }
                          >
                            Approve
                          </button>
                          <button
                            className="button button-sm button-danger"
                            disabled={loading}
                            onClick={() => void rejectRequest(req.id)}
                          >
                            Reject
                          </button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
                {requests.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', color: 'var(--muted)' }}>
                      No shift requests found
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          {approveTarget ? (
            <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeApproveModal(); }}>
              <div className="modal">
                <h3>Approve Request</h3>
                <p style={{ marginBottom: '0.65rem', fontSize: '0.85rem', color: 'var(--muted)' }}>
                  {approveTarget.user.displayName} requested <strong>{REQUEST_TYPE_LABEL[approveTarget.requestType]}</strong> on{' '}
                  <strong>{new Date(approveTarget.requestedDate).toLocaleDateString()}</strong>. Select the concrete shift preset to apply.
                </p>
                <label style={{ fontSize: '0.8rem', marginBottom: '0.25rem', display: 'block' }}>Target Shift Preset</label>
                <select
                  className="select"
                  value={selectedPresetId}
                  onChange={(e) => setSelectedPresetId(e.target.value)}
                >
                  <option value="">Select preset...</option>
                  {presets.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.name}
                    </option>
                  ))}
                </select>
                <div className="modal-footer">
                  <button type="button" className="button button-ghost" onClick={closeApproveModal}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="button button-primary"
                    disabled={approvingWithPreset}
                    onClick={() => void approveWithSelectedPreset()}
                  >
                    {approvingWithPreset ? 'Approving...' : 'Confirm Approve'}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <>
        {/* ── Driver Availability Panel ── */}
        <article className="card" style={{ padding: '1rem', marginBottom: '1rem' }}>
          <h3 style={{ fontSize: '0.9375rem', marginBottom: '0.75rem', fontWeight: 600 }}>Driver Availability</h3>
          {drivers.length === 0 ? (
            <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>No users with DRIVER role found.</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.5rem' }}>
              {drivers.map((d) => {
                const status = d.driverStatus || 'OFFLINE';
                const cfg = DRIVER_AVAIL_CONFIG[status] || DRIVER_AVAIL_CONFIG.OFFLINE;
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
                      border: '1px solid transparent',
                    }}
                  >
                    <span style={{ fontSize: '1.25rem', lineHeight: 1, flexShrink: 0 }}>{cfg.emoji}</span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
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
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {driverRequests.map((req) => (
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
                        {req.returnDate || req.returnTime ? (
                          <span>Return: {req.returnDate ? new Date(req.returnDate).toLocaleDateString() : ''} {req.returnTime || ''}</span>
                        ) : null}
                        {req.returnLocation ? <span>{req.returnLocation}</span> : null}
                      </span>
                    ) : null}
                    {req.contactNumber ? <span style={{ display: 'block' }}>Tel: {req.contactNumber}</span> : null}
                    {req.purpose ? <span style={{ display: 'block' }}>{req.purpose}</span> : null}
                    {!req.isRoundTrip && !req.contactNumber && !req.purpose ? '-' : null}
                  </td>
                  <td>
                    <span
                      className={`tag ${
                        req.status === 'APPROVED'
                          ? 'ok'
                          : req.status === 'REJECTED'
                            ? 'danger'
                            : req.status === 'IN_PROGRESS'
                              ? 'warning'
                              : req.status === 'COMPLETED'
                                ? 'brand'
                                : ''
                      }`}
                    >
                      {DRIVER_STATUS_LABEL[req.status] || req.status}
                    </span>
                  </td>
                  <td>{req.driver?.displayName || '-'}</td>
                  <td>
                    {req.status === 'PENDING' ? (
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          className="button button-sm button-ok"
                          disabled={loading || driverActionId === req.id}
                          onClick={() => openDriverApproveModal(req)}
                        >
                          Approve
                        </button>
                        <button
                          className="button button-sm button-danger"
                          disabled={loading || driverActionId === req.id}
                          onClick={() => void rejectDriverRequest(req.id)}
                        >
                          Reject
                        </button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
              {driverRequests.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', color: 'var(--muted)' }}>
                    No driver requests found
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

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
              <select
                className="select"
                value={selectedDriverId}
                onChange={(e) => setSelectedDriverId(e.target.value)}
              >
                <option value="">Select a driver…</option>
                {drivers.map((d) => {
                  const status = d.driverStatus || 'OFFLINE';
                  const statusCfg = DRIVER_AVAIL_CONFIG[status] || DRIVER_AVAIL_CONFIG.OFFLINE;
                  return (
                    <option key={d.id} value={d.id}>
                      {statusCfg.emoji} {d.displayName} — {statusCfg.label}
                    </option>
                  );
                })}
              </select>
              <div className="modal-footer">
                <button type="button" className="button button-ghost" onClick={() => { setDriverApproveTarget(null); setSelectedDriverId(''); }}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="button button-primary"
                  disabled={!!driverActionId || !selectedDriverId}
                  onClick={() => void confirmDriverApprove()}
                >
                  {driverActionId ? 'Approving…' : 'Approve & Assign'}
                </button>
              </div>
            </div>
          </div>
        ) : null}
        </>
      )}
    </AppShell>
  );
}
