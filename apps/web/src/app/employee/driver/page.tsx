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

type DriverStatusKey = 'AVAILABLE' | 'BUSY' | 'ON_BREAK' | 'OFFLINE';

const STATUS_CONFIG: Record<DriverStatusKey, { emoji: string; label: string; desc: string; color: string; bg: string; border: string }> = {
  AVAILABLE: { emoji: '🟢', label: 'Available', desc: 'Ready to drive', color: 'var(--ok)', bg: 'rgba(34,197,94,0.1)', border: 'rgba(34,197,94,0.4)' },
  BUSY:      { emoji: '🟡', label: 'Driving',   desc: 'On a trip now',  color: 'var(--warning)', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.4)' },
  ON_BREAK:  { emoji: '🟠', label: 'On Break',  desc: 'Lunch / rest',   color: '#f97316', bg: 'rgba(249,115,22,0.1)', border: 'rgba(249,115,22,0.4)' },
  OFFLINE:   { emoji: '🔴', label: 'Off Duty',  desc: 'Gone home',      color: 'var(--danger)', bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.4)' },
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
  const [statusPickerOpen, setStatusPickerOpen] = useState(false);
  const [changingStatus, setChangingStatus] = useState(false);

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

      if (meData.role !== 'DRIVER') {
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

  async function changeStatus(newStatus: string) {
    if (!me || newStatus === me.driverStatus) {
      setStatusPickerOpen(false);
      return;
    }
    setChangingStatus(true);
    setError('');
    try {
      await apiFetch('/driver-requests/status', {
        method: 'POST',
        body: JSON.stringify({ status: newStatus })
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update status');
    } finally {
      setChangingStatus(false);
      setStatusPickerOpen(false);
    }
  }

  const inProgress = assignments.filter((r) => r.status === 'IN_PROGRESS');
  const currentStatus = (me?.driverStatus as DriverStatusKey) || 'OFFLINE';
  const cfg = STATUS_CONFIG[currentStatus];

  if (loading) {
    return (
      <AppShell title="Driver" subtitle="…" userRole={me?.role}>
        <p style={{ color: 'var(--muted)' }}>Loading…</p>
      </AppShell>
    );
  }

  if (me?.role !== 'DRIVER') {
    return null;
  }

  return (
    <AppShell
      title="Driver"
      subtitle="Accept and complete approved trips"
      userRole={me?.role}
    >
      {error ? <div className="alert alert-error">{error}</div> : null}
      {message ? <div className="alert alert-success">{message}</div> : null}

      {/* ── Status Banner (25vh, tappable) ── */}
      <button
        type="button"
        onClick={() => setStatusPickerOpen(true)}
        style={{
          width: '100%',
          minHeight: '25vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.5rem',
          background: cfg.bg,
          border: `2px solid ${cfg.border}`,
          borderRadius: 'var(--radius-lg)',
          cursor: 'pointer',
          padding: '1.5rem 1rem',
          marginBottom: '1.5rem',
          transition: 'transform 0.15s, box-shadow 0.15s',
          WebkitTapHighlightColor: 'transparent',
        }}
        onPointerDown={(e) => { (e.currentTarget as HTMLElement).style.transform = 'scale(0.97)'; }}
        onPointerUp={(e) => { (e.currentTarget as HTMLElement).style.transform = ''; }}
        onPointerLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = ''; }}
      >
        <span style={{ fontSize: '3rem', lineHeight: 1 }}>{cfg.emoji}</span>
        <span style={{ fontSize: '1.75rem', fontWeight: 700, color: cfg.color, letterSpacing: '-0.02em' }}>
          {cfg.label}
        </span>
        <span style={{ fontSize: '0.875rem', color: 'var(--muted)', fontWeight: 400 }}>
          {cfg.desc}
        </span>
        <span style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '0.25rem', opacity: 0.7 }}>
          Tap to change status
        </span>
      </button>

      {/* ── Fullscreen Status Picker Overlay ── */}
      {statusPickerOpen ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(0,0,0,0.85)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            display: 'flex',
            flexDirection: 'column',
            padding: '1.5rem',
            gap: '1rem',
            animation: 'driverPickerIn 0.2s ease-out',
          }}
        >
          <div style={{ textAlign: 'center', marginBottom: '0.5rem' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#fff', margin: 0 }}>
              Set Your Status
            </h2>
            <p style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.5)', margin: '0.25rem 0 0' }}>
              Tap one to update
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', flex: 1, justifyContent: 'center' }}>
            {(Object.keys(STATUS_CONFIG) as DriverStatusKey[]).map((key) => {
              const s = STATUS_CONFIG[key];
              const isActive = key === currentStatus;
              return (
                <button
                  key={key}
                  type="button"
                  disabled={changingStatus}
                  onClick={() => void changeStatus(key)}
                  style={{
                    width: '100%',
                    minHeight: '5rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1rem',
                    padding: '1rem 1.25rem',
                    background: isActive ? s.bg : 'rgba(255,255,255,0.05)',
                    border: isActive ? `2px solid ${s.border}` : '2px solid rgba(255,255,255,0.1)',
                    borderRadius: 'var(--radius-lg)',
                    cursor: changingStatus ? 'wait' : 'pointer',
                    transition: 'transform 0.1s, background 0.15s',
                    WebkitTapHighlightColor: 'transparent',
                    opacity: changingStatus ? 0.6 : 1,
                  }}
                  onPointerDown={(e) => { if (!changingStatus) (e.currentTarget as HTMLElement).style.transform = 'scale(0.97)'; }}
                  onPointerUp={(e) => { (e.currentTarget as HTMLElement).style.transform = ''; }}
                  onPointerLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = ''; }}
                >
                  <span style={{ fontSize: '2rem', lineHeight: 1, flexShrink: 0 }}>{s.emoji}</span>
                  <div style={{ textAlign: 'left', flex: 1 }}>
                    <div style={{ fontSize: '1.25rem', fontWeight: 700, color: isActive ? s.color : 'rgba(255,255,255,0.9)' }}>
                      {s.label}
                    </div>
                    <div style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.45)', marginTop: '0.125rem' }}>
                      {s.desc}
                    </div>
                  </div>
                  {isActive ? (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                      <circle cx="12" cy="12" r="11" stroke={s.color} strokeWidth="2" />
                      <path d="M7 12.5l3 3 7-7" stroke={s.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : null}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setStatusPickerOpen(false)}
            style={{
              width: '100%',
              padding: '0.875rem',
              fontSize: '1rem',
              fontWeight: 600,
              color: 'rgba(255,255,255,0.6)',
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 'var(--radius-lg)',
              cursor: 'pointer',
              marginTop: '0.25rem',
            }}
          >
            Cancel
          </button>
        </div>
      ) : null}

      {/* ── Trip Cards ── */}
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
          <h3 style={{ fontSize: '1.125rem', marginBottom: '0.25rem' }}>Upcoming Trips</h3>
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
                No upcoming trips waiting.
              </div>
            ) : null}
          </div>
        </article>
      </div>
    </AppShell>
  );
}
