'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { apiFetch } from '@/lib/api';
import { MeUser } from '@/types/auth';

type DriverRequest = {
  id: string;
  requestedDate: string;
  requestedTime: string;
  destination: string;
  purpose: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'IN_PROGRESS' | 'COMPLETED';
  user: { id: string; displayName: string; username: string };
  driver: { id: string; displayName: string; username: string } | null;
};

export default function DriverDashboardPage() {
  const router = useRouter();
  const [me, setMe] = useState<MeUser | null>(null);
  const [available, setAvailable] = useState<DriverRequest[]>([]);
  const [assignments, setAssignments] = useState<DriverRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [actionId, setActionId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [meData, availableData, assignmentsData] = await Promise.all([
        apiFetch<MeUser>('/me'),
        apiFetch<DriverRequest[]>('/driver-requests/available'),
        apiFetch<DriverRequest[]>('/driver-requests/my-assignments')
      ]);
      setMe(meData);
      setAvailable(availableData);
      setAssignments(assignmentsData);

      if (!meData.isDriver) {
        router.replace('/employee/dashboard');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load driver data');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function acceptRequest(id: string) {
    setActionId(id);
    setError('');
    setMessage('');
    try {
      await apiFetch(`/driver-requests/${id}/accept`, { method: 'POST' });
      setMessage('Trip accepted successfully');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept trip');
    } finally {
      setActionId(null);
    }
  }

  async function completeRequest(id: string) {
    setActionId(id);
    setError('');
    setMessage('');
    try {
      await apiFetch(`/driver-requests/${id}/complete`, { method: 'POST' });
      setMessage('Trip completed successfully');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete trip');
    } finally {
      setActionId(null);
    }
  }

  async function toggleStatus() {
    if (!me) return;
    const newStatus = me.driverStatus === 'AVAILABLE' ? 'OFFLINE' : 'AVAILABLE';
    setError('');
    try {
      await apiFetch('/driver-requests/status', {
        method: 'POST',
        body: JSON.stringify({ status: newStatus })
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update status');
    }
  }

  const inProgress = assignments.filter((r) => r.status === 'IN_PROGRESS');

  if (loading) {
    return (
      <AppShell title="Driver" subtitle="…" userRole={me?.role} isDriver={me?.isDriver}>
        <p style={{ color: 'var(--muted)' }}>Loading…</p>
      </AppShell>
    );
  }

  if (!me?.isDriver) {
    return null;
  }

  return (
    <AppShell
      title="Driver"
      subtitle="Accept and complete approved trips"
      userRole={me?.role}
      isDriver={me?.isDriver}
    >
      {error ? <div className="alert alert-error">{error}</div> : null}
      {message ? <div className="alert alert-success">{message}</div> : null}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', background: 'var(--surface)', padding: '1rem', borderRadius: 'var(--radius-lg)' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', margin: 0 }}>Driver Status</h2>
          <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.875rem' }}>
            Current status: <strong style={{ color: me.driverStatus === 'AVAILABLE' ? 'var(--ok)' : me.driverStatus === 'BUSY' ? 'var(--warn)' : 'var(--muted)' }}>{me.driverStatus}</strong>
          </p>
        </div>
        <button
          className={`button ${me.driverStatus === 'AVAILABLE' ? 'button-danger' : 'button-ok'}`}
          onClick={() => void toggleStatus()}
          disabled={me.driverStatus === 'BUSY'}
        >
          {me.driverStatus === 'AVAILABLE' ? 'Go Offline' : 'Go Available'}
        </button>
      </div>

      <section className="split">
        <article className="card">
          <h3>Available Trips</h3>
          <p style={{ fontSize: '0.8125rem', color: 'var(--muted)', marginBottom: '0.75rem' }}>
            Approved requests waiting for a driver. Click Accept to take the trip.
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Time</th>
                  <th>Destination</th>
                  <th>Requester</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {available.map((req) => (
                  <tr key={req.id}>
                    <td>{new Date(req.requestedDate).toLocaleDateString()}</td>
                    <td className="mono">{req.requestedTime}</td>
                    <td>{req.destination}</td>
                    <td>
                      <div>{req.user.displayName}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>@{req.user.username}</div>
                    </td>
                    <td>
                      <button
                        className="button button-sm button-ok"
                        disabled={!!actionId}
                        onClick={() => void acceptRequest(req.id)}
                      >
                        {actionId === req.id ? '…' : 'Accept'}
                      </button>
                    </td>
                  </tr>
                ))}
                {available.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', color: 'var(--muted)' }}>
                      No available trips
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </article>

        <article className="card">
          <h3>My Active Trips</h3>
          <p style={{ fontSize: '0.8125rem', color: 'var(--muted)', marginBottom: '0.75rem' }}>
            Trips you have accepted. Click Complete when done.
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Time</th>
                  <th>Destination</th>
                  <th>Requester</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {inProgress.map((req) => (
                  <tr key={req.id}>
                    <td>{new Date(req.requestedDate).toLocaleDateString()}</td>
                    <td className="mono">{req.requestedTime}</td>
                    <td>{req.destination}</td>
                    <td>
                      <div>{req.user.displayName}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>@{req.user.username}</div>
                    </td>
                    <td>
                      <button
                        className="button button-sm button-primary"
                        disabled={!!actionId}
                        onClick={() => void completeRequest(req.id)}
                      >
                        {actionId === req.id ? '…' : 'Complete'}
                      </button>
                    </td>
                  </tr>
                ))}
                {inProgress.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', color: 'var(--muted)' }}>
                      No active trips
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
