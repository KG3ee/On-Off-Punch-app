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

      if (!meData.isDriver && meData.role !== 'DRIVER') {
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

  if (!me?.isDriver && me?.role !== 'DRIVER') {
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

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem', background: 'var(--surface)', padding: '1rem', borderRadius: 'var(--radius-lg)' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', margin: 0, marginBottom: '0.25rem' }}>Driver Status</h2>
          <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.875rem' }}>
            Current status: <strong style={{ color: me.driverStatus === 'AVAILABLE' ? 'var(--ok)' : me.driverStatus === 'BUSY' ? 'var(--warn)' : 'var(--muted)' }}>{me.driverStatus}</strong>
          </p>
        </div>
        <button
          className={`button ${me.driverStatus === 'AVAILABLE' ? 'button-danger' : 'button-ok'}`}
          style={{ width: '100%', padding: '0.75rem', fontSize: '1rem', height: 'auto' }}
          onClick={() => void toggleStatus()}
          disabled={me.driverStatus === 'BUSY'}
        >
          {me.driverStatus === 'AVAILABLE' ? 'Go Offline' : 'Go Available'}
        </button>
      </div>

      <div style={{ display: 'grid', gap: '1.5rem' }}>
        <article className="card" style={{ padding: '1rem' }}>
          <h3 style={{ fontSize: '1.125rem', marginBottom: '0.25rem' }}>My Active Trips</h3>
          <p style={{ fontSize: '0.875rem', color: 'var(--muted)', marginBottom: '1rem' }}>
            Trips you have accepted. Complete them when done.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {inProgress.map((req) => (
              <div key={req.id} style={{ border: '1px solid var(--line)', borderRadius: 'var(--radius)', padding: '0.875rem', background: 'var(--card-solid)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                  <div style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--ink)' }}>{req.destination}</div>
                  <div className="tag brand" style={{ fontSize: '0.75rem' }}>{req.requestedTime}</div>
                </div>
                <div style={{ fontSize: '0.875rem', color: 'var(--ink-2)', marginBottom: '0.25rem' }}>
                  <strong>Passenger:</strong> {req.user.displayName} <span style={{ color: 'var(--muted)' }}>(@{req.user.username})</span>
                </div>
                <div style={{ fontSize: '0.875rem', color: 'var(--muted)', marginBottom: '1rem' }}>
                  <strong>Date:</strong> {new Date(req.requestedDate).toLocaleDateString()}
                  {req.purpose ? <div style={{ marginTop: '0.25rem' }}><strong>Note:</strong> {req.purpose}</div> : null}
                </div>
                <button
                  className="button button-primary"
                  style={{ width: '100%', padding: '0.75rem', fontSize: '1rem', height: 'auto', fontWeight: 600 }}
                  disabled={!!actionId}
                  onClick={() => void completeRequest(req.id)}
                >
                  {actionId === req.id ? 'Completing…' : 'Complete Trip'}
                </button>
              </div>
            ))}
            {inProgress.length === 0 ? (
              <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--muted)', background: 'var(--surface)', borderRadius: 'var(--radius)', fontSize: '0.875rem' }}>
                No active trips right now.
              </div>
            ) : null}
          </div>
        </article>

        <article className="card" style={{ padding: '1rem' }}>
          <h3 style={{ fontSize: '1.125rem', marginBottom: '0.25rem' }}>Available Trips</h3>
          <p style={{ fontSize: '0.875rem', color: 'var(--muted)', marginBottom: '1rem' }}>
            Approved requests waiting for a driver.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {available.map((req) => (
              <div key={req.id} style={{ border: '1px solid var(--line)', borderRadius: 'var(--radius)', padding: '0.875rem', background: 'var(--card-solid)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                  <div style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--ink)' }}>{req.destination}</div>
                  <div className="tag ok" style={{ fontSize: '0.75rem' }}>{req.requestedTime}</div>
                </div>
                <div style={{ fontSize: '0.875rem', color: 'var(--ink-2)', marginBottom: '0.25rem' }}>
                  <strong>Passenger:</strong> {req.user.displayName} <span style={{ color: 'var(--muted)' }}>(@{req.user.username})</span>
                </div>
                <div style={{ fontSize: '0.875rem', color: 'var(--muted)', marginBottom: '1rem' }}>
                  <strong>Date:</strong> {new Date(req.requestedDate).toLocaleDateString()}
                  {req.purpose ? <div style={{ marginTop: '0.25rem' }}><strong>Note:</strong> {req.purpose}</div> : null}
                </div>
                <button
                  className="button button-ok"
                  style={{ width: '100%', padding: '0.75rem', fontSize: '1rem', height: 'auto', fontWeight: 600 }}
                  disabled={!!actionId}
                  onClick={() => void acceptRequest(req.id)}
                >
                  {actionId === req.id ? 'Accepting…' : 'Accept Trip'}
                </button>
              </div>
            ))}
            {available.length === 0 ? (
              <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--muted)', background: 'var(--surface)', borderRadius: 'var(--radius)', fontSize: '0.875rem' }}>
                No available trips waiting.
              </div>
            ) : null}
          </div>
        </article>
      </div>
    </AppShell>
  );
}
