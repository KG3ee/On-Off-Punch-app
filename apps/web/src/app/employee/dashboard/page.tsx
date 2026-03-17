'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { AvatarName } from '@/components/avatar-name';
import { apiFetch } from '@/lib/api';
import {
  fetchNotificationUnreadCount,
  fetchNotifications,
  markAllNotificationsRead,
  UserNotification,
} from '@/lib/notifications';
import {
  clearSynced,
  runQueuedAction,
  subscribeQueue,
  getPendingCount,
  getFailedCount,
  getQueueSnapshot,
  retryFailedActions,
  dismissFailedActions,
  QueuedAction
} from '@/lib/action-queue';
import { MeUser } from '@/types/auth';
import { LeaderDashboard } from '@/components/leader-dashboard';
import { BreakChips } from '@/components/break-chips';


type DutySession = {
  id: string;
  shiftDate: string;
  localDate: string;
  scheduledStartLocal?: string | null;
  scheduledEndLocal?: string | null;
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

type BreakStartResult = {
  localDate?: string;
  isOverLimit?: boolean;
  usedCount?: number;
  dailyLimit?: number;
  quotaScope?: 'DUTY_SESSION';
  quotaScopeId?: string;
  breakSessionId?: string | null;
  dutySessionId?: string | null;
  clientBreakRef?: string | null;
  clientDutySessionRef?: string | null;
  syncStatus?: 'APPLIED' | 'IDEMPOTENT' | 'STALE';
  syncReason?: string | null;
  breakPolicy?: {
    code?: string;
    name?: string;
  };
};

type DriverRequestCreateResult = {
  id: string;
  queueState?: 'DRIVERS_AVAILABLE' | 'NO_AVAILABLE_DRIVERS';
  availableDriversCount?: number;
};

type DashboardToast = {
  id: string;
  tone: 'warning' | 'success' | 'error';
  text: string;
};

type PublicLiveSession = {
  userId: string;
  displayName: string;
  profilePhotoUrl?: string | null;
  teamName: string;
  punchedOnAt: string;
  activeBreak: {
    code: string;
    startedAt: string;
  } | null;
};

type PublicLiveBoard = {
  localDate: string;
  sessions: PublicLiveSession[];
};

type ViolationReason = 'LEFT_WITHOUT_PUNCH' | 'UNAUTHORIZED_ABSENCE' | 'OTHER';

const DASHBOARD_CACHE_KEY = 'employee_dashboard_cache_v1';
const BREAK_OVER_LIMIT_TOAST_SEEN_KEY = 'break_over_limit_toast_seen_v1';

const TOP_BREAK_CODES = ['bwc', 'wc', 'cy'] as const;
const BOTTOM_BREAK_CODES = ['cf+1', 'cf+2', 'cf+3'] as const;
const FIXED_BREAK_CODES: ReadonlySet<string> = new Set([...TOP_BREAK_CODES, ...BOTTOM_BREAK_CODES]);
const BREAK_SHORTCUT_KEY_TO_CODE: Record<string, string> = {
  b: 'bwc',
  w: 'wc',
  c: 'cy',
  '1': 'cf+1',
  '2': 'cf+2',
  '3': 'cf+3'
};
const BREAK_SHORTCUT_EVENT_CODE_TO_CODE: Record<string, string> = {
  KeyB: 'bwc',
  KeyW: 'wc',
  KeyC: 'cy',
  Digit1: 'cf+1',
  Digit2: 'cf+2',
  Digit3: 'cf+3',
  Numpad1: 'cf+1',
  Numpad2: 'cf+2',
  Numpad3: 'cf+3'
};
const BREAK_SHORTCUT_CODE_TO_LABEL: Record<string, string> = {
  bwc: 'B',
  wc: 'W',
  cy: 'C',
  'cf+1': '1',
  'cf+2': '2',
  'cf+3': '3'
};
const BREAK_EMOJI_MAP: Record<string, string> = {
  wc: '🚽',
  bwc: '💩',
  cy: '🚬',
  'cf+1': '🥐',
  'cf+2': '🍛',
  'cf+3': '🍽️'
};


function isClientRefId(value?: string | null): boolean {
  return typeof value === 'string' && (value.startsWith('duty-') || value.startsWith('break-'));
}

function describeDiscardedQueueAction(action: QueuedAction): string {
  const reason = action.result?.syncReason || '';
  if (action.path === '/breaks/start' && reason === 'BREAK_ALREADY_RECORDED_FROM_ANOTHER_DEVICE') {
    return 'Queued break from this device was discarded because the break was already recorded from another device.';
  }
  if (action.path === '/breaks/end' && reason === 'BREAK_ALREADY_ENDED') {
    return 'Queued break end was discarded because the break had already been ended.';
  }
  if (action.path === '/breaks/end' && reason === 'BREAK_ALREADY_CANCELLED') {
    return 'Queued break end was discarded because the break had already been cancelled.';
  }
  if (action.path === '/breaks/cancel' && reason === 'BREAK_ALREADY_CANCELLED') {
    return 'Queued cancel was discarded because the break had already been cancelled.';
  }
  if (action.path === '/breaks/cancel' && reason === 'BREAK_ALREADY_ENDED') {
    return 'Queued cancel was discarded because the break had already been ended.';
  }
  return 'A queued action from this device was discarded because the server had already recorded the canonical action.';
}

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

function isTypingTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) return false;
  const tag = element.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || element.isContentEditable;
}

function loadOverLimitToastSeen(): Record<string, true> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(BREAK_OVER_LIMIT_TOAST_SEEN_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, true>;
  } catch {
    return {};
  }
}

