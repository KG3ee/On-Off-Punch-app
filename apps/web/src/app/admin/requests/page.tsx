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

const REQUEST_TYPE_LABEL: Record<ShiftRequestType, string> = {
  HALF_DAY_MORNING: 'Half Day - Morning Off',
  HALF_DAY_EVENING: 'Half Day - Afternoon Off',
  FULL_DAY_OFF: 'Full Day Off',
  CUSTOM: 'Custom'
};

export default function AdminRequestsPage() {
  const [requests, setRequests] = useState<ShiftChangeRequest[]>([]);
  const [presets, setPresets] = useState<ShiftPreset[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [approveTarget, setApproveTarget] = useState<ShiftChangeRequest | null>(null);
  const [selectedPresetId, setSelectedPresetId] = useState('');
  const [approvingWithPreset, setApprovingWithPreset] = useState(false);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [requestsData, presetsData] = await Promise.all([
        apiFetch<ShiftChangeRequest[]>('/admin/requests'),
        apiFetch<ShiftPreset[]>('/admin/shift-presets')
      ]);
      setRequests(requestsData);
      setPresets(presetsData);
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

  const pendingCount = useMemo(
    () => requests.filter((request) => request.status === 'PENDING').length,
    [requests]
  );

  return (
    <AppShell title="Shift Requests" subtitle="Approve or reject schedule changes" admin userRole="ADMIN">
      {message ? <div className="alert alert-success">{message}</div> : null}
      {error ? <div className="alert alert-error">{error}</div> : null}

      <div style={{ marginBottom: '0.7rem', color: 'var(--muted)', fontSize: '0.82rem' }}>
        Pending requests: {pendingCount}
      </div>

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
                  No requests found
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
    </AppShell>
  );
}
