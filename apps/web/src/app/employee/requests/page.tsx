'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { apiFetch } from '@/lib/api';
import { MeUser } from '@/types/auth';

type ShiftRequestType = 'HALF_DAY_MORNING' | 'HALF_DAY_EVENING' | 'FULL_DAY_OFF' | 'CUSTOM';

type ShiftChangeRequest = {
  id: string;
  requestType: ShiftRequestType;
  requestedDate: string;
  reason: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
};

type DriverRequest = {
  id: string;
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
  driver: { id: string; displayName: string; username: string } | null;
  user: { id: string; displayName: string; username: string };
};

const REQUEST_TYPE_OPTIONS: Array<{ value: ShiftRequestType; label: string }> = [
  { value: 'HALF_DAY_MORNING', label: 'Half Day - Morning Off' },
  { value: 'HALF_DAY_EVENING', label: 'Half Day - Afternoon Off' },
  { value: 'FULL_DAY_OFF', label: 'Full Day Off' },
];

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

export default function EmployeeRequestsPage() {
  const router = useRouter();
  const [me, setMe] = useState<MeUser | null>(null);
  const [tab, setTab] = useState<'shift' | 'driver'>('shift');

  const [requests, setRequests] = useState<ShiftChangeRequest[]>([]);
  const [driverRequests, setDriverRequests] = useState<DriverRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [requestType, setRequestType] = useState<ShiftRequestType>('HALF_DAY_MORNING');
  const [requestedDate, setRequestedDate] = useState('');
  const [reason, setReason] = useState('');

  const [driverRequestedDate, setDriverRequestedDate] = useState('');
  const [driverRequestedTime, setDriverRequestedTime] = useState('');
  const [destination, setDestination] = useState('');
  const [purpose, setPurpose] = useState('');
  const [roundTrip, setRoundTrip] = useState(false);
  const [returnDate, setReturnDate] = useState('');
  const [returnTime, setReturnTime] = useState('');
  const [returnLocation, setReturnLocation] = useState('');
  const [contactNumber, setContactNumber] = useState('');

  useEffect(() => {
    void apiFetch<MeUser>('/me').then((data) => {
      if (data.role === 'DRIVER') {
        router.replace('/employee/driver');
      } else {
        setMe(data);
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [requestsData, driverRequestsData] = await Promise.all([
        apiFetch<ShiftChangeRequest[]>('/shifts/requests/me'),
        apiFetch<DriverRequest[]>('/driver-requests/me'),
      ]);
      setRequests(requestsData);
      setDriverRequests(driverRequestsData);
    } catch {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  }

  async function handleShiftSubmit(e: FormEvent) {
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

      await apiFetch('/shifts/requests', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      setSuccess('Day off request submitted successfully');
      setRequestType('HALF_DAY_MORNING');
      setRequestedDate('');
      setReason('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit request');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDriverSubmit(e: FormEvent) {
    e.preventDefault();
    if (!driverRequestedDate || !driverRequestedTime || !destination.trim()) return;

    setSubmitting(true);
    setError('');
    setSuccess('');

    try {
      await apiFetch('/driver-requests', {
        method: 'POST',
        body: JSON.stringify({
          requestedDate: driverRequestedDate,
          requestedTime: driverRequestedTime,
          destination: destination.trim(),
          purpose: purpose.trim() || undefined,
          isRoundTrip: roundTrip,
          returnDate: roundTrip && returnDate ? returnDate : undefined,
          returnTime: roundTrip && returnTime ? returnTime : undefined,
          returnLocation: roundTrip && returnLocation.trim() ? returnLocation.trim() : undefined,
          contactNumber: contactNumber.trim() || undefined,
        })
      });

      setSuccess('Driver request submitted successfully');
      setDriverRequestedDate('');
      setDriverRequestedTime('');
      setDestination('');
      setPurpose('');
      setRoundTrip(false);
      setReturnDate('');
      setReturnTime('');
      setReturnLocation('');
      setContactNumber('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit driver request');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell
      title="Schedule Requests"
      subtitle="Request day off or driver service"
      userRole={me?.role}
    >
      {error ? <div className="alert alert-error">{error}</div> : null}
      {success ? <div className="alert alert-success">{success}</div> : null}

      <div className="toolbar" style={{ marginBottom: '0.75rem' }}>
        <nav className="nav">
          <a
            className={tab === 'shift' ? 'active' : ''}
            onClick={() => setTab('shift')}
            style={{ cursor: 'pointer' }}
          >
            Day Off Requests
          </a>
          <a
            className={tab === 'driver' ? 'active' : ''}
            onClick={() => setTab('driver')}
            style={{ cursor: 'pointer' }}
          >
            Driver Requests
          </a>
        </nav>
      </div>

      {tab === 'shift' ? (
        <section className="split">
          <article className="card">
            <h3>New Day Off Request</h3>
            <form className="form-grid" onSubmit={(e) => void handleShiftSubmit(e)}>
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
                  onChange={(e) => setRequestType(e.target.value as ShiftRequestType)}
                >
                  {REQUEST_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

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
            <h3>My Day Off Requests</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((req) => (
                    <tr key={req.id}>
                      <td>{new Date(req.requestedDate).toLocaleDateString()}</td>
                      <td>{REQUEST_TYPE_LABEL[req.requestType]}</td>
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
                      <td colSpan={4} style={{ textAlign: 'center', color: 'var(--muted)' }}>
                        No day off requests found
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </article>
        </section>
      ) : (
        <section className="split">
          <article className="card">
            <h3>New Driver Request</h3>
            <form className="form-grid" onSubmit={(e) => void handleDriverSubmit(e)}>
              <div>
                <label>Date</label>
                <input
                  type="date"
                  className="input"
                  required
                  value={driverRequestedDate}
                  onChange={(e) => setDriverRequestedDate(e.target.value)}
                />
              </div>
              <div>
                <label>Time</label>
                <input
                  type="time"
                  className="input"
                  required
                  value={driverRequestedTime}
                  onChange={(e) => setDriverRequestedTime(e.target.value)}
                />
              </div>
              <div>
                <label>Destination</label>
                <input
                  className="input"
                  placeholder="e.g. Airport, Office"
                  required
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                />
              </div>
              <div>
                <label>Purpose (Optional)</label>
                <input
                  className="input"
                  placeholder="e.g. client meeting"
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                />
              </div>
              <div>
                <label>Contact Number (Optional)</label>
                <input
                  className="input"
                  placeholder="e.g. 050-123-4567"
                  value={contactNumber}
                  onChange={(e) => setContactNumber(e.target.value)}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="checkbox"
                  id="roundTrip"
                  checked={roundTrip}
                  onChange={(e) => setRoundTrip(e.target.checked)}
                  style={{ width: 'auto', margin: 0 }}
                />
                <label htmlFor="roundTrip" style={{ marginBottom: 0 }}>Round trip (need return pickup)</label>
              </div>
              {roundTrip ? (
                <>
                  <div>
                    <label>Return Pickup Date</label>
                    <input
                      type="date"
                      className="input"
                      value={returnDate}
                      onChange={(e) => setReturnDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <label>Return Pickup Time</label>
                    <input
                      type="time"
                      className="input"
                      value={returnTime}
                      onChange={(e) => setReturnTime(e.target.value)}
                    />
                  </div>
                  <div>
                    <label>Return Pickup Location</label>
                    <input
                      className="input"
                      placeholder="e.g. Hospital main entrance"
                      value={returnLocation}
                      onChange={(e) => setReturnLocation(e.target.value)}
                    />
                  </div>
                </>
              ) : null}
              <button type="submit" className="button button-primary" disabled={submitting || loading}>
                {submitting ? 'Submitting...' : 'Submit Driver Request'}
              </button>
            </form>
          </article>

          <article className="card">
            <h3>My Driver Requests</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Time</th>
                    <th>Destination</th>
                    <th>Info</th>
                    <th>Status</th>
                    <th>Driver</th>
                  </tr>
                </thead>
                <tbody>
                  {driverRequests.map((req) => (
                    <tr key={req.id}>
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
                    </tr>
                  ))}
                  {driverRequests.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', color: 'var(--muted)' }}>
                        No driver requests found
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </article>
        </section>
      )}
    </AppShell>
  );
}
