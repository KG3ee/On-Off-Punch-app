'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { apiFetch } from '@/lib/api';

type ShiftRequestType = 'HALF_DAY_MORNING' | 'HALF_DAY_EVENING' | 'FULL_DAY_OFF' | 'CUSTOM';

type ShiftPreset = {
  id: string;
  name: string;
};

type ShiftChangeRequest = {
  id: string;
  requestType: ShiftRequestType;
  shiftPreset: { id: string; name: string } | null;
  requestedDate: string;
  reason: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
};

const REQUEST_TYPE_OPTIONS: Array<{ value: ShiftRequestType; label: string }> = [
  { value: 'HALF_DAY_MORNING', label: 'Half Day - Morning Off' },
  { value: 'HALF_DAY_EVENING', label: 'Half Day - Afternoon Off' },
  { value: 'FULL_DAY_OFF', label: 'Full Day Off' },
  { value: 'CUSTOM', label: 'Custom (Select Shift Optional)' }
];

const REQUEST_TYPE_LABEL: Record<ShiftRequestType, string> = {
  HALF_DAY_MORNING: 'Half Day - Morning Off',
  HALF_DAY_EVENING: 'Half Day - Afternoon Off',
  FULL_DAY_OFF: 'Full Day Off',
  CUSTOM: 'Custom'
};

export default function EmployeeRequestsPage() {
  const [presets, setPresets] = useState<ShiftPreset[]>([]);
  const [requests, setRequests] = useState<ShiftChangeRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [requestType, setRequestType] = useState<ShiftRequestType>('HALF_DAY_MORNING');
  const [presetId, setPresetId] = useState('');
  const [requestedDate, setRequestedDate] = useState('');
  const [reason, setReason] = useState('');

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [presetsData, requestsData] = await Promise.all([
        apiFetch<ShiftPreset[]>('/shifts/presets'),
        apiFetch<ShiftChangeRequest[]>('/shifts/requests/me')
      ]);
      setPresets(presetsData);
      setRequests(requestsData);
    } catch {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!requestedDate) return;

    setSubmitting(true);
    setError('');
    setSuccess('');

    try {
      const payload: {
        requestType: ShiftRequestType;
        requestedDate: string;
        reason?: string;
        shiftPresetId?: string;
      } = {
        requestType,
        requestedDate
      };

      if (reason.trim()) {
        payload.reason = reason.trim();
      }

      if (requestType === 'CUSTOM' && presetId) {
        payload.shiftPresetId = presetId;
      }

      await apiFetch('/shifts/requests', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      setSuccess('Request submitted successfully');
      setRequestType('HALF_DAY_MORNING');
      setPresetId('');
      setRequestedDate('');
      setReason('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit request');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell title="Schedule Requests" subtitle="Request shift changes or time off">
      {error ? <div className="alert alert-error">{error}</div> : null}
      {success ? <div className="alert alert-success">{success}</div> : null}

      <section className="split">
        <article className="card">
          <h3>New Request</h3>
          <form className="form-grid" onSubmit={(e) => void handleSubmit(e)}>
            <div>
              <label>Date</label>
              <input
                type="date"
                className="input"
                required
                value={requestedDate}
                onChange={(e) => setRequestedDate(e.target.value)}
              />
            </div>

            <div>
              <label>Request Type</label>
              <select
                className="select"
                required
                value={requestType}
                onChange={(e) => {
                  const value = e.target.value as ShiftRequestType;
                  setRequestType(value);
                  if (value !== 'CUSTOM') {
                    setPresetId('');
                  }
                }}
              >
                {REQUEST_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {requestType === 'CUSTOM' ? (
              <div>
                <label>Shift Preset (Optional)</label>
                <select
                  className="select"
                  value={presetId}
                  onChange={(e) => setPresetId(e.target.value)}
                >
                  <option value="">Let admin choose on approval</option>
                  {presets.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <div>
              <label>Reason (Optional)</label>
              <input
                className="input"
                placeholder="e.g. doctor appointment"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>

            <button type="submit" className="button button-primary" disabled={submitting || loading}>
              {submitting ? 'Submitting...' : 'Submit Request'}
            </button>
          </form>
        </article>

        <article className="card">
          <h3>My Requests</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Selected Shift</th>
                  <th>Status</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((req) => (
                  <tr key={req.id}>
                    <td>{new Date(req.requestedDate).toLocaleDateString()}</td>
                    <td>{REQUEST_TYPE_LABEL[req.requestType]}</td>
                    <td>{req.shiftPreset?.name || 'Admin will choose'}</td>
                    <td>
                      <span className={`tag ${req.status === 'APPROVED' ? 'ok' : req.status === 'REJECTED' ? 'danger' : ''}`}>
                        {req.status}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>{req.reason || '-'}</td>
                  </tr>
                ))}
                {requests.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', color: 'var(--muted)' }}>
                      No requests found
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    </AppShell>
  );
}
