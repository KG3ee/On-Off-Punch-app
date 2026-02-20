'use client';

import { useEffect, useMemo, useState } from 'react';
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

export default function AdminRequestsPage() {
  const [tab, setTab] = useState<'shift' | 'driver'>('shift');

  const [requests, setRequests] = useState<ShiftChangeRequest[]>([]);
  const [driverRequests, setDriverRequests] = useState<DriverRequest[]>([]);
  const [presets, setPresets] = useState<ShiftPreset[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [approveTarget, setApproveTarget] = useState<ShiftChangeRequest | null>(null);
  const [selectedPresetId, setSelectedPresetId] = useState('');
  const [approvingWithPreset, setApprovingWithPreset] = useState(false);

  const [driverActionId, setDriverActionId] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [requestsData, presetsData, driverRequestsData] = await Promise.all([
        apiFetch<ShiftChangeRequest[]>('/admin/requests'),
        apiFetch<ShiftPreset[]>('/admin/shift-presets'),
        apiFetch<DriverRequest[]>('/admin/driver-requests')
      ]);
      setRequests(requestsData);
      setPresets(presetsData);
      setDriverRequests(driverRequestsData);
    } catch {
      setError('Failed to load requests');
    } finally {
      setLoading(false);
    }
  }

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

  async function approveDriverRequest(id: string) {
    setDriverActionId(id);
    setError('');
    setMessage('');
    try {
      await apiFetch(`/admin/driver-requests/${id}/approve`, {
        method: 'POST',
        body: JSON.stringify({})
      });
      setMessage('Driver request approved successfully');
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
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Employee</th>
                <th>Date</th>
                <th>Time</th>
                <th>Destination</th>
                <th>Purpose</th>
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
                  <td style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>{req.purpose || '-'}</td>
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
                          onClick={() => void approveDriverRequest(req.id)}
                        >
                          {driverActionId === req.id ? '…' : 'Approve'}
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
      )}
    </AppShell>
  );
}
