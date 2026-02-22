'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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
  isRoundTrip: boolean;
  returnDate: string | null;
  returnTime: string | null;
  returnLocation: string | null;
  contactNumber: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'IN_PROGRESS' | 'COMPLETED';
  user: { id: string; displayName: string; username: string };
  driver: { id: string; displayName: string; username: string } | null;
};

type DriverStatusKey = 'AVAILABLE' | 'BUSY' | 'ON_BREAK' | 'OFFLINE';

const STATUS_CONFIG: Record<DriverStatusKey, { emoji: string; label: string; desc: string; color: string; bg: string; border: string }> = {
  AVAILABLE: { emoji: '🚗', label: 'Available', desc: 'Ready to drive', color: 'var(--ok)', bg: 'rgba(34,197,94,0.1)', border: 'rgba(34,197,94,0.4)' },
  BUSY:      { emoji: '🏎️', label: 'Driving',   desc: 'On a trip now',  color: 'var(--warning)', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.4)' },
  ON_BREAK:  { emoji: '☕', label: 'On Break',  desc: 'Lunch / rest',   color: '#f97316', bg: 'rgba(249,115,22,0.1)', border: 'rgba(249,115,22,0.4)' },
  OFFLINE:   { emoji: '🏠', label: 'Off Duty',  desc: 'Gone home',      color: 'var(--danger)', bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.4)' },
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
  const [tripsExpanded, setTripsExpanded] = useState(false);
  const [confirmAcceptId, setConfirmAcceptId] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) { setLoading(true); setError(''); }
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
      if (!silent) setError(err instanceof Error ? err.message : 'Failed to load driver data');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      if (!document.hidden) {
        void load(true);
      }
    }, 15_000);
    return () => clearInterval(timer);
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

  const prevAvailCountRef = useRef(0);
  const [notifPulse, setNotifPulse] = useState(false);
  const availableSectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (available.length > prevAvailCountRef.current && prevAvailCountRef.current >= 0) {
      setNotifPulse(true);
      const t = setTimeout(() => setNotifPulse(false), 2000);
      return () => clearTimeout(t);
    }
  }, [available.length]);

  useEffect(() => {
    prevAvailCountRef.current = available.length;
  }, [available.length]);

  const driverHeaderAction = (
    <button
      type="button"
      className="button button-ghost button-sm"
      style={{ position: 'relative', fontSize: '1.1rem', padding: '0.25rem 0.5rem' }}
      title={`${available.length} trip${available.length !== 1 ? 's' : ''} available`}
      onClick={() => availableSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
      {available.length > 0 && (
        <span style={{
          position: 'absolute', top: -2, right: -2,
          background: 'var(--danger)', color: '#fff',
          fontSize: '0.6rem', fontWeight: 700,
          minWidth: '16px', height: '16px',
          borderRadius: '8px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '0 4px', lineHeight: 1,
          animation: notifPulse ? 'notifPulse 0.4s ease 3' : undefined,
        }}>
          {available.length}
        </span>
      )}
    </button>
  );

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
      headerAction={driverHeaderAction}
    >
      {error ? <div className="alert alert-error">{error}</div> : null}
      {message ? <div className="alert alert-success">{message}</div> : null}

      {/* ── Status Banner (25vh, tappable) ── */}
      <button
        type="button"
        onClick={() => setStatusPickerOpen(true)}
        style={{
          width: '100%',
          height: '25vh',
          minHeight: '7rem',
          display: 'flex',
          alignItems: 'center',
          gap: '1.5rem',
          background: cfg.bg,
          border: `2px solid ${cfg.border}`,
          borderRadius: 'var(--radius-lg)',
          cursor: 'pointer',
          padding: '1.25rem 1.75rem',
          marginBottom: '1.25rem',
          transition: 'transform 0.15s',
          WebkitTapHighlightColor: 'transparent',
        }}
        onPointerDown={(e) => { (e.currentTarget as HTMLElement).style.transform = 'scale(0.97)'; }}
        onPointerUp={(e) => { (e.currentTarget as HTMLElement).style.transform = ''; }}
        onPointerLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = ''; }}
      >
        <span style={{ fontSize: '4rem', lineHeight: 1, flexShrink: 0 }}>{cfg.emoji}</span>
        <div style={{ textAlign: 'left', flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '2.25rem', fontWeight: 700, color: cfg.color, letterSpacing: '-0.03em' }}>
            {cfg.label}
          </div>
          <div style={{ fontSize: '1.125rem', color: 'var(--muted)', marginTop: '0.25rem', fontWeight: 500 }}>
            {cfg.desc}
          </div>
          <div style={{ fontSize: '0.8125rem', color: 'var(--muted)', marginTop: '0.5rem', opacity: 0.5, fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase' as const }}>
            Tap to change
          </div>
        </div>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, opacity: 0.35 }}>
          <path d="M6 9l6 6 6-6" stroke={cfg.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
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
            padding: '1rem 1rem env(safe-area-inset-bottom, 1rem)',
            gap: '0.75rem',
            animation: 'driverPickerIn 0.2s ease-out',
          }}
        >
          <div style={{ textAlign: 'center', flexShrink: 0 }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#fff', margin: 0, letterSpacing: '-0.02em' }}>
              Set Your Status
            </h2>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', flex: 1 }}>
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
                    height: '15vh',
                    minHeight: '5rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1.25rem',
                    padding: '1rem 1.5rem',
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
                  <span style={{ fontSize: '2.5rem', lineHeight: 1, flexShrink: 0 }}>{s.emoji}</span>
                  <div style={{ textAlign: 'left', flex: 1 }}>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: isActive ? s.color : 'rgba(255,255,255,0.9)', letterSpacing: '-0.02em' }}>
                      {s.label}
                    </div>
                    <div style={{ fontSize: '0.9375rem', color: 'rgba(255,255,255,0.45)', marginTop: '0.125rem', fontWeight: 500 }}>
                      {s.desc}
                    </div>
                  </div>
                  {isActive ? (
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
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
              padding: '0.75rem',
              fontSize: '1rem',
              fontWeight: 600,
              color: 'rgba(255,255,255,0.5)',
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 'var(--radius-lg)',
              cursor: 'pointer',
              flexShrink: 0,
              letterSpacing: '-0.01em',
            }}
          >
            Cancel
          </button>
        </div>
      ) : null}

      {/* ── Trip Cards (Upcoming first, then Active) ── */}
      <div style={{ display: 'grid', gap: '1.25rem' }}>
        <article className="card" ref={availableSectionRef} style={{ padding: 0, overflow: 'hidden' }}>
          {/* Collapsible header */}
          <button
            type="button"
            onClick={() => { setTripsExpanded(!tripsExpanded); setConfirmAcceptId(null); }}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '1.25rem 1.5rem',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <h3 style={{ fontSize: '1.375rem', fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>Upcoming Trips</h3>
              {available.length > 0 ? (
                <span style={{
                  background: 'var(--ok)',
                  color: '#fff',
                  fontSize: '0.875rem',
                  fontWeight: 700,
                  borderRadius: '999px',
                  padding: '0.125rem 0.625rem',
                  minWidth: '1.5rem',
                  textAlign: 'center',
                }}>
                  {available.length}
                </span>
              ) : null}
            </div>
            <svg
              width="28" height="28" viewBox="0 0 24 24" fill="none"
              style={{ flexShrink: 0, transition: 'transform 0.2s', transform: tripsExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
            >
              <path d="M6 9l6 6 6-6" stroke="var(--muted)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {/* Expandable content */}
          {tripsExpanded ? (
            <div style={{ padding: '0 1.25rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
              <p style={{ fontSize: '1rem', color: 'var(--muted)', margin: 0, fontWeight: 400 }}>
                Trips assigned to you by admin.
              </p>
              {available.map((req) => (
                <div key={req.id} style={{ border: '1px solid var(--line)', borderRadius: 'var(--radius-lg)', padding: '1.125rem', background: 'var(--card-solid)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.625rem' }}>
                    <div style={{ fontWeight: 700, fontSize: '1.25rem', color: 'var(--ink)', letterSpacing: '-0.01em' }}>{req.destination}</div>
                    <div className="tag ok" style={{ fontSize: '0.9375rem', fontWeight: 600, padding: '0.25rem 0.625rem' }}>{req.requestedTime}</div>
                  </div>
                  <div style={{ fontSize: '1.0625rem', color: 'var(--ink-2)', marginBottom: '0.375rem', fontWeight: 500 }}>
                    {req.user.displayName}
                  </div>
                  <div style={{ fontSize: '1rem', color: 'var(--muted)', marginBottom: '0.5rem', fontWeight: 400 }}>
                    {new Date(req.requestedDate).toLocaleDateString()}
                    {req.purpose ? <span> &middot; {req.purpose}</span> : null}
                  </div>
                  {req.contactNumber ? (
                    <div style={{ fontSize: '1rem', color: 'var(--ink-2)', marginBottom: '0.5rem', fontWeight: 500 }}>
                      Tel: <a href={`tel:${req.contactNumber}`} style={{ color: 'var(--brand)' }}>{req.contactNumber}</a>
                    </div>
                  ) : null}
                  {req.isRoundTrip ? (
                    <div style={{ padding: '0.5rem 0.75rem', marginBottom: '1.125rem', background: 'rgba(99,102,241,0.08)', borderRadius: 'var(--radius)', fontSize: '0.9375rem' }}>
                      <strong style={{ color: 'var(--brand)' }}>Round Trip</strong>
                      {req.returnDate ? <span> &middot; {new Date(req.returnDate).toLocaleDateString()}</span> : null}
                      {req.returnTime ? <span> &middot; {req.returnTime}</span> : null}
                      {req.returnLocation ? <span> &middot; {req.returnLocation}</span> : null}
                    </div>
                  ) : <div style={{ marginBottom: '0.625rem' }} />}

                  {confirmAcceptId === req.id ? (
                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                      <button
                        className="button button-ghost"
                        style={{ flex: 1, padding: '1rem', fontSize: '1.125rem', height: 'auto', fontWeight: 700 }}
                        onClick={() => setConfirmAcceptId(null)}
                      >
                        Cancel
                      </button>
                      <button
                        className="button button-ok"
                        style={{ flex: 1, padding: '1rem', fontSize: '1.125rem', height: 'auto', fontWeight: 700, letterSpacing: '-0.01em' }}
                        disabled={!!actionId}
                        onClick={() => void acceptRequest(req.id)}
                      >
                        {actionId === req.id ? 'Accepting…' : 'Confirm Accept'}
                      </button>
                    </div>
                  ) : (
                    <button
                      className="button button-ok"
                      style={{ width: '100%', padding: '1rem', fontSize: '1.125rem', height: 'auto', fontWeight: 700, letterSpacing: '-0.01em', opacity: 0.85 }}
                      disabled={!!actionId}
                      onClick={() => setConfirmAcceptId(req.id)}
                    >
                      Accept Trip
                    </button>
                  )}
                </div>
              ))}
              {available.length === 0 ? (
                <div style={{ padding: '2.5rem 1rem', textAlign: 'center', color: 'var(--muted)', background: 'var(--surface)', borderRadius: 'var(--radius-lg)', fontSize: '1.0625rem', fontWeight: 500 }}>
                  No upcoming trips assigned to you.
                </div>
              ) : null}
            </div>
          ) : null}
        </article>

        <article className="card" style={{ padding: '1.25rem' }}>
          <h3 style={{ fontSize: '1.375rem', marginBottom: '0.25rem', fontWeight: 700, letterSpacing: '-0.02em' }}>My Active Trips</h3>
          <p style={{ fontSize: '1rem', color: 'var(--muted)', marginBottom: '1rem', fontWeight: 400 }}>
            Trips you have accepted. Complete them when done.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
            {inProgress.map((req) => (
              <div key={req.id} style={{ border: '1px solid var(--line)', borderRadius: 'var(--radius-lg)', padding: '1.125rem', background: 'var(--card-solid)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.625rem' }}>
                  <div style={{ fontWeight: 700, fontSize: '1.25rem', color: 'var(--ink)', letterSpacing: '-0.01em' }}>{req.destination}</div>
                  <div className="tag brand" style={{ fontSize: '0.9375rem', fontWeight: 600, padding: '0.25rem 0.625rem' }}>{req.requestedTime}</div>
                </div>
                <div style={{ fontSize: '1.0625rem', color: 'var(--ink-2)', marginBottom: '0.375rem', fontWeight: 500 }}>
                  {req.user.displayName}
                </div>
                <div style={{ fontSize: '1rem', color: 'var(--muted)', marginBottom: '0.5rem', fontWeight: 400 }}>
                  {new Date(req.requestedDate).toLocaleDateString()}
                  {req.purpose ? <span> &middot; {req.purpose}</span> : null}
                </div>
                {req.contactNumber ? (
                  <div style={{ fontSize: '1rem', color: 'var(--ink-2)', marginBottom: '0.5rem', fontWeight: 500 }}>
                    Tel: <a href={`tel:${req.contactNumber}`} style={{ color: 'var(--brand)' }}>{req.contactNumber}</a>
                  </div>
                ) : null}
                {req.isRoundTrip ? (
                  <div style={{ padding: '0.5rem 0.75rem', marginBottom: '1.125rem', background: 'rgba(99,102,241,0.08)', borderRadius: 'var(--radius)', fontSize: '0.9375rem' }}>
                    <strong style={{ color: 'var(--brand)' }}>Round Trip</strong>
                    {req.returnDate ? <span> &middot; {new Date(req.returnDate).toLocaleDateString()}</span> : null}
                    {req.returnTime ? <span> &middot; {req.returnTime}</span> : null}
                    {req.returnLocation ? <span> &middot; {req.returnLocation}</span> : null}
                  </div>
                ) : <div style={{ marginBottom: '0.625rem' }} />}
                <button
                  className="button button-primary"
                  style={{ width: '100%', padding: '1rem', fontSize: '1.125rem', height: 'auto', fontWeight: 700, letterSpacing: '-0.01em' }}
                  disabled={!!actionId}
                  onClick={() => void completeRequest(req.id)}
                >
                  {actionId === req.id ? 'Completing…' : 'Complete Trip'}
                </button>
              </div>
            ))}
            {inProgress.length === 0 ? (
              <div style={{ padding: '2.5rem 1rem', textAlign: 'center', color: 'var(--muted)', background: 'var(--surface)', borderRadius: 'var(--radius-lg)', fontSize: '1.0625rem', fontWeight: 500 }}>
                No active trips right now.
              </div>
            ) : null}
          </div>
        </article>
      </div>
    </AppShell>
  );
}
