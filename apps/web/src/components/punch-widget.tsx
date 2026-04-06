'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { PunchAttendanceConfirmModal } from '@/components/punch-attendance-confirm-modal';
import type {
  AttendanceRefreshDetail,
  PunchOffResult,
} from '@/lib/attendance-events';

type DutySession = {
  id: string;
  punchedOnAt: string;
  punchedOffAt?: string | null;
  status: 'ACTIVE' | 'CLOSED' | 'CANCELLED';
  isLate?: boolean;
  lateMinutes?: number;
  overtimeMinutes?: number;
};

type PunchAnimationState = 'idle' | 'confirming' | 'processing' | 'success' | 'error';

export function PunchWidget() {
  const [sessions, setSessions] = useState<DutySession[]>([]);
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [nowTick, setNowTick] = useState(0);
  const [animState, setAnimState] = useState<PunchAnimationState>('idle');
  const [lastAction, setLastAction] = useState<'on' | 'off' | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<'/attendance/on' | '/attendance/off' | null>(null);

  const load = useCallback(async () => {
    try {
      setSessions(await apiFetch<DutySession[]>('/attendance/me/today'));
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    setMounted(true);
    setNowTick(Date.now());
    void load();
    const timer = setInterval(() => void load(), 15_000);
    return () => clearInterval(timer);
  }, [load]);

  const active = useMemo(
    () => sessions.find((s) => s.status === 'ACTIVE') || null,
    [sessions]
  );

  useEffect(() => {
    function handleAttendanceRefresh(event: Event): void {
      const detail = (event as CustomEvent<AttendanceRefreshDetail>).detail;
      if (!detail?.session || !detail.path) return;

      setSessions((current) => {
        if (detail.path === '/attendance/on') {
          return [
            detail.session as DutySession,
            ...current.filter(
              (session) => session.id !== detail.session.id && session.status !== 'ACTIVE',
            ),
          ];
        }

        return current.map((session) =>
          session.id === detail.session.id
            ? ({ ...session, ...detail.session } as DutySession)
            : session,
        );
      });
    }

    window.addEventListener('attendance:refresh', handleAttendanceRefresh);
    return () => window.removeEventListener('attendance:refresh', handleAttendanceRefresh);
  }, []);

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

  const punch = useCallback(async (path: '/attendance/on' | '/attendance/off') => {
    setLoading(true);
    setAnimState('processing');
    setLastAction(path === '/attendance/on' ? 'on' : 'off');
    try {
      const payload = await apiFetch<DutySession & Partial<PunchOffResult>>(path, {
        method: 'POST',
        body: JSON.stringify({ clientTimestamp: new Date().toISOString() })
      });
      setSessions((current) => {
        if (path === '/attendance/on') {
          return [payload, ...current.filter((session) => session.id !== payload.id && session.status !== 'ACTIVE')];
        }
        return current.map((session) => (session.id === payload.id ? payload : session));
      });
      window.dispatchEvent(
        new CustomEvent<AttendanceRefreshDetail>('attendance:refresh', {
          detail: {
            path,
            session: payload,
            summary: path === '/attendance/off' ? payload.punchOffSummary : undefined,
          },
        }),
      );
      void load();
      setAnimState('success');
      
      // Trigger haptic feedback if available
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }

      // Reset animation after success
      setTimeout(() => {
        setAnimState('idle');
        setLastAction(null);
      }, 2000);
    } catch {
      setAnimState('error');
      setTimeout(() => setAnimState('idle'), 2000);
    } finally {
      setLoading(false);
    }
  }, [load]);

  function openConfirm(path: '/attendance/on' | '/attendance/off') {
    setPendingAction(path);
    setShowConfirmModal(true);
  }

  const handleConfirm = useCallback(() => {
    if (pendingAction) {
      setShowConfirmModal(false);
      void punch(pendingAction);
      setPendingAction(null);
    }
  }, [pendingAction, punch]);

  const handleCancel = useCallback(() => {
    setShowConfirmModal(false);
    setPendingAction(null);
  }, []);

  if (!mounted) return null;

  return (
    <>
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
              transition: 'all 0.3s',
              transform: animState === 'success' && lastAction === 'off' ? 'scale(1.1)' : 'scale(1)',
            }}>
              <span className="status-dot active" />
              {fmt(mins)}
            </span>
            <button
              type="button"
              className={`button button-danger button-sm ${animState === 'processing' ? 'processing' : ''}`}
              disabled={loading || animState === 'processing'}
              onClick={() => openConfirm('/attendance/off')}
              style={{
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {animState === 'processing' && lastAction === 'off' ? (
                <span className="sync-spinner" />
              ) : (
                'Punch OFF'
              )}
            </button>
          </>
        ) : (
          <button
            type="button"
            className={`button button-ok button-sm ${animState === 'processing' ? 'processing' : ''}`}
            disabled={loading || animState === 'processing'}
            onClick={() => openConfirm('/attendance/on')}
            style={{
              position: 'relative',
              overflow: 'hidden',
              transition: 'all 0.3s',
              transform: animState === 'success' && lastAction === 'on' ? 'scale(1.05)' : 'scale(1)',
            }}
          >
            {animState === 'processing' && lastAction === 'on' ? (
              <span className="sync-spinner" />
            ) : animState === 'success' && lastAction === 'on' ? (
              '✓'
            ) : (
              'Punch ON'
            )}
          </button>
        )}
      </div>

      <PunchAttendanceConfirmModal
        open={showConfirmModal && Boolean(pendingAction)}
        variant={pendingAction === '/attendance/off' ? 'off' : 'on'}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </>
  );
}
