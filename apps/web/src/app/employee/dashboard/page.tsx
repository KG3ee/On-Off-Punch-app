'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { apiFetch } from '@/lib/api';
import {
  clearSynced,
  runQueuedAction,
  subscribeQueue,
  getPendingCount,
  getFailedCount,
  getQueueSnapshot,
  retryFailedActions,
  QueuedAction
} from '@/lib/action-queue';
import { MeUser } from '@/types/auth';


type DutySession = {
  id: string;
  shiftDate: string;
  localDate: string;
  punchedOnAt: string;
  punchedOffAt?: string | null;
  status: 'ACTIVE' | 'CLOSED' | 'CANCELLED';
  isLate: boolean;
  lateMinutes: number;
  overtimeMinutes: number;
};

type BreakPolicy = {
  id: string;
  code: string;
  name: string;
  expectedDurationMinutes: number;
  dailyLimit: number;
};

type BreakSession = {
  id: string;
  localDate: string;
  dutySessionId: string;
  startedAt: string;
  endedAt?: string | null;
  expectedDurationMinutes: number;
  actualMinutes?: number | null;
  status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED' | 'AUTO_CLOSED';
  isOvertime: boolean;
  breakPolicy: {
    code: string;
    name: string;
  };
};

type ServerTime = {
  serverNow: string;
  timeZone: string;
};

type MonthlySummary = {
  month: string;
  totalWorkedMinutes: number;
  totalLateMinutes: number;
  totalOvertimeMinutes: number;
  sessionCount: number;
};

type DashboardCache = {
  me: MeUser | null;
  sessions: DutySession[];
  policies: BreakPolicy[];
  breakSessions: BreakSession[];
  serverTime: ServerTime | null;
  monthlySummary: MonthlySummary | null;
  cachedAt: string;
};

const DASHBOARD_CACHE_KEY = 'employee_dashboard_cache_v1';

const TOP_BREAK_CODES = ['bwc', 'wc', 'cy'] as const;
const BOTTOM_BREAK_CODES = ['cf+1', 'cf+2', 'cf+3'] as const;
const FIXED_BREAK_CODES: ReadonlySet<string> = new Set([...TOP_BREAK_CODES, ...BOTTOM_BREAK_CODES]);
const BREAK_EMOJI_MAP: Record<string, string> = {
  wc: '🚽',
  bwc: '💩',
  cy: '🚬',
  'cf+1': '🥐',
  'cf+2': '🍛',
  'cf+3': '🍽️'
};

function loadDashboardCache(): DashboardCache | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(DASHBOARD_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as DashboardCache;
  } catch {
    return null;
  }
}

function saveDashboardCache(cache: DashboardCache): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(DASHBOARD_CACHE_KEY, JSON.stringify(cache));
}

function queueDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }
  return date.toISOString().slice(0, 10);
}