function consumeOverLimitToastToken(
  code: string,
  quotaScopeId?: string,
  localDate?: string,
): boolean {
  if (typeof window === 'undefined') return true;
  const normalizedCode = code.trim().toLowerCase();
  const normalizedScopeId = quotaScopeId?.trim();
  const normalizedDate = localDate?.trim();
  const scope = normalizedScopeId || normalizedDate;
  if (!normalizedCode || !scope) return true;

  const key = `${scope}:${normalizedCode}`;
  const seen = loadOverLimitToastSeen();
  if (seen[key]) return false;

  seen[key] = true;
  localStorage.setItem(BREAK_OVER_LIMIT_TOAST_SEEN_KEY, JSON.stringify(seen));
  return true;
}

export default function EmployeeDashboardPage() {
  const router = useRouter();
  const [me, setMe] = useState<MeUser | null>(null);

  const [sessions, setSessions] = useState<DutySession[]>([]);
  const [policies, setPolicies] = useState<BreakPolicy[]>([]);
  const [breakSessions, setBreakSessions] = useState<BreakSession[]>([]);
  const [monthlySummary, setMonthlySummary] = useState<MonthlySummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [warningMessage, setWarningMessage] = useState('');
  const [toast, setToast] = useState<DashboardToast | null>(null);
  const [nowTick, setNowTick] = useState(Date.now());
  const [pendingActions, setPendingActions] = useState(0);
  const [failedActions, setFailedActions] = useState(0);
  const [queueActions, setQueueActions] = useState<QueuedAction[]>([]);
  const [isOffline, setIsOffline] = useState(false);
  const [clockSkewMinutes, setClockSkewMinutes] = useState<number | null>(null);
  const [serverTimeZone, setServerTimeZone] = useState('');
  const [shortcutConfirmPolicy, setShortcutConfirmPolicy] = useState<BreakPolicy | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [serverNotifications, setServerNotifications] = useState<UserNotification[]>([]);
  const [serverUnreadCount, setServerUnreadCount] = useState(0);
  const [publicLiveSessions, setPublicLiveSessions] = useState<PublicLiveSession[]>([]);
  const [showViolationModal, setShowViolationModal] = useState(false);
  const [violationAccusedUserId, setViolationAccusedUserId] = useState('');
  const [violationReason, setViolationReason] = useState<ViolationReason>('LEFT_WITHOUT_PUNCH');
  const [violationNote, setViolationNote] = useState('');
  const [violationSubmitting, setViolationSubmitting] = useState(false);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const settledActionIdsRef = useRef<Set<string>>(new Set());
  const toastTimerRef = useRef<number | null>(null);

  function showToast(
    tone: DashboardToast['tone'],
    text: string,
    durationMs = 5500,
  ): void {
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
    setToast({ id: `${Date.now()}`, tone, text });
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, durationMs);
  }

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

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
          const clientDutySessionRef =
            typeof action.body?.clientDutySessionRef === 'string'
              ? action.body.clientDutySessionRef
              : `duty-${action.id}`;
          projectedSession = {
            id: clientDutySessionRef,
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
          const clientBreakRef =
            typeof action.body?.clientBreakRef === 'string'
              ? action.body.clientBreakRef
              : `break-${action.id}`;
          projectedBreak = {
            id: clientBreakRef,
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
  const canCancelActiveBreak = !!activeBreak && activeBreakMinutes < 2;

  const canStartBreak = useMemo(() => {
    const breakUiEnabled = me?.role !== 'MAID' && me?.role !== 'CHEF';
    return breakUiEnabled && !!activeSession && !activeBreak && !((loading && !isOffline));
  }, [activeBreak, activeSession, isOffline, loading, me?.role]);

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

  const loadPublicBreakBoard = useCallback(async (silent = true) => {
    try {
      const data = await apiFetch<PublicLiveBoard>('/attendance/live/public');
      setPublicLiveSessions(data.sessions);
    } catch (e) {
      if (!silent) {
        setError(e instanceof Error ? e.message : 'Failed to load public break board');
      }
    }
  }, []);

  const publicBreakSessions = useMemo(
    () => publicLiveSessions.filter((session) => session.activeBreak),
    [publicLiveSessions]
  );

  useEffect(() => { void loadData(); }, []);

  // Subscribe to queue changes
  useEffect(() => {
    const initialQueue = getQueueSnapshot();
    setPendingActions(getPendingCount());
    setFailedActions(getFailedCount());
    setQueueActions(initialQueue);
    settledActionIdsRef.current = new Set(
      initialQueue
        .filter((item) => item.status === 'synced' || item.status === 'discarded')
        .map((item) => item.id)
    );

    const unsub = subscribeQueue((q: QueuedAction[]) => {
      const pending = q.filter(a => a.status === 'pending' || a.status === 'syncing').length;
      const failed = q.filter(a => a.status === 'failed').length;
      setPendingActions(pending);
      setFailedActions(failed);
      setQueueActions(q);

      const settled = q.filter((item) => item.status === 'synced' || item.status === 'discarded');
      const settledIds = settled.map((item) => item.id);
      const newlySettled = settled.filter((item) => !settledActionIdsRef.current.has(item.id));
      settledActionIdsRef.current = new Set(settledIds);

      // Refresh once when new sync finishes, then clear synced queue entries.
      if (newlySettled.length > 0) {
        const discarded = newlySettled.find((item) => item.status === 'discarded');
        if (discarded) {
          showToast('warning', describeDiscardedQueueAction(discarded), 6500);
        }
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
    setIsOffline(!navigator.onLine);

    function onOnline() {
      setIsOffline(false);
      void loadData({ background: true });
    }
    function onOffline() { setIsOffline(true); }

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!me || me.role === 'DRIVER') return;
    void loadPublicBreakBoard(true);

    const timer = window.setInterval(() => {
      if (!document.hidden) {
        void loadPublicBreakBoard(true);
      }
    }, 15_000);

    return () => window.clearInterval(timer);
  }, [loadPublicBreakBoard, me]);

  // Keyboard shortcuts while break is active: Space → End break, Esc → Cancel break
  useEffect(() => {
    if (!activeBreak) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (shortcutConfirmPolicy || isTypingTarget(e.target)) return;

      if (e.code === 'Space') {
        e.preventDefault();
        void runAction('/breaks/end', getActiveBreakSyncFields());
      } else if (e.code === 'Escape' && canCancelActiveBreak) {
        e.preventDefault();
        void runAction('/breaks/cancel', getActiveBreakSyncFields());
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBreak, canCancelActiveBreak, loading, shortcutConfirmPolicy]);

  // Keyboard shortcuts to start break (b/w/c/1/2/3) with confirmation modal
  useEffect(() => {
    function handleBreakStartShortcut(e: KeyboardEvent) {
      if (
        e.altKey ||
        e.ctrlKey ||
        e.metaKey ||
        e.repeat ||
        shortcutConfirmPolicy ||
        !canStartBreak ||
        isTypingTarget(e.target)
      ) {
        return;
      }

      const code =
        BREAK_SHORTCUT_EVENT_CODE_TO_CODE[e.code] ||
        BREAK_SHORTCUT_KEY_TO_CODE[e.key.toLowerCase()];
      if (!code) return;

      const policy = policies.find((item) => item.code.toLowerCase() === code);
      if (!policy) return;

      e.preventDefault();
      setShortcutConfirmPolicy(policy);
    }

    window.addEventListener('keydown', handleBreakStartShortcut);
    return () => window.removeEventListener('keydown', handleBreakStartShortcut);
  }, [canStartBreak, policies, shortcutConfirmPolicy]);

  // Confirmation modal controls: Enter confirms, Escape cancels
  useEffect(() => {
    if (!shortcutConfirmPolicy) return;

    function handleConfirmKeys(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;

      if (e.key === 'Enter') {
        e.preventDefault();
        const policy = shortcutConfirmPolicy;
        if (!policy) return;
        setShortcutConfirmPolicy(null);
        void runAction('/breaks/start', { code: policy.code, ...getActiveSessionSyncFields() });
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        setShortcutConfirmPolicy(null);
      }
    }

    window.addEventListener('keydown', handleConfirmKeys);
    return () => window.removeEventListener('keydown', handleConfirmKeys);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shortcutConfirmPolicy]);


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

    if (nextMe?.role === 'DRIVER') {
      router.replace('/employee/driver');
      return;
    }

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
      breaks: () => apiFetch<BreakSession[]>('/breaks/me/today'),
      summary: () => apiFetch<MonthlySummary>('/attendance/me/summary'),
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

  function getActiveSessionSyncFields(): Record<string, unknown> {
    if (!activeSession) return {};
    if (isClientRefId(activeSession.id)) {
      return { clientDutySessionRef: activeSession.id };
    }
    return { dutySessionId: activeSession.id };
  }

  function getPunchOffSyncFields(): Record<string, unknown> {
    if (!activeSession) return {};
    if (isClientRefId(activeSession.id)) {
      return { clientDutySessionRef: activeSession.id };
    }
    return {};
  }

  function getActiveBreakSyncFields(): Record<string, unknown> {
    if (!activeBreak) return {};
    const fields: Record<string, unknown> = {};
    if (isClientRefId(activeBreak.id)) {
      fields.clientBreakRef = activeBreak.id;
    } else {
      fields.breakSessionId = activeBreak.id;
    }
    return fields;
  }

  function buildActionBody(path: string, body?: Record<string, unknown>): Record<string, unknown> | undefined {
    if (path === '/breaks/start') {
      return { ...getActiveSessionSyncFields(), ...(body || {}) };
    }
    if (path === '/breaks/end' || path === '/breaks/cancel') {
      return { ...getActiveBreakSyncFields(), ...(body || {}) };
    }
    if (path === '/attendance/off') {
      return { ...getPunchOffSyncFields(), ...(body || {}) };
    }
    return body;
  }

  async function runAction(path: string, body?: Record<string, unknown>): Promise<void> {
    setActionMessage('');
    setWarningMessage('');
    setError('');

    const knownOffline = !navigator.onLine;
    if (!knownOffline) {
      setLoading(true);
    }

    const actionBody = buildActionBody(path, body);
    const result = await runQueuedAction(path, actionBody);

    if (result.ok) {
      if (path === '/breaks/start') {
        const payload = result.data as BreakStartResult | undefined;
        if (payload?.syncStatus === 'STALE') {
          setWarningMessage('This device action was discarded because the server had already recorded the canonical break.');
          setTimeout(() => setWarningMessage(''), 6000);
        } else if (payload?.isOverLimit) {
          const rawCode = payload.breakPolicy?.code || actionBody?.code;
          const code = typeof rawCode === 'string' && rawCode.trim() ? rawCode.trim() : 'break';
          const localDate = payload.localDate || queueDate(new Date().toISOString());
          const usageText =
            typeof payload.usedCount === 'number' && typeof payload.dailyLimit === 'number'
              ? ` (${payload.usedCount}/${payload.dailyLimit})`
              : '';
          const warningText = `${code.toUpperCase()} is over session limit${usageText}. Break started anyway.`;

          setWarningMessage(warningText);
          setTimeout(() => setWarningMessage(''), 6000);

          if (consumeOverLimitToastToken(code, payload.quotaScopeId, localDate)) {
            showToast('warning', warningText, 6000);
          }
        } else {
          setActionMessage('Break started');
          setTimeout(() => setActionMessage(''), 2500);
        }
      } else {
        setActionMessage('Action completed');
        setTimeout(() => setActionMessage(''), 3000);
      }

      if (path === '/attendance/on' || path === '/attendance/off') {
        await loadTargeted(['sessions', 'breaks', 'summary']);
      } else if (path.startsWith('/breaks')) {
        await loadTargeted(['breaks']);
      } else {
        await loadData();
      }
      loadData({ background: true });
    } else if (result.queued) {
      setActionMessage('Action queued — will sync when online.');
      setTimeout(() => setActionMessage(''), 4000);
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

  function formatBreakBoardMinutes(startedAt: string): string {
    const elapsed = Math.max(0, Math.round((nowTick - new Date(startedAt).getTime()) / 60000));
    return `${elapsed}m`;
  }

  const violationAccusedOptions = useMemo(() => {
    return publicLiveSessions
      .map((session) => ({
        userId: session.userId,
        label: `${session.displayName} (${session.teamName})`,
      }))
      .filter((item) => item.userId !== me?.id);
  }, [me?.id, publicLiveSessions]);
  const canViewViolationBoard = !!me && me.role !== 'ADMIN' && me.role !== 'DRIVER';

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

  function openBreakStartConfirm(policy: BreakPolicy): void {
    setShortcutConfirmPolicy(policy);
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

  const [mealSlideX, setMealSlideX] = useState(0);
  const [mealSliding, setMealSliding] = useState(false);
  const [mealSent, setMealSent] = useState(false);
  const [mealSentTime, setMealSentTime] = useState<number | null>(null);
  const [mealRequestId, setMealRequestId] = useState<string | null>(null);
  const [mealDeliveryStatus, setMealDeliveryStatus] = useState<string | null>(null);
  const mealTrackRef = useRef<HTMLDivElement>(null);
  const mealStartXRef = useRef(0);
  const mealTrackWidthRef = useRef(0);
  const MEAL_THUMB_SIZE = 56;
  const MEAL_CONFIRM_THRESHOLD = 0.85;

  type MealDriverRequest = { id: string; status: string; purpose: string | null; driver?: { displayName: string } | null };

  useEffect(() => {
    if (me?.role !== 'CHEF') return;
    const loadActiveMealRequest = async () => {
      try {
        const reqs = await apiFetch<MealDriverRequest[]>('/driver-requests/me');
        const active = reqs.find(
          (r) => r.purpose?.includes('Ready - Pickup requested') && ['PENDING', 'APPROVED', 'IN_PROGRESS'].includes(r.status)
        );
        if (active) {
          setMealRequestId(active.id);
          setMealDeliveryStatus(active.status);
        }
      } catch { /* ignore */ }
    };
    void loadActiveMealRequest();
  }, [me?.role]);

  useEffect(() => {
    if (me?.role !== 'CHEF' || !mealRequestId) return;
    const poll = async () => {
      if (document.hidden) return;
      try {
        const reqs = await apiFetch<MealDriverRequest[]>('/driver-requests/me');
        const req = reqs.find((r) => r.id === mealRequestId);
        if (req) {
          setMealDeliveryStatus(req.status);
          if (req.status === 'COMPLETED') {
            setMealSentTime(null);
            setMealRequestId(null);
            setMealDeliveryStatus(null);
            setActionMessage('Meal delivered! You can report the next meal.');
          } else if (req.status === 'REJECTED') {
            setMealSentTime(null);
            setMealRequestId(null);
            setMealDeliveryStatus(null);
            setError('Meal request was rejected. You can try again.');
          }
        }
      } catch { /* ignore poll errors */ }
    };
    const id = setInterval(poll, 10000);
    return () => clearInterval(id);
  }, [me?.role, mealRequestId]);

  const mealBusy = mealSent || (!!mealDeliveryStatus && mealDeliveryStatus !== 'COMPLETED' && mealDeliveryStatus !== 'REJECTED') || (loading && !isOffline);

  const handleMealTouchStart = (e: React.TouchEvent) => {
    if (mealBusy) return;
    const track = mealTrackRef.current;
    if (!track) return;
    mealTrackWidthRef.current = track.getBoundingClientRect().width - MEAL_THUMB_SIZE;
    mealStartXRef.current = e.touches[0].clientX;
    setMealSliding(true);
  };

  const handleMealMouseDown = (e: React.MouseEvent) => {
    if (mealBusy) return;
    const track = mealTrackRef.current;
    if (!track) return;
    mealTrackWidthRef.current = track.getBoundingClientRect().width - MEAL_THUMB_SIZE;
    mealStartXRef.current = e.clientX;
    setMealSliding(true);
  };

  useEffect(() => {
    if (!mealSliding) return;
    const handleMove = (clientX: number) => {
      const dx = clientX - mealStartXRef.current;
      setMealSlideX(Math.max(0, Math.min(mealTrackWidthRef.current, dx)));
    };
    const onTouchMove = (e: TouchEvent) => { e.preventDefault(); handleMove(e.touches[0].clientX); };
    const onMouseMove = (e: MouseEvent) => handleMove(e.clientX);
    const onEnd = () => {
      setMealSliding(false);
      const ratio = mealSlideX / mealTrackWidthRef.current;
      if (ratio >= MEAL_CONFIRM_THRESHOLD) {
        void submitMealReady();
      } else {
        setMealSlideX(0);
      }
    };
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onEnd);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onEnd);
    return () => {
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onEnd);
    };
  }, [mealSliding, mealSlideX]);

  const submitMealReady = async () => {
    try {
      setLoading(true);
      setError('');
      const now = new Date();
      const hour = now.getHours();
      const mealName = hour < 11 ? 'Breakfast' : hour < 15 ? 'Lunch' : 'Dinner';
      const result = await apiFetch<DriverRequestCreateResult>('/driver-requests', {
        method: 'POST',
        body: JSON.stringify({
          category: 'MEAL_PICKUP',
          requestedDate: now.toISOString(),
          requestedTime: now.toTimeString().slice(0, 5),
          destination: 'Kitchen',
          purpose: `${mealName} Ready - Pickup requested`
        })
      });
      setMealSent(true);
      setMealSentTime(Date.now());
      setMealSlideX(0);
      setMealRequestId(result.id);
      setMealDeliveryStatus('PENDING');
      setActionMessage(
        result.queueState === 'NO_AVAILABLE_DRIVERS'
          ? `${mealName} reported ready! Request queued (no available driver yet).`
          : `${mealName} reported ready! Driver requested.`,
      );
      setTimeout(() => { setMealSent(false); }, 3000);
    } catch (e: any) {
      setError(e.message || 'Failed to report meal');
      setMealSlideX(0);
    } finally {
      setLoading(false);
    }
  };

  const LAST_SEEN_KEY = 'punch_notif_last_seen';
  type RequestUpdate = { id: string; type: 'shift' | 'driver'; status: string; updatedAt: string; label: string };
  const [requestUpdates, setRequestUpdates] = useState<RequestUpdate[]>([]);

  useEffect(() => {
    if (!me || me.role === 'DRIVER') return;
    const lastSeen = localStorage.getItem(LAST_SEEN_KEY) || '1970-01-01T00:00:00Z';
    const poll = async () => {
      if (document.hidden) return;
      try {
        const [shiftReqs, driverReqs, notificationFeed, unreadCount] = await Promise.all([
          apiFetch<{ id: string; status: string; updatedAt: string; requestType: string }[]>('/shifts/requests/me'),
          apiFetch<{ id: string; status: string; updatedAt: string; destination: string; purpose: string | null }[]>('/driver-requests/me'),
          fetchNotifications(25, false),
          fetchNotificationUnreadCount(),
        ]);
        setServerNotifications(notificationFeed.items);
        setServerUnreadCount(unreadCount);
        const stored = localStorage.getItem(LAST_SEEN_KEY) || lastSeen;
        const updates: RequestUpdate[] = [];
        for (const r of shiftReqs) {
          if ((r.status === 'APPROVED' || r.status === 'REJECTED') && r.updatedAt > stored) {
            updates.push({ id: `shift-${r.id}`, type: 'shift', status: r.status, updatedAt: r.updatedAt, label: `Day off request ${r.status.toLowerCase()}` });
          }
        }
        for (const r of driverReqs) {
          if ((r.status === 'APPROVED' || r.status === 'REJECTED' || r.status === 'COMPLETED') && r.updatedAt > stored) {
            const desc = r.purpose?.includes('Pickup requested') ? 'Meal request' : 'Driver request';
            updates.push({ id: `driver-${r.id}`, type: 'driver', status: r.status, updatedAt: r.updatedAt, label: `${desc} ${r.status.toLowerCase()}` });
          }
        }
        setRequestUpdates(updates);
      } catch { /* silent */ }
    };
    void poll();
    const id = setInterval(poll, 20_000);
    return () => clearInterval(id);
  }, [me]);

  const markRequestsSeen = async () => {
    localStorage.setItem(LAST_SEEN_KEY, new Date().toISOString());
    setRequestUpdates([]);
    try {
      await markAllNotificationsRead();
      setServerUnreadCount(0);
      setServerNotifications((prev) =>
        prev.map((item) => ({
          ...item,
          isRead: true,
          readAt: item.readAt || new Date().toISOString(),
        })),
      );
    } catch {
      // keep local notifications functional even if read-all fails
    }
  };

  const notifications = useMemo(() => {
    const list: { id: string; type: string; text: string; action?: boolean; link?: string }[] = [];
    if (error) list.push({ id: 'error', type: 'error', text: error });
    if (warningMessage) list.push({ id: 'warn-msg', type: 'warning', text: warningMessage });
    if (actionMessage) list.push({ id: 'msg', type: 'success', text: actionMessage });
    if (isOffline) list.push({ id: 'offline', type: 'warning', text: 'You are offline. Actions will queue and sync later.' });
    if (clockSkewMinutes !== null && Math.abs(clockSkewMinutes) >= 3) {
      list.push({ id: 'clock', type: 'warning', text: `Device clock differs from server by about ${Math.abs(clockSkewMinutes)} min${serverTimeZone ? ` (${serverTimeZone})` : ''}. Please enable automatic date/time.` });
    }
    if (pendingActions > 0) list.push({ id: 'pending', type: 'warning', text: `${pendingActions} action${pendingActions > 1 ? 's' : ''} waiting to sync…` });
    if (failedActions > 0) list.push({ id: 'failed', type: 'error', text: `${failedActions} action${failedActions > 1 ? 's' : ''} need manual retry.`, action: true });
    for (const u of requestUpdates) {
      const t = u.status === 'APPROVED' ? 'success' : u.status === 'COMPLETED' ? 'success' : 'error';
      list.push({ id: u.id, type: t, text: u.label, link: '/employee/requests' });
    }
    for (const n of serverNotifications) {
      const t = n.priority === 'URGENT' ? 'error' : n.priority === 'HIGH' ? 'warning' : 'success';
      list.push({
        id: `server-${n.id}`,
        type: t,
        text: `${n.title}: ${n.body}`,
        link: n.link || undefined,
      });
    }
    return list;
  }, [
    error,
    warningMessage,
    actionMessage,
    isOffline,
    clockSkewMinutes,
    serverTimeZone,
    pendingActions,
    failedActions,
    requestUpdates,
    serverNotifications,
  ]);

  const notificationBadgeCount = isOffline ? 0 : Math.max(notifications.length, serverUnreadCount);

  const headerAction = (
    <div className="action-menu-wrap" ref={notificationsRef}>
      <button
        type="button"
        className={`noti-bell${isOffline ? ' noti-bell-offline' : ''}`}
        onClick={() => {
          const opening = !notificationsOpen;
          setNotificationsOpen(opening);
          if (opening) {
            void markRequestsSeen();
          }
        }}
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
        {!isOffline && notificationBadgeCount > 0 && (
          <span className="noti-badge">{notificationBadgeCount}</span>
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
                <div
                  key={n.id}
                  className={`noti-item noti-item-${n.type}`}
                  style={n.link ? { cursor: 'pointer' } : undefined}
                  onClick={n.link ? () => { setNotificationsOpen(false); router.push(n.link!); } : undefined}
                >
                  <div className="noti-dot" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span className="noti-text">{n.text}</span>
                    {n.link && (
                      <span style={{ fontSize: '0.65rem', color: 'var(--muted)', marginLeft: '0.25rem' }}>View →</span>
                    )}
                    {n.action && (
                      <div style={{ display: 'flex', gap: '0.375rem', marginTop: '0.375rem' }}>
                        <button type="button" className="button button-ghost button-sm" style={{ fontSize: '0.75rem' }} onClick={retryFailedQueueActions}>
                          Retry
                        </button>
                        <button type="button" className="button button-ghost button-sm" style={{ fontSize: '0.75rem', color: 'var(--muted)' }} onClick={() => { dismissFailedActions(); setNotificationsOpen(false); }}>
                          Dismiss
                        </button>
                      </div>
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

  async function submitViolationReport(): Promise<void> {
    if (!violationAccusedUserId) {
      setError('Please select an accused user');
      return;
    }

    setViolationSubmitting(true);
    setError('');
    setActionMessage('');

    try {
      await apiFetch('/violations/reports', {
        method: 'POST',
        body: JSON.stringify({
          accusedUserId: violationAccusedUserId,
          reason: violationReason,
          note: violationNote.trim() || undefined,
        }),
      });
      setShowViolationModal(false);
      setViolationAccusedUserId('');
      setViolationReason('LEFT_WITHOUT_PUNCH');
      setViolationNote('');
      setActionMessage('Violation report submitted');
      showToast('success', 'Violation report submitted. Reporter identity is visible to Admin only.', 4500);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to submit violation report');
    } finally {
      setViolationSubmitting(false);
    }
  }

  return (
    <AppShell
      title="Dashboard"
      subtitle={me ? `${me.displayName}${me.team?.name ? ` · ${me.team.name}` : ''}` : '…'}
      userRole={me?.role}
      headerAction={headerAction}
      showNotificationBell={false}
    >
      {toast ? (
        <div className={`floating-toast floating-toast-${toast.tone}`} role="status" aria-live="polite">
          <span className="floating-toast-icon" aria-hidden="true">
            {toast.tone === 'warning' ? '⚠️' : toast.tone === 'error' ? '⛔' : '✅'}
          </span>
          <span>{toast.text}</span>
        </div>
      ) : null}

      {/* ── Leader gets a dedicated dashboard ── */}
      {me?.role === 'LEADER' ? (
        <LeaderDashboard
          activeSession={activeSession}
          activeDutyMinutes={activeDutyMinutes}
          activeBreak={activeBreak}
          activeBreakMinutes={activeBreakMinutes}
          policies={policies}
          breakSessions={breakSessions}
          monthlySummary={monthlySummary}
          loading={loading}
          isOffline={isOffline}
          runAction={runAction}
        />
      ) : (
        <>
          {/* ── Mobile punch card (Driver / Maid / Chef on phone) ── */}
          {(me?.role === 'DRIVER' || me?.role === 'MAID' || me?.role === 'CHEF') ? (
            <article className="card punch-card-mobile">
              <div className={`punch-mobile-status${activeSession ? ' on-duty' : ''}`}>
                <span className={`status-dot ${activeSession ? 'active' : 'inactive'}`} />
                {activeSession
                  ? `On Duty · ${fmtDuration(activeDutyMinutes)}`
                  : 'Off Duty'}
              </div>
              {activeSession ? (
                <button
                  type="button"
                  className="button button-danger"
                  disabled={loading}
                  onClick={() => {
                    const timeLabel = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    if (window.confirm(`Punch OFF confirmation\n\nActual recorded time will be ${timeLabel}.\n\nDo you want to continue?`)) {
                      void runAction('/attendance/off', {});
                    }
                  }}
                >
                  ⏹ Punch OFF
                </button>
              ) : (
                <button
                  type="button"
                  className="button button-ok"
                  disabled={loading}
                  onClick={() => {
                    const timeLabel = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    if (window.confirm(`Punch ON confirmation\n\nActual recorded time will be ${timeLabel}.\n\nDo you want to continue?`)) {
                      void runAction('/attendance/on', {});
                    }
                  }}
                >
                  ▶ Punch ON
                </button>
              )}
            </article>
          ) : null}

          {/* ── Monthly KPI Row (non-Leader) ── */}
          {monthlySummary && me?.role !== 'MAID' && me?.role !== 'CHEF' ? (
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

          {/* ── Today KPI Row (non-Leader) ── */}
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
            {me?.role !== 'MAID' && me?.role !== 'CHEF' ? (
              <article className="kpi">
                <p className="kpi-label">Break</p>
                <p className="kpi-value">
                  {activeBreak ? (
                    <span style={{ color: 'var(--ok)' }}>{activeBreak.breakPolicy.code.toUpperCase()}</span>
                  ) : 'None'}
                </p>
              </article>
            ) : null}
            {activeSession?.isLate && me?.role !== 'MAID' && me?.role !== 'CHEF' ? (
              <article className="kpi">
                <p className="kpi-label">Late</p>
                <p className="kpi-value" style={{ color: 'var(--danger)' }}>{activeSession.lateMinutes}m</p>
              </article>
            ) : null}
          </section>

          {/* ── Main Layout (non-Leader) ── */}
          <section className="split">
            {/* Left column — Actions */}
            <div className="grid">

              {me?.role === 'CHEF' ? (
                <article className="card">
                  <h3>🍽️ Meal Ready</h3>
                  {mealDeliveryStatus && mealDeliveryStatus !== 'COMPLETED' && mealDeliveryStatus !== 'REJECTED' && !mealSent ? (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: '0.75rem',
                      padding: '0.75rem 1rem', borderRadius: '0.75rem', marginTop: '0.5rem',
                      background: mealDeliveryStatus === 'IN_PROGRESS' ? 'rgba(59,130,246,0.1)' : mealDeliveryStatus === 'APPROVED' ? 'rgba(34,197,94,0.1)' : 'rgba(251,191,36,0.1)',
                      border: `1px solid ${mealDeliveryStatus === 'IN_PROGRESS' ? 'rgba(59,130,246,0.3)' : mealDeliveryStatus === 'APPROVED' ? 'rgba(34,197,94,0.3)' : 'rgba(251,191,36,0.3)'}`,
                    }}>
                      <span style={{ fontSize: '1.5rem' }}>
                        {mealDeliveryStatus === 'IN_PROGRESS' ? '🚗' : mealDeliveryStatus === 'APPROVED' ? '✅' : '⏳'}
                      </span>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontWeight: 600, fontSize: '0.85rem', margin: 0 }}>
                          {mealDeliveryStatus === 'PENDING' && 'Waiting for admin approval...'}
                          {mealDeliveryStatus === 'APPROVED' && 'Approved! Waiting for driver...'}
                          {mealDeliveryStatus === 'IN_PROGRESS' && 'Driver is on the way!'}
                        </p>
                        <p style={{ fontSize: '0.72rem', color: 'var(--muted)', margin: '0.125rem 0 0' }}>
                          Auto-refreshing every 10s
                        </p>
                      </div>
                      <span className={`status-dot active`} style={{ animationDuration: '1.5s' }} />
                    </div>
                  ) : (
                    <div
                      ref={mealTrackRef}
                      className="slide-track"
                      style={{
                        position: 'relative',
                        height: `${MEAL_THUMB_SIZE}px`,
                        borderRadius: `${MEAL_THUMB_SIZE / 2}px`,
                        background: mealSent
                          ? 'var(--ok)'
                          : 'linear-gradient(90deg, var(--surface-alt, #2a2a3e) 0%, var(--brand) 100%)',
                        overflow: 'hidden',
                        marginTop: '0.5rem',
                        touchAction: 'none',
                        userSelect: 'none',
                        transition: 'background 0.3s',
                      }}
                    >
                      <div
                        style={{
                          position: 'absolute',
                          inset: 0,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.85rem',
                          fontWeight: 600,
                          color: 'rgba(255,255,255,0.5)',
                          pointerEvents: 'none',
                          letterSpacing: '0.03em',
                        }}
                      >
                        {mealSent ? '✓ Sent!' : 'Slide to report meal ready →'}
                      </div>

                      <div
                        onTouchStart={handleMealTouchStart}
                        onMouseDown={handleMealMouseDown}
                        style={{
                          position: 'absolute',
                          top: 3,
                          left: 3 + mealSlideX,
                          width: MEAL_THUMB_SIZE - 6,
                          height: MEAL_THUMB_SIZE - 6,
                          borderRadius: '50%',
                          background: mealSent ? '#fff' : 'var(--brand)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '1.4rem',
                          cursor: 'grab',
                          transition: mealSliding ? 'none' : 'left 0.3s ease',
                          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                          zIndex: 2,
                        }}
                      >
                        {mealSent ? '✓' : '🍽️'}
                      </div>
                    </div>
                  )}
                </article>
              ) : null}

              {me?.role !== 'MAID' && me?.role !== 'CHEF' ? (
                <article className="card">
                  <h3>Breaks</h3>
                  {activeBreak ? (
                    <div className="break-banner">
                      <span className="status-dot active" />
                      <span><strong>{activeBreak.breakPolicy.code.toUpperCase()}</strong> · {activeBreak.breakPolicy.name}</span>
                      <span className="elapsed">{activeBreakMinutes}m</span>
                      <span style={{ color: 'var(--muted)', fontSize: '0.72rem' }}>/ {activeBreak.expectedDurationMinutes}m</span>
                      <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.3rem' }}>
                        <button className="button button-ok button-sm" disabled={loading && !isOffline} onClick={() => void runAction('/breaks/end', getActiveBreakSyncFields())} title="Space bar">
                          End <kbd style={{ fontSize: '0.6rem', opacity: 0.7, marginLeft: '0.2rem', padding: '0.1rem 0.3rem', background: 'rgba(255,255,255,0.15)', borderRadius: '3px' }}>␣</kbd>
                        </button>
                        {canCancelActiveBreak ? (
                          <button className="button button-danger button-sm" disabled={loading && !isOffline} onClick={() => void runAction('/breaks/cancel', getActiveBreakSyncFields())} title="Escape">
                            Cancel <kbd style={{ fontSize: '0.6rem', opacity: 0.7, marginLeft: '0.2rem', padding: '0.1rem 0.3rem', background: 'rgba(255,255,255,0.15)', borderRadius: '3px' }}>Esc</kbd>
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ) : (
                    <BreakChips
                      topPolicies={topRowPolicies}
                      bottomPolicies={bottomRowPolicies}
                      extraPolicies={extraPolicies}
                      disabled={(loading && !isOffline) || !activeSession || !!activeBreak}
                      blockReason={breakBlockedReason}
                      onStart={openBreakStartConfirm}
                    />
                  )}
                </article>
              ) : null}

              {canViewViolationBoard ? (
                <article className="card">
                  <h3>Who&apos;s On Break (All Teams)</h3>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <p style={{ fontSize: '0.75rem', color: 'var(--muted)', margin: 0 }}>
                      Live list updates every 15s.
                    </p>
                    <button
                      type="button"
                      className="button button-danger button-sm"
                      disabled={violationAccusedOptions.length === 0 || violationSubmitting}
                      onClick={() => {
                        if (!violationAccusedUserId && violationAccusedOptions.length > 0) {
                          setViolationAccusedUserId(violationAccusedOptions[0].userId);
                        }
                        setShowViolationModal(true);
                      }}
                    >
                      Report Violation
                    </button>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Team</th>
                          <th>Break</th>
                          <th>Start</th>
                          <th>Elapsed</th>
                        </tr>
                      </thead>
                      <tbody>
                        {publicBreakSessions.map((session) => (
                          <tr key={`${session.userId}-${session.activeBreak?.startedAt || 'none'}`}>
                            <td>
                              <AvatarName
                                displayName={session.displayName}
                                profilePhotoUrl={session.profilePhotoUrl}
                                size={30}
                              />
                            </td>
                            <td>{session.teamName}</td>
                            <td>
                              {session.activeBreak ? (
                                <span className="tag warning">{session.activeBreak.code.toUpperCase()}</span>
                              ) : '—'}
                            </td>
                            <td className="mono">
                              {session.activeBreak ? fmtTime(session.activeBreak.startedAt) : '—'}
                            </td>
                            <td>{session.activeBreak ? formatBreakBoardMinutes(session.activeBreak.startedAt) : '—'}</td>
                          </tr>
                        ))}
                        {publicBreakSessions.length === 0 ? (
                          <tr><td colSpan={5} className="table-empty">No one is on break right now</td></tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </article>
              ) : null}
            </div>

            {/* Right column — Current Session */}
            <div className="grid">
              <article className="card">
                <h3>Current Session</h3>
                <div className="table-wrap">
                  <table className="table-card-mobile">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>On</th>
                        <th>Off</th>
                        <th>Status</th>
                        {me?.role !== 'MAID' && me?.role !== 'CHEF' ? <th>Late</th> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {activeSession ? (
                        <tr>
                          <td className="mono" data-label="Date">{activeSession.shiftDate}</td>
                          <td className="mono" data-label="On">{fmtTime(activeSession.punchedOnAt)}</td>
                          <td className="mono" data-label="Off">{activeSession.punchedOffAt ? fmtTime(activeSession.punchedOffAt) : '—'}</td>
                          <td data-label="Status">
                            <span className={`tag ${activeSession.status === 'ACTIVE' ? 'ok' : ''}`}>{activeSession.status}</span>
                          </td>
                          {me?.role !== 'MAID' && me?.role !== 'CHEF' ? (
                            <td data-label="Late">{activeSession.lateMinutes > 0 ? <span className="tag danger">{activeSession.lateMinutes}m</span> : '—'}</td>
                          ) : null}
                        </tr>
                      ) : (
                        <tr><td colSpan={me?.role === 'MAID' || me?.role === 'CHEF' ? 4 : 5} className="table-empty">Not on duty</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </article>

              {me?.role !== 'MAID' && me?.role !== 'CHEF' ? (
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
              ) : null}
            </div>
          </section>


          {shortcutConfirmPolicy ? (
            <div
              className="modal-overlay"
              onClick={(event) => {
                if (event.target === event.currentTarget) {
                  setShortcutConfirmPolicy(null);
                }
              }}
            >
              <div className="modal shortcut-confirm-modal">
                <h3>Confirm Break Start</h3>
                <p style={{ marginBottom: '0.35rem' }}>
                  Start <strong>{shortcutConfirmPolicy.code.toUpperCase()}</strong> - {shortcutConfirmPolicy.name}?
                </p>
                <p style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                  Press <kbd>Enter</kbd> to confirm or <kbd>Esc</kbd> to cancel.
                </p>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="button button-ghost"
                    onClick={() => setShortcutConfirmPolicy(null)}
                  >
                    Cancel (Esc)
                  </button>
                  <button
                    type="button"
                    className="button button-primary"
                    onClick={() => {
                      const policy = shortcutConfirmPolicy;
                      if (!policy) return;
                      setShortcutConfirmPolicy(null);
                      void runAction('/breaks/start', { code: policy.code, ...getActiveSessionSyncFields() });
                    }}
                  >
                    Confirm (Enter)
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {showViolationModal ? (
            <div
              className="modal-overlay"
              onClick={(event) => {
                if (event.target === event.currentTarget && !violationSubmitting) {
                  setShowViolationModal(false);
                }
              }}
            >
              <div className="modal">
                <h3>Report Violation</h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: '0.75rem' }}>
                  Reporter identity is visible to Admin only.
                </p>
                <label style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Accused User</label>
                <select
                  className="select"
                  value={violationAccusedUserId}
                  onChange={(e) => setViolationAccusedUserId(e.target.value)}
                  disabled={violationSubmitting}
                >
                  {violationAccusedOptions.map((option) => (
                    <option key={option.userId} value={option.userId}>{option.label}</option>
                  ))}
                </select>

                <label style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '0.6rem' }}>Reason</label>
                <select
                  className="select"
                  value={violationReason}
                  onChange={(e) => setViolationReason(e.target.value as ViolationReason)}
                  disabled={violationSubmitting}
                >
                  <option value="LEFT_WITHOUT_PUNCH">Left Without Punch</option>
                  <option value="UNAUTHORIZED_ABSENCE">Unauthorized Absence</option>
                  <option value="OTHER">Other</option>
                </select>

                <label style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '0.6rem' }}>Note (optional)</label>
                <textarea
                  className="input"
                  rows={3}
                  maxLength={200}
                  value={violationNote}
                  onChange={(e) => setViolationNote(e.target.value)}
                  disabled={violationSubmitting}
                  placeholder="Short note (optional)"
                />

                <div className="modal-footer">
                  <button
                    type="button"
                    className="button button-ghost"
                    onClick={() => setShowViolationModal(false)}
                    disabled={violationSubmitting}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="button button-danger"
                    disabled={!violationAccusedUserId || violationSubmitting}
                    onClick={() => void submitViolationReport()}
                  >
                    {violationSubmitting ? 'Submitting…' : 'Submit Report'}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </>
      )}

    </AppShell>
  );
}
