'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api';

type DutySession = {
  id: string;
  punchedOnAt: string;
  status: 'ACTIVE' | 'CLOSED' | 'CANCELLED';
};

export function AdminPunchWidget() {
  const [sessions, setSessions] = useState<DutySession[]>([]);
  const [loading, setLoading] = useState(false);
  const [nowTick, setNowTick] = useState(Date.now());

  const load = useCallback(async () => {
    try {
      setSessions(await apiFetch<DutySession[]>('/attendance/me/today'));
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

  const mins = useMemo(() => {
    if (!active) return 0;
    return Math.max(0, Math.round((nowTick - new Date(active.punchedOnAt).getTime()) / 60000));
  }, [active, nowTick]);

  function fmt(m: number): string {
    const h = Math.floor(m / 60);
    const r = m % 60;
    return h > 0 ? `${h}h${r > 0 ? ` ${r}m` : ''}` : `${r}m`;
  }

  async function punch(path: string) {
    setLoading(true);
    try {
      await apiFetch(path, {
        method: 'POST',
        body: JSON.stringify({ clientTimestamp: new Date().toISOString() })
      });
      await load();
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      {active ? (
        <>
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.35rem',
            fontSize: '0.75rem',
            fontWeight: 600,
            color: 'var(--ok)',
            whiteSpace: 'nowrap',
          }}>
            <span style={{
              width: '0.4rem',
              height: '0.4rem',
              borderRadius: '50%',
              background: 'var(--ok)',
              boxShadow: '0 0 5px rgba(34,197,94,0.6)',
              flexShrink: 0,
            }} />
            {fmt(mins)}
          </span>
          <button
            type="button"
            disabled={loading}
            onClick={() => void punch('/attendance/off')}
            style={{
              fontSize: '0.625rem',
              fontWeight: 700,
              padding: '0.15rem 0.4rem',
              background: 'var(--danger)',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              lineHeight: '1.3',
              letterSpacing: '0.03em',
            }}
          >
            OFF
          </button>
        </>
      ) : (
        <button
          type="button"
          disabled={loading}
          onClick={() => void punch('/attendance/on')}
          style={{
            fontSize: '0.625rem',
            fontWeight: 700,
            padding: '0.15rem 0.4rem',
            background: 'var(--ok)',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            lineHeight: '1.3',
            letterSpacing: '0.03em',
          }}
        >
          Punch ON
        </button>
      )}
    </div>
  );
}