export default function EmployeeDashboardPage() {
  const [me, setMe] = useState<MeUser | null>(null);

  const [sessions, setSessions] = useState<DutySession[]>([]);
  const [policies, setPolicies] = useState<BreakPolicy[]>([]);
  const [breakSessions, setBreakSessions] = useState<BreakSession[]>([]);
  const [monthlySummary, setMonthlySummary] = useState<MonthlySummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [nowTick, setNowTick] = useState(Date.now());
  const [pendingActions, setPendingActions] = useState(0);
  const [failedActions, setFailedActions] = useState(0);
  const [queueActions, setQueueActions] = useState<QueuedAction[]>([]);
  const [isOffline, setIsOffline] = useState(false);
  const [clockSkewMinutes, setClockSkewMinutes] = useState<number | null>(null);
  const [serverTimeZone, setServerTimeZone] = useState('');
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const syncedActionIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (notificationsRef.current && !notificationsRef.current.contains(e.target as Node)) {
        setNotificationsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const serverActiveSession = useMemo(() => sessions.find((s) => s.status === 'ACTIVE') || null, [sessions]);
  const serverActiveBreak = useMemo(
    () => breakSessions.find((session) => session.status === 'ACTIVE') || null,
    [breakSessions]
  );

  const { activeSession, activeBreak } = useMemo(() => {
    const pendingQueue = queueActions
      .filter((action) => action.status === 'pending' || action.status === 'syncing')
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    let projectedSession: DutySession | null = serverActiveSession;
    let projectedBreak: BreakSession | null = serverActiveBreak;

    for (const action of pendingQueue) {
      if (action.path === '/attendance/on') {
        if (!projectedSession) {
          const date = queueDate(action.clientTimestamp);
          projectedSession = {
            id: `local-duty-${action.id}`,
            shiftDate: date,
            localDate: date,
            punchedOnAt: action.clientTimestamp,
            status: 'ACTIVE',
            isLate: false,
            lateMinutes: 0,
            overtimeMinutes: 0
          };
        }
        continue;
      }

      if (action.path === '/attendance/off') {
        projectedSession = null;
        projectedBreak = null;
        continue;
      }

      if (action.path === '/breaks/start') {
        if (projectedSession && !projectedBreak) {
          const rawCode = action.body?.code;
          const code = typeof rawCode === 'string' ? rawCode : 'break';
          const policy = policies.find((item) => item.code.toLowerCase() === code.toLowerCase());
          projectedBreak = {
            id: `local-break-${action.id}`,
            localDate: queueDate(action.clientTimestamp),
            dutySessionId: projectedSession.id,
            startedAt: action.clientTimestamp,
            expectedDurationMinutes: policy?.expectedDurationMinutes ?? 10,
            status: 'ACTIVE',
            isOvertime: false,
            breakPolicy: {
              code: policy?.code || code,
              name: policy?.name || 'Queued Break'
            }
          };
        }
        continue;
      }

      if (action.path === '/breaks/end' || action.path === '/breaks/cancel') {
        projectedBreak = null;
      }
    }

    return {
      activeSession: projectedSession,
      activeBreak: projectedBreak
    };
  }, [queueActions, serverActiveBreak, serverActiveSession, policies]);

  const activeBreakMinutes = useMemo(() => {
    if (!activeBreak) return 0;
    const startedAt = new Date(activeBreak.startedAt).getTime();
    return Math.max(0, Math.round((nowTick - startedAt) / 60000));
  }, [activeBreak, nowTick]);

  // Only show breaks linked to the current active duty session
  const sessionBreaks = useMemo(() => {
    if (!activeSession) return [];
    const linked = breakSessions.filter((breakItem) => breakItem.dutySessionId === activeSession.id);
    if (!activeBreak) return linked;
    const hasActive = linked.some((breakItem) => breakItem.id === activeBreak.id);
    return hasActive ? linked : [activeBreak, ...linked];
  }, [breakSessions, activeBreak, activeSession]);

  const activeDutyMinutes = useMemo(() => {
    if (!activeSession) return 0;
    const startedAt = new Date(activeSession.punchedOnAt).getTime();
    return Math.max(0, Math.round((nowTick - startedAt) / 60000));
  }, [activeSession, nowTick]);

  useEffect(() => { void loadData(); }, []);

  // Subscribe to queue changes
  useEffect(() => {
    const initialQueue = getQueueSnapshot();
    setPendingActions(getPendingCount());
    setFailedActions(getFailedCount());
    setQueueActions(initialQueue);
    syncedActionIdsRef.current = new Set(
      initialQueue
        .filter((item) => item.status === 'synced')
        .map((item) => item.id)
    );

    const unsub = subscribeQueue((q: QueuedAction[]) => {
      const pending = q.filter(a => a.status === 'pending' || a.status === 'syncing').length;
      const failed = q.filter(a => a.status === 'failed').length;
      setPendingActions(pending);
      setFailedActions(failed);
      setQueueActions(q);

      const syncedIds = q.filter((item) => item.status === 'synced').map((item) => item.id);
      const hadNewSynced = syncedIds.some((id) => !syncedActionIdsRef.current.has(id));
      syncedActionIdsRef.current = new Set(syncedIds);

      // Refresh once when new sync finishes, then clear synced queue entries.
      if (hadNewSynced) {
        void loadData({ background: true });
        clearSynced();
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!activeBreak && !activeSession) return;
    const timer = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [activeBreak, activeSession]);

  useEffect(() => {
    // Sync the real offline status after hydration (safe — runs client-only)
    setIsOffline(!navigator.onLine);

    function onOnline() { setIsOffline(false); }
    function onOffline() { setIsOffline(true); }

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  // Keyboard shortcuts: Space → End break, Esc → Cancel break
  useEffect(() => {
    if (!activeBreak) return;

    function handleKeyDown(e: KeyboardEvent) {
      // Don't intercept if user is typing in an input/textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.code === 'Space') {
        e.preventDefault();
        void runAction('/breaks/end');
      } else if (e.code === 'Escape' && activeBreak && (Date.now() - new Date(activeBreak.startedAt).getTime()) < 120000) {
        e.preventDefault();
        void runAction('/breaks/cancel');
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBreak, loading]);

  async function loadData(options?: { background?: boolean }): Promise<void> {
    const background = options?.background ?? false;
    if (!background) {
      setLoading(true);
    }
    setError('');
    const cache = loadDashboardCache();

    const [meResult, sessionsResult, policiesResult, breaksResult, timeResult, summaryResult] =
      await Promise.allSettled([
        apiFetch<MeUser>('/me'),
        apiFetch<DutySession[]>('/attendance/me/today'),
        apiFetch<BreakPolicy[]>('/breaks/policies'),
        apiFetch<BreakSession[]>('/breaks/me/today'),
        apiFetch<ServerTime>('/time'),
        apiFetch<MonthlySummary>('/attendance/me/summary')
      ]);

    const nextMe = meResult.status === 'fulfilled' ? meResult.value : (cache?.me || null);
    const nextSessions = sessionsResult.status === 'fulfilled' ? sessionsResult.value : (cache?.sessions || []);
    const nextPolicies = policiesResult.status === 'fulfilled' ? policiesResult.value : (cache?.policies || []);
    const nextBreakSessions = breaksResult.status === 'fulfilled' ? breaksResult.value : (cache?.breakSessions || []);
    const nextServerTime = timeResult.status === 'fulfilled' ? timeResult.value : (cache?.serverTime || null);
    const nextSummary = summaryResult.status === 'fulfilled' ? summaryResult.value : (cache?.monthlySummary || null);

    setMe(nextMe);
    setSessions(nextSessions);
    setPolicies(nextPolicies);
    setBreakSessions(nextBreakSessions);
    setMonthlySummary(nextSummary);

    let failedCount = 0;
    if (meResult.status !== 'fulfilled') failedCount++;
    if (sessionsResult.status !== 'fulfilled') failedCount++;
    if (policiesResult.status !== 'fulfilled') failedCount++;
    if (breaksResult.status !== 'fulfilled') failedCount++;
    if (timeResult.status !== 'fulfilled') failedCount++;
    if (summaryResult.status !== 'fulfilled') failedCount++;

    if (timeResult.status === 'fulfilled' && nextServerTime) {
      const serverNow = new Date(nextServerTime.serverNow).getTime();
      if (!Number.isNaN(serverNow)) {
        const skew = Math.round((Date.now() - serverNow) / 60000);
        setClockSkewMinutes(skew);
        setServerTimeZone(nextServerTime.timeZone);
      }
    } else if (timeResult.status !== 'fulfilled') {
      setClockSkewMinutes(null);
    }

    const hasLiveSuccess =
      meResult.status === 'fulfilled' ||
      sessionsResult.status === 'fulfilled' ||
      policiesResult.status === 'fulfilled' ||
      breaksResult.status === 'fulfilled' ||
      timeResult.status === 'fulfilled';

    if (hasLiveSuccess) {
      saveDashboardCache({
        me: nextMe,
        sessions: nextSessions,
        policies: nextPolicies,
        breakSessions: nextBreakSessions,
        serverTime: nextServerTime,
        monthlySummary: nextSummary,
        cachedAt: new Date().toISOString()
      });
    }

    if (failedCount === 5 && cache) {
      setError('Offline mode: showing cached data. Your actions will sync when internet is back.');
    } else if (failedCount === 5) {
      setError('No internet and no cached dashboard data yet.');
    } else if (failedCount > 0) {
      setError('Some data could not be loaded. Showing available/cached data.');
    }

    if (!background) {
      setLoading(false);
    }
  }

  // Targeted refresh: only re-fetch what the action actually changed, then
  // kick off a full background reload so everything stays in sync.
  async function loadTargeted(endpoints: ('sessions' | 'breaks' | 'summary')[]): Promise<void> {
    const fetchers = {
      sessions: () => apiFetch<DutySession[]>('/attendance/me/today'),
      breaks:   () => apiFetch<BreakSession[]>('/breaks/me/today'),
      summary:  () => apiFetch<MonthlySummary>('/attendance/me/summary'),
    };
    const results = await Promise.allSettled(endpoints.map(e => fetchers[e]()));
    endpoints.forEach((ep, i) => {
      const r = results[i];
      if (r.status !== 'fulfilled') return;
      if (ep === 'sessions') setSessions(r.value as DutySession[]);
      else if (ep === 'breaks') setBreakSessions(r.value as BreakSession[]);
      else if (ep === 'summary') setMonthlySummary(r.value as MonthlySummary);
    });
  }

  async function runAction(path: string, body?: Record<string, unknown>): Promise<void> {
    setActionMessage('');
    setError('');
    setLoading(true);

    const result = await runQueuedAction(path, body);

    if (result.ok) {
      setActionMessage('Action completed');
      setTimeout(() => setActionMessage(''), 3000);

      // Fast targeted refresh for the changed data only, then sync the rest in background
      if (path === '/attendance/on' || path === '/attendance/off') {
        await loadTargeted(['sessions', 'breaks', 'summary']);
      } else if (path.startsWith('/breaks')) {
        await loadTargeted(['breaks']);
      } else {
        await loadData();
      }
      loadData({ background: true });
    } else if (result.queued) {
      setActionMessage('Action queued. It will sync automatically when connection is available.');
      setTimeout(() => setActionMessage(''), 5000);
    } else {
      setError(result.error || 'Action failed');
    }

    setLoading(false);
  }

  function retryFailedQueueActions(): void {
    retryFailedActions();
    setActionMessage('Retrying failed actions…');
    setTimeout(() => setActionMessage(''), 3000);
  }

  function fmtTime(iso: string): string {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  function fmtDuration(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  function formatBreakMinutes(session: BreakSession): string {
    if (session.actualMinutes !== null && session.actualMinutes !== undefined) return `${session.actualMinutes}m`;
    if (session.status === 'ACTIVE') {
      const elapsed = Math.max(0, Math.round((nowTick - new Date(session.startedAt).getTime()) / 60000));
      return `${elapsed}m`;
    }
    return '-';
  }

  const breakBlockedReason = useMemo(() => {
    if (!activeSession) return 'Punch ON first';
    if (activeBreak) return `Active break (${activeBreak.breakPolicy.code.toUpperCase()}) — end it first`;
    if (policies.length === 0) return 'No break policies configured';
    return '';
  }, [activeBreak, activeSession, policies.length]);

  const topRowPolicies = useMemo(
    () =>
      TOP_BREAK_CODES.map((code) => policies.find((policy) => policy.code.toLowerCase() === code)).filter(
        (policy): policy is BreakPolicy => Boolean(policy)
      ),
    [policies]
  );

  const bottomRowPolicies = useMemo(
    () =>
      BOTTOM_BREAK_CODES.map((code) => policies.find((policy) => policy.code.toLowerCase() === code)).filter(
        (policy): policy is BreakPolicy => Boolean(policy)
      ),
    [policies]
  );

  const extraPolicies = useMemo(
    () =>
      policies
        .filter((policy) => !FIXED_BREAK_CODES.has(policy.code.toLowerCase()))
        .sort((a, b) => a.code.localeCompare(b.code)),
    [policies]
  );

  function renderPolicyButton(policy: BreakPolicy) {
    const normalizedCode = policy.code.toLowerCase();
    const emoji = BREAK_EMOJI_MAP[normalizedCode] || '☕';
    return (
      <button
        key={policy.id}
        type="button"
        className="button-chip"
        disabled={loading || !activeSession || !!activeBreak}
        onClick={() => void runAction('/breaks/start', { code: policy.code })}
        title={`${policy.name} — ${policy.expectedDurationMinutes}m, limit ${policy.dailyLimit}/day`}
      >
        <span className="chip-emoji">{emoji}</span>
        <span className="chip-code">{policy.code.toUpperCase()} · {policy.expectedDurationMinutes}m</span>
        <span className="chip-name">{policy.name}</span>
      </button>
    );
  }

  useEffect(() => {
    if (error || actionMessage) {
      setNotificationsOpen(true);
      if (actionMessage && !error) {
        const t = setTimeout(() => setNotificationsOpen(false), 4000);
        return () => clearTimeout(t);
      }
    }
  }, [error, actionMessage]);

  const notifications = useMemo(() => {
    const list: { id: string; type: string; text: string; action?: boolean }[] = [];
    if (error) list.push({ id: 'error', type: 'error', text: error });
    if (actionMessage) list.push({ id: 'msg', type: 'success', text: actionMessage });
    if (isOffline) list.push({ id: 'offline', type: 'warning', text: 'You are offline. Actions will queue and sync later.' });
    if (clockSkewMinutes !== null && Math.abs(clockSkewMinutes) >= 3) {
      list.push({ id: 'clock', type: 'warning', text: `Device clock differs from server by about ${Math.abs(clockSkewMinutes)} min${serverTimeZone ? ` (${serverTimeZone})` : ''}. Please enable automatic date/time.` });
    }
    if (pendingActions > 0) list.push({ id: 'pending', type: 'warning', text: `${pendingActions} action${pendingActions > 1 ? 's' : ''} waiting to sync…` });
    if (failedActions > 0) list.push({ id: 'failed', type: 'error', text: `${failedActions} action${failedActions > 1 ? 's' : ''} need manual retry.`, action: true });
    return list;
  }, [error, actionMessage, isOffline, clockSkewMinutes, serverTimeZone, pendingActions, failedActions]);

  const headerAction = (
    <div className="action-menu-wrap" ref={notificationsRef}>
      <button 
        type="button" 
        className={`noti-bell${isOffline ? ' noti-bell-offline' : ''}`}
        onClick={() => setNotificationsOpen(!notificationsOpen)}
        title={isOffline ? 'No internet connection' : 'Notifications'}
      >
        {isOffline ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="1" y1="1" x2="23" y2="23" />
            <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
            <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
            <path d="M10.71 5.05A16 16 0 0 1 22.56 9" />
            <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
            <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
            <line x1="12" y1="20" x2="12.01" y2="20" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        )}
        {!isOffline && notifications.length > 0 && (
          <span className="noti-badge">{notifications.length}</span>
        )}
      </button>
      {notificationsOpen && (
        <div className="noti-dropdown">
          <div className="noti-dropdown-header">
            <span style={{ fontWeight: 600, fontSize: '0.8125rem' }}>Notifications</span>
            {notifications.length > 0 && (
              <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{notifications.length} active</span>
            )}
          </div>
          {notifications.length === 0 ? (
            <div className="noti-empty">All clear — no notifications</div>
          ) : (
            <div className="noti-list">
              {notifications.map(n => (
                <div key={n.id} className={`noti-item noti-item-${n.type}`}>
                  <div className="noti-dot" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span className="noti-text">{n.text}</span>
                    {n.action && (
                      <button type="button" className="button button-ghost button-sm" style={{ marginTop: '0.375rem', fontSize: '0.75rem' }} onClick={retryFailedQueueActions}>
                        Retry Failed
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <AppShell
      title="Dashboard"
      subtitle={me ? `${me.displayName}${me.team?.name ? ` · ${me.team.name}` : ''}` : '…'}
      userRole={me?.role}
      headerAction={headerAction}
    >

      {/* ── Monthly KPI Row ── */}
      {monthlySummary ? (
        <section className="kpi-grid">
          <article className="kpi">
            <p className="kpi-label">Month Hours</p>
            <p className="kpi-value">{fmtDuration(monthlySummary.totalWorkedMinutes)}</p>
          </article>
          <article className="kpi">
            <p className="kpi-label">Month Late</p>
            <p className="kpi-value" style={{ color: monthlySummary.totalLateMinutes > 0 ? 'var(--danger)' : undefined }}>
              {monthlySummary.totalLateMinutes}m
            </p>
          </article>
          <article className="kpi">
            <p className="kpi-label">Overtime</p>
            <p className="kpi-value" style={{ color: monthlySummary.totalOvertimeMinutes > 0 ? 'var(--ok)' : undefined }}>
              {monthlySummary.totalOvertimeMinutes}m
            </p>
          </article>
        </section>
      ) : null}

      {/* ── Today KPI Row ── */}
      <section className="kpi-grid">
        <article className="kpi">
          <p className="kpi-label">Sessions</p>
          <p className="kpi-value">{sessions.length}</p>
        </article>
        <article className="kpi">
          <p className="kpi-label">Duty</p>
          <p className="kpi-value" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <span className={`status-dot ${activeSession ? 'active' : 'inactive'}`} />
            {activeSession ? fmtDuration(activeDutyMinutes) : 'Off'}
          </p>
        </article>
        <article className="kpi">
          <p className="kpi-label">Break</p>
          <p className="kpi-value">
            {activeBreak ? (
              <span style={{ color: 'var(--ok)' }}>{activeBreak.breakPolicy.code.toUpperCase()}</span>
            ) : 'None'}
          </p>
        </article>
        {activeSession?.isLate ? (
          <article className="kpi">
            <p className="kpi-label">Late</p>
            <p className="kpi-value" style={{ color: 'var(--danger)' }}>{activeSession.lateMinutes}m</p>
          </article>
        ) : null}
      </section>

      {/* ── Main Layout ── */}
      <section className="split">
        {/* Left column — Actions */}
        <div className="grid">
          {/* Duty */}
          <article className="card">
            <h3>Duty</h3>
            <div className="action-row">
              <button
                type="button"
                className="punch-btn punch-on"
                disabled={loading || !!activeSession}
                onClick={() => void runAction('/attendance/on')}
              >
                <span className="punch-icon">⏻</span>
                <span className="punch-label">Punch ON</span>
              </button>
              <button
                type="button"
                className="punch-btn punch-off"
                disabled={loading || !activeSession}
                onClick={() => void runAction('/attendance/off')}
              >
                <span className="punch-icon">⏼</span>
                <span className="punch-label">Punch OFF</span>
              </button>
            </div>
          </article>

          {/* Breaks */}
          <article className="card">
            <h3>Breaks</h3>
            {activeBreak ? (
              <div className="break-banner">
                <span className="status-dot active" />
                <span><strong>{activeBreak.breakPolicy.code.toUpperCase()}</strong> · {activeBreak.breakPolicy.name}</span>
                <span className="elapsed">{activeBreakMinutes}m</span>
                <span style={{ color: 'var(--muted)', fontSize: '0.72rem' }}>/ {activeBreak.expectedDurationMinutes}m</span>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.3rem' }}>
                  <button className="button button-ok button-sm" disabled={loading} onClick={() => void runAction('/breaks/end')} title="Space bar">
                    End <kbd style={{ fontSize: '0.6rem', opacity: 0.7, marginLeft: '0.2rem', padding: '0.1rem 0.3rem', background: 'rgba(255,255,255,0.15)', borderRadius: '3px' }}>␣</kbd>
                  </button>
                  {activeBreakMinutes < 2 ? (
                    <button className="button button-danger button-sm" disabled={loading} onClick={() => void runAction('/breaks/cancel')} title="Escape">
                      Cancel <kbd style={{ fontSize: '0.6rem', opacity: 0.7, marginLeft: '0.2rem', padding: '0.1rem 0.3rem', background: 'rgba(255,255,255,0.15)', borderRadius: '3px' }}>Esc</kbd>
                    </button>
                  ) : null}
                </div>
              </div>
            ) : (
              <>
                {breakBlockedReason ? (
                  <div className="alert alert-warning">{breakBlockedReason}</div>
                ) : null}
                <div className="break-chips-layout">
                  {topRowPolicies.length > 0 ? <div className="chips-row">{topRowPolicies.map(renderPolicyButton)}</div> : null}
                  {bottomRowPolicies.length > 0 ? (
                    <div className="chips-row chips-row-bottom">{bottomRowPolicies.map(renderPolicyButton)}</div>
                  ) : null}
                  {extraPolicies.length > 0 ? <div className="chips-grid">{extraPolicies.map(renderPolicyButton)}</div> : null}
                  {policies.length === 0 ? (
                    <p style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>No break policies available</p>
                  ) : null}
                </div>
              </>
            )}
          </article>
        </div>

        {/* Right column — Current Session */}
        <div className="grid">
          <article className="card">
            <h3>Current Session</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>On</th>
                    <th>Off</th>
                    <th>Status</th>
                    <th>Late</th>
                  </tr>
                </thead>
                <tbody>
                  {activeSession ? (
                    <tr>
                      <td className="mono">{activeSession.shiftDate}</td>
                      <td className="mono">{fmtTime(activeSession.punchedOnAt)}</td>
                      <td className="mono">{activeSession.punchedOffAt ? fmtTime(activeSession.punchedOffAt) : '—'}</td>
                      <td>
                        <span className={`tag ${activeSession.status === 'ACTIVE' ? 'ok' : ''}`}>{activeSession.status}</span>
                      </td>
                      <td>{activeSession.lateMinutes > 0 ? <span className="tag danger">{activeSession.lateMinutes}m</span> : '—'}</td>
                    </tr>
                  ) : (
                    <tr><td colSpan={5} className="table-empty">Not on duty</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>

          <article className="card">
            <h3>Session Breaks</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Start</th>
                    <th>End</th>
                    <th>Min</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {sessionBreaks.map((session) => (
                    <tr key={session.id}>
                      <td><span className="tag">{session.breakPolicy.code.toUpperCase()}</span></td>
                      <td className="mono">{fmtTime(session.startedAt)}</td>
                      <td className="mono">{session.endedAt ? fmtTime(session.endedAt) : '—'}</td>
                      <td>{formatBreakMinutes(session)}</td>
                      <td>
                        {session.status === 'CANCELLED' ? (
                          <span className="tag danger">Cancelled</span>
                        ) : session.status === 'ACTIVE' ? (
                          <span className="tag ok">Active</span>
                        ) : session.isOvertime ? (
                          <span className="tag warning">Late</span>
                        ) : (
                          <span className="tag brand">On time</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {sessionBreaks.length === 0 ? (
                    <tr><td colSpan={5} className="table-empty">{activeSession ? 'No breaks this session' : 'Not on duty'}</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </article>
        </div>
      </section>
    </AppShell>
  );
}
