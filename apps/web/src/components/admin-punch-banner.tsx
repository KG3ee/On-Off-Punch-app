'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api';

type DutySession = {
  id: string;
  punchedOnAt: string;
  punchedOffAt?: string | null;
  status: 'ACTIVE' | 'CLOSED' | 'CANCELLED';
  isLate: boolean;
  lateMinutes: number;
};

export function AdminPunchBanner() {
  const [sessions, setSessions] = useState<DutySession[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [nowTick, setNowTick] = useState(Date.now());

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<DutySession[]>('/attendance/me/today');
      setSessions(data);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 15_000);
    return () => clearInterval(timer);
  }, [load]);

  const active = useMemo(
    () => sessions.find((s) => s.status === 'ACTIVE') || null,
    [sessions]
  );

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);

  const durationMin = useMemo(() => {
    if (!active) return 0;
    return Math.max(0, Math.round((nowTick - new Date(active.punchedOnAt).getTime()) / 60000));
  }, [active, nowTick]);

  function fmtDuration(mins: number): string {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  async function punch(path: string) {
    setLoading(true);
    setMessage('');
    try {
      await apiFetch(path, {
        method: 'POST',
        body: JSON.stringify({ clientTimestamp: new Date().toISOString() })
      });
      setMessage(path.includes('on') ? 'Punched ON' : 'Punched OFF');
      setTimeout(() => setMessage(''), 2500);
      await load();
      setExpanded(false);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed');
      setTimeout(() => setMessage(''), 3000);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ marginBottom: '0.75rem' }}>
      {/* Collapsed bar */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: '0.625rem',
          padding: '0.5rem 0.875rem',
          background: active
            ? 'rgba(34,197,94,0.08)'
            : 'rgba(100,116,139,0.06)',
          border: `1.5px solid ${active ? 'rgba(34,197,94,0.25)' : 'rgba(100,116,139,0.12)'}`,
          borderRadius: expanded ? 'var(--radius-lg) var(--radius-lg) 0 0' : 'var(--radius-lg)',
          cursor: 'pointer',
          WebkitTapHighlightColor: 'transparent',
          transition: 'border-radius 0.15s',
        }}
      >
        <span
          style={{
            width: '0.5rem',
            height: '0.5rem',
            borderRadius: '50%',
            background: active ? 'var(--ok)' : 'var(--muted)',
            flexShrink: 0,
            boxShadow: active ? '0 0 6px rgba(34,197,94,0.5)' : 'none',
          }}
        />
        <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--ink)', flex: 1, textAlign: 'left' }}>
          {active ? `On Duty · ${fmtDuration(durationMin)}` : 'Off Duty'}
        </span>
        {message ? (
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--ok)' }}>{message}</span>
        ) : null}
        <svg
          width="16" height="16" viewBox="0 0 24 24" fill="none"
          style={{ flexShrink: 0, opacity: 0.4, transition: 'transform 0.2s', transform: expanded ? 'rotate(180deg)' : '' }}
        >
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Expanded panel */}
      {expanded ? (
        <div
          style={{
            display: 'flex',
            gap: '0.5rem',
            padding: '0.625rem 0.875rem',
            background: 'var(--card-solid)',
            border: `1.5px solid ${active ? 'rgba(34,197,94,0.25)' : 'rgba(100,116,139,0.12)'}`,
            borderTop: 'none',
            borderRadius: '0 0 var(--radius-lg) var(--radius-lg)',
          }}
        >
          <button
            type="button"
            className="button button-ok"
            disabled={loading || !!active}
            onClick={() => void punch('/attendance/on')}
            style={{ flex: 1, fontSize: '0.8125rem', padding: '0.5rem' }}
          >
            ⏻ Punch ON
          </button>
          <button
            type="button"
            className="button button-danger"
            disabled={loading || !active}
            onClick={() => void punch('/attendance/off')}
            style={{ flex: 1, fontSize: '0.8125rem', padding: '0.5rem' }}
          >
            ⏼ Punch OFF
          </button>
        </div>
      ) : null}
    </div>
  );
}
