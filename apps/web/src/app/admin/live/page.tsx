'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { AvatarName } from '@/components/avatar-name';
import { BreakChips } from '@/components/break-chips';
import { apiFetch } from '@/lib/api';
import {
  clearSynced,
  runQueuedAction,
  subscribeQueue,
  getQueueSnapshot,
  QueuedAction,
} from '@/lib/action-queue';

/* ── Break constants ── */
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
const BREAK_OVER_LIMIT_TOAST_SEEN_KEY = 'admin_break_over_limit_toast_seen_v1';

/* ── Types ── */
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
  breakPolicy: { code: string; name: string };
};

type LiveBreak = { id: string; breakPolicy: { code: string }; startedAt: string };
type LiveDuty = {
  id: string;
  localDate: string;
  punchedOnAt: string;
  isLate: boolean;
  lateMinutes: number;
  user: { displayName: string; profilePhotoUrl?: string | null; role?: string };
  team?: { name: string } | null;
  breakSessions: LiveBreak[];
};
type LiveBoard = {
  localDate: string;
  activeDutySessions: LiveDuty[];
  summary: { totalSessionsToday: number; totalLateMinutesToday: number };
};
type ViolationReason = 'LEFT_WITHOUT_PUNCH' | 'UNAUTHORIZED_ABSENCE' | 'OTHER';
type PublicBreakBoardSession = {
  userId: string;
  displayName: string;
  profilePhotoUrl?: string | null;
  teamName: string;
  punchedOnAt: string;
  activeBreak: {
    id: string;
    code: string;
    name: string;
    startedAt: string;
    expectedDurationMinutes: number;
  } | null;
};
type PublicLiveBoard = {
  localDate: string;
  serverNow: string;
  sessions: PublicBreakBoardSession[];
};
type BreakHistoryItem = {
  id: string;
  localDate: string;
  startedAt: string;
  endedAt?: string | null;
  expectedDurationMinutes: number;
  actualMinutes?: number | null;
  status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED' | 'AUTO_CLOSED';
  isOvertime: boolean;
  breakPolicy: { code: string; name: string };
  user: { displayName: string; profilePhotoUrl?: string | null; team?: { name: string } | null };
};

type ShiftRequestsSummary = { pending: number };
type DriverRequestsSummary = { pending: number };
type RegistrationRequestsSummary = { pending: number; readyReview: number; actionable: number };
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
type DashboardToast = {
  id: string;
  tone: 'warning' | 'success' | 'error';
  text: string;
};
type AttendanceRefreshDetail = {
  path?: '/attendance/on' | '/attendance/off';
  session?: DutySession;
};

function queueDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? new Date().toISOString().slice(0, 10) : d.toISOString().slice(0, 10);
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

export default function AdminLivePage() {
  const router = useRouter();

  /* ── Monitoring state ── */
  const [data, setData] = useState<LiveBoard | null>(null);
  const [breakHistory, setBreakHistory] = useState<BreakHistoryItem[]>([]);
  const [error, setError] = useState('');
  const [breakBoardError, setBreakBoardError] = useState('');
  const [nowTick, setNowTick] = useState(0);
  const [pendingShifts, setPendingShifts] = useState(0);
  const [pendingDrivers, setPendingDrivers] = useState(0);
  const [pendingSignups, setPendingSignups] = useState(0);
  const [publicBreakSessions, setPublicBreakSessions] = useState<PublicBreakBoardSession[]>([]);
  const [publicBoardOffsetMs, setPublicBoardOffsetMs] = useState(0);
  const [showObservedModal, setShowObservedModal] = useState(false);
  const [observedAccusedUserId, setObservedAccusedUserId] = useState('');
  const [observedReason, setObservedReason] = useState<ViolationReason>('LEFT_WITHOUT_PUNCH');
  const [observedNote, setObservedNote] = useState('');
  const [violationActionId, setViolationActionId] = useState<string | null>(null);
  const [showActiveSessions, setShowActiveSessions] = useState(true);
  const [showTodayBreakHistory, setShowTodayBreakHistory] = useState(true);

  /* ── Personal duty/break state ── */
  const [sessions, setSessions] = useState<DutySession[]>([]);
  const [policies, setPolicies] = useState<BreakPolicy[]>([]);
  const [breakSessions, setBreakSessions] = useState<BreakSession[]>([]);
  const [personalLoading, setPersonalLoading] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [actionMsg, setActionMsg] = useState('');
  const [queueActions, setQueueActions] = useState<QueuedAction[]>([]);
  const [toast, setToast] = useState<DashboardToast | null>(null);
  const [shortcutConfirmPolicy, setShortcutConfirmPolicy] = useState<BreakPolicy | null>(null);
  const settledIdsRef = useRef<Set<string>>(new Set());
  const toastTimerRef = useRef<number | null>(null);
  const attendanceRefreshRef = useRef<() => void>(() => undefined);

  function showToast(
    tone: DashboardToast['tone'],
    text: string,
    durationMs = 5500
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

  const serverActiveSession = useMemo(() => sessions.find(s => s.status === 'ACTIVE') || null, [sessions]);
  const serverActiveBreak = useMemo(() => breakSessions.find(b => b.status === 'ACTIVE') || null, [breakSessions]);

  const { activeSession, activeBreak } = useMemo(() => {
    const pending = queueActions
      .filter(a => a.status === 'pending' || a.status === 'syncing')
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    let projectedSession: DutySession | null = serverActiveSession;
    let projectedBreak: BreakSession | null = serverActiveBreak;

    for (const action of pending) {
      if (action.path === '/attendance/on') {
        if (!projectedSession) {
          const date = queueDate(action.clientTimestamp);
          const clientDutySessionRef =
            typeof action.body?.clientDutySessionRef === 'string'
              ? action.body.clientDutySessionRef
              : `duty-${action.id}`;
          projectedSession = { id: clientDutySessionRef, shiftDate: date, localDate: date, punchedOnAt: action.clientTimestamp, status: 'ACTIVE', isLate: false, lateMinutes: 0, overtimeMinutes: 0 };
        }
        continue;
      }
      if (action.path === '/attendance/off') { projectedSession = null; projectedBreak = null; continue; }
      if (action.path === '/breaks/start') {
        if (projectedSession && !projectedBreak) {
          const rawCode = action.body?.code;
          const code = typeof rawCode === 'string' ? rawCode : 'break';
          const policy = policies.find(p => p.code.toLowerCase() === code.toLowerCase());
          const clientBreakRef =
            typeof action.body?.clientBreakRef === 'string'
              ? action.body.clientBreakRef
              : `break-${action.id}`;
          projectedBreak = { id: clientBreakRef, localDate: queueDate(action.clientTimestamp), dutySessionId: projectedSession.id, startedAt: action.clientTimestamp, expectedDurationMinutes: policy?.expectedDurationMinutes ?? 10, status: 'ACTIVE', isOvertime: false, breakPolicy: { code: policy?.code || code, name: policy?.name || 'Queued Break' } };
        }
        continue;
      }
      if (action.path === '/breaks/end' || action.path === '/breaks/cancel') { projectedBreak = null; }
    }
    return { activeSession: projectedSession, activeBreak: projectedBreak };
  }, [queueActions, serverActiveSession, serverActiveBreak, policies]);

  const activeBreakMinutes = useMemo(() => {
    if (!activeBreak) return 0;
    return Math.max(0, Math.round((nowTick - new Date(activeBreak.startedAt).getTime()) / 60000));
  }, [activeBreak, nowTick]);
  const canCancelActiveBreak = !!activeBreak && activeBreakMinutes < 2;

  const topRowPolicies = useMemo(() =>
    TOP_BREAK_CODES.map(code => policies.find(p => p.code.toLowerCase() === code)).filter((p): p is BreakPolicy => Boolean(p)),
    [policies]
  );
  const bottomRowPolicies = useMemo(() =>
    BOTTOM_BREAK_CODES.map(code => policies.find(p => p.code.toLowerCase() === code)).filter((p): p is BreakPolicy => Boolean(p)),
    [policies]
  );
  const extraPolicies = useMemo(() =>
    policies.filter(p => !FIXED_BREAK_CODES.has(p.code.toLowerCase())).sort((a, b) => a.code.localeCompare(b.code)),
    [policies]
  );

  const breakBlockedReason = useMemo(() => {
    if (!activeSession) return 'Punch ON first';
    if (activeBreak) return `Active break (${activeBreak.breakPolicy.code.toUpperCase()}) — end it first`;
    if (policies.length === 0) return 'No break policies configured';
    return '';
  }, [activeBreak, activeSession, policies.length]);
  const canStartBreak = !!activeSession && !activeBreak && !((personalLoading && !isOffline));

  const sessionBreaks = useMemo(() => {
    if (!activeSession) return [];
    const linked = breakSessions.filter(b => b.dutySessionId === activeSession.id);
    if (!activeBreak) return linked;
    const hasActive = linked.some(b => b.id === activeBreak.id);
    return hasActive ? linked : [activeBreak, ...linked];
  }, [breakSessions, activeBreak, activeSession]);

  /* ── Load personal data ── */
  async function loadPersonal(background = false) {
    if (!background) setPersonalLoading(true);
    const [sessResult, polResult, brResult] = await Promise.allSettled([
      apiFetch<DutySession[]>('/attendance/me/today'),
      apiFetch<BreakPolicy[]>('/breaks/policies'),
      apiFetch<BreakSession[]>('/breaks/me/today'),
    ]);
    if (sessResult.status === 'fulfilled') setSessions(sessResult.value);
    if (polResult.status === 'fulfilled') setPolicies(polResult.value);
    if (brResult.status === 'fulfilled') setBreakSessions(brResult.value);
    if (!background) setPersonalLoading(false);
  }

  attendanceRefreshRef.current = () => {
    void loadPersonal(true);
  };

  function getActiveSessionSyncFields(): Record<string, unknown> {
    if (!activeSession) return {};
    if (isClientRefId(activeSession.id)) {
      return { clientDutySessionRef: activeSession.id };
    }
    return { dutySessionId: activeSession.id };
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
    return body;
  }

  /* ── Queue subscription ── */
  useEffect(() => {
    const init = getQueueSnapshot();
    setQueueActions(init);
    settledIdsRef.current = new Set(init.filter(a => a.status === 'synced' || a.status === 'discarded').map(a => a.id));
    const unsub = subscribeQueue((q: QueuedAction[]) => {
      setQueueActions(q);
      const settled = q.filter(a => a.status === 'synced' || a.status === 'discarded');
      const newlySettled = settled.filter(a => !settledIdsRef.current.has(a.id));
      settledIdsRef.current = new Set(settled.map(a => a.id));
      if (newlySettled.length > 0) {
        const discarded = newlySettled.find((item) => item.status === 'discarded');
        if (discarded) {
          showToast('warning', describeDiscardedQueueAction(discarded), 6500);
        }
        void loadPersonal(true);
        clearSynced();
      }
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handleAttendanceRefresh = (event: Event) => {
      const detail = (event as CustomEvent<AttendanceRefreshDetail>).detail;
      if (detail?.session && detail.path) {
        setSessions((current) => {
          if (detail.path === '/attendance/on') {
            return [
              detail.session as DutySession,
              ...current.filter((session) => session.id !== detail.session?.id && session.status !== 'ACTIVE'),
            ];
          }

          return current.map((session) =>
            session.id === detail.session?.id ? ({ ...session, ...detail.session } as DutySession) : session,
          );
        });

        if (detail.path === '/attendance/off') {
          setBreakSessions((current) =>
            current.filter((session) => !(session.status === 'ACTIVE' && session.dutySessionId === detail.session?.id)),
          );
        }
      }

      attendanceRefreshRef.current();
    };
    window.addEventListener('attendance:refresh', handleAttendanceRefresh);
    return () => window.removeEventListener('attendance:refresh', handleAttendanceRefresh);
  }, []);

  /* ── Online/Offline ── */
  useEffect(() => {
    setIsOffline(!navigator.onLine);
    const onOnline = () => { setIsOffline(false); void loadPersonal(true); };
    const onOffline = () => setIsOffline(true);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Personal action runner ── */
  async function runAction(path: string, body?: Record<string, unknown>) {
    setActionMsg('');
    setError('');
    if (!navigator.onLine) { /* queue will handle it */ }
    else setPersonalLoading(true);

    const actionBody = buildActionBody(path, body);
    const result = await runQueuedAction(path, actionBody);
    if (result.ok) {
      if (path === '/breaks/start') {
        const payload = result.data as BreakStartResult | undefined;
        if (payload?.syncStatus === 'STALE') {
          setActionMsg('This device action was discarded because the server had already recorded the canonical break.');
          setTimeout(() => setActionMsg(''), 6000);
        } else if (payload?.isOverLimit) {
          const rawCode = payload.breakPolicy?.code || actionBody?.code;
          const code = typeof rawCode === 'string' && rawCode.trim() ? rawCode.trim() : 'break';
          const localDate = payload.localDate || queueDate(new Date().toISOString());
          const usageText =
            typeof payload.usedCount === 'number' && typeof payload.dailyLimit === 'number'
              ? ` (${payload.usedCount}/${payload.dailyLimit})`
              : '';
          const warningText = `${code.toUpperCase()} is over session limit${usageText}. Break started anyway.`;

          setActionMsg(warningText);
          setTimeout(() => setActionMsg(''), 6000);
          if (consumeOverLimitToastToken(code, payload.quotaScopeId, localDate)) {
            showToast('warning', warningText, 6000);
          }
        } else {
          setActionMsg('Break started');
          setTimeout(() => setActionMsg(''), 2500);
        }
      } else {
        setActionMsg('Done');
        setTimeout(() => setActionMsg(''), 3000);
      }
      if (path.startsWith('/breaks')) {
        const br = await apiFetch<BreakSession[]>('/breaks/me/today').catch(() => null);
        if (br) setBreakSessions(br);
      } else {
        const [sess, br] = await Promise.allSettled([
          apiFetch<DutySession[]>('/attendance/me/today'),
          apiFetch<BreakSession[]>('/breaks/me/today'),
        ]);
        if (sess.status === 'fulfilled') setSessions(sess.value);
        if (br.status === 'fulfilled') setBreakSessions(br.value);
      }
      void loadPersonal(true);
    } else if (result.queued) {
      setActionMsg('Queued — will sync when online.');
      setTimeout(() => setActionMsg(''), 4000);
    } else {
      setError(result.error || 'Action failed');
    }
    setPersonalLoading(false);
  }

  // Keyboard shortcuts while break is active: Space => End break, Esc => Cancel break (within 2 min)
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
  }, [activeBreak, canCancelActiveBreak, shortcutConfirmPolicy]);

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
  }, [shortcutConfirmPolicy]);

  function openBreakStartConfirm(policy: BreakPolicy): void {
    setShortcutConfirmPolicy(policy);
  }

  /* ── Monitoring load ── */
  useEffect(() => {
    setNowTick(Date.now());
    void loadPersonal();
    void load();
    const refreshTimer = window.setInterval(() => {
      if (!document.hidden) {
        void load();
        void loadPersonal(true);
      }
    }, 15000);
    const tickTimer = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => { window.clearInterval(refreshTimer); window.clearInterval(tickTimer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load(): Promise<void> {
    const [mainResult, publicBoardResult] = await Promise.allSettled([
      Promise.all([
        apiFetch<LiveBoard>('/attendance/admin/live'),
        apiFetch<BreakHistoryItem[]>(`/breaks/admin/history?from=${encodeURIComponent(new Date().toISOString().slice(0, 10))}&to=${encodeURIComponent(new Date().toISOString().slice(0, 10))}&limit=250`),
        apiFetch<ShiftRequestsSummary>('/admin/requests/summary'),
        apiFetch<DriverRequestsSummary>('/admin/driver-requests/summary'),
        apiFetch<RegistrationRequestsSummary>('/admin/registration-requests/summary'),
      ]),
      apiFetch<PublicLiveBoard>('/attendance/live/board'),
    ]);

    if (mainResult.status === 'fulfilled') {
      const [live, history, shifts, drivers, signups] = mainResult.value;
      setData(live);
      setBreakHistory(history);
      setPendingShifts(shifts.pending);
      setPendingDrivers(drivers.pending);
      setPendingSignups(signups.actionable);
      setError('');
    } else {
      setError(mainResult.reason instanceof Error ? mainResult.reason.message : 'Failed to load');
    }

    if (publicBoardResult.status === 'fulfilled') {
      setPublicBreakSessions(publicBoardResult.value.sessions.filter((session) => session.activeBreak));
      setPublicBoardOffsetMs(new Date(publicBoardResult.value.serverNow).getTime() - Date.now());
      setBreakBoardError('');
    } else {
      setPublicBreakSessions([]);
      setBreakBoardError(publicBoardResult.reason instanceof Error ? publicBoardResult.reason.message : 'Failed to load break board');
    }
  }

  function fmtTime(iso: string): string {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  function formatHistoryMinutes(item: BreakHistoryItem): string {
    if (item.actualMinutes !== null && item.actualMinutes !== undefined) return `${item.actualMinutes}m`;
    if (item.status === 'ACTIVE') return `${Math.max(0, Math.round((nowTick - new Date(item.startedAt).getTime()) / 60000))}m`;
    return '-';
  }

  function breakBoardElapsedMinutes(startedAt: string): number {
    const startedMs = new Date(startedAt).getTime();
    if (Number.isNaN(startedMs)) return 0;
    const referenceMs = nowTick + publicBoardOffsetMs;
    return Math.max(0, Math.floor(referenceMs / 60000) - Math.floor(startedMs / 60000));
  }

  function sessionBreakMin(b: BreakSession) {
    if (b.actualMinutes != null) return `${b.actualMinutes}m`;
    if (b.status === 'ACTIVE') return `${Math.max(0, Math.round((nowTick - new Date(b.startedAt).getTime()) / 60000))}m`;
    return '-';
  }

  function openObservedModalForSession(session: PublicBreakBoardSession): void {
    setObservedAccusedUserId(session.userId);
    setObservedReason('UNAUTHORIZED_ABSENCE');
    setObservedNote('');
    setShowObservedModal(true);
  }

  function notifyPendingBadgesRefresh(): void {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('pending-badges:refresh'));
  }

  async function submitObservedViolation(): Promise<void> {
    if (!observedAccusedUserId) {
      setError('Please select an accused user');
      return;
    }
    setViolationActionId('observed-create');
    setError('');
    try {
      await apiFetch('/admin/violations/observed', {
        method: 'POST',
        body: JSON.stringify({
          accusedUserId: observedAccusedUserId,
          reason: observedReason,
          note: observedNote.trim() || undefined,
        }),
      });
      setShowObservedModal(false);
      setObservedAccusedUserId('');
      setObservedReason('LEFT_WITHOUT_PUNCH');
      setObservedNote('');
      notifyPendingBadgesRefresh();
      showToast('success', 'Observed incident created');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create observed incident');
    } finally {
      setViolationActionId(null);
    }
  }

  const totalPending = pendingShifts + pendingDrivers;
  const publicBreakOptions = useMemo(
    () =>
      publicBreakSessions.map((session) => ({
        userId: session.userId,
        label: `${session.displayName} · ${session.teamName}`,
      })),
    [publicBreakSessions],
  );

  return (
    <AppShell title="Dashboard" subtitle="Real-time overview" admin userRole="ADMIN">
      {toast ? (
        <div className={`floating-toast floating-toast-${toast.tone}`} role="status" aria-live="polite">
          <span className="floating-toast-icon" aria-hidden="true">
            {toast.tone === 'warning' ? '⚠️' : toast.tone === 'error' ? '⛔' : '✅'}
          </span>
          <span>{toast.text}</span>
        </div>
      ) : null}
      <div className="dash-layout">
        {error ? <div className="alert alert-error">{error}</div> : null}

        {/* ═══ MY DUTY & BREAKS ═══ */}
        <section className="dash-section">
          <h2 className="dash-section-title">🧑‍💼 My Breaks</h2>

          {actionMsg ? <div className="alert alert-success" style={{ marginBottom: '0.5rem' }}>{actionMsg}</div> : null}

          {/* Break buttons */}
          <article className="card">
            <h3>Breaks</h3>
            {activeBreak ? (
              <div className="break-banner">
                <span className="status-dot active" />
                <span><strong>{activeBreak.breakPolicy.code.toUpperCase()}</strong> · {activeBreak.breakPolicy.name}</span>
                <span className="elapsed">{activeBreakMinutes}m</span>
                <span style={{ color: 'var(--muted)', fontSize: '0.72rem' }}>/ {activeBreak.expectedDurationMinutes}m</span>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.3rem' }}>
                  <button className="button button-ok button-sm" disabled={personalLoading && !isOffline} onClick={() => void runAction('/breaks/end', getActiveBreakSyncFields())}>
                    End <kbd style={{ fontSize: '0.6rem', opacity: 0.7, marginLeft: '0.2rem', padding: '0.1rem 0.3rem', background: 'rgba(255,255,255,0.15)', borderRadius: '3px' }}>␣</kbd>
                  </button>
                  {canCancelActiveBreak ? (
                    <button className="button button-danger button-sm" disabled={personalLoading && !isOffline} onClick={() => void runAction('/breaks/cancel', getActiveBreakSyncFields())}>
                      Cancel <kbd style={{ fontSize: '0.6rem', opacity: 0.7, marginLeft: '0.2rem', padding: '0.1rem 0.3rem', background: 'rgba(255,255,255,0.15)', borderRadius: '3px' }}>Esc</kbd>
                    </button>
                  ) : null}
                </div>
              </div>
            ) : (
              <>
                <BreakChips
                  topPolicies={topRowPolicies}
                  bottomPolicies={bottomRowPolicies}
                  extraPolicies={extraPolicies}
                  disabled={(personalLoading && !isOffline) || !activeSession || !!activeBreak}
                  blockReason={breakBlockedReason}
                  onStart={openBreakStartConfirm}
                />
              </>
            )}

            {/* Session breaks log */}
            {sessionBreaks.length > 0 ? (
              <div className="table-wrap" style={{ marginTop: '0.75rem' }}>
                <table>
                  <thead><tr><th>Code</th><th>Start</th><th>Min</th><th>Status</th></tr></thead>
                  <tbody>
                    {sessionBreaks.map(b => (
                      <tr key={b.id}>
                        <td><span className="tag">{b.breakPolicy.code.toUpperCase()}</span></td>
                        <td className="mono">{fmtTime(b.startedAt)}</td>
                        <td>{sessionBreakMin(b)}</td>
                        <td>
                          {b.status === 'CANCELLED' ? <span className="tag danger">Cancelled</span>
                            : b.status === 'ACTIVE' ? <span className="tag ok">Active</span>
                              : b.isOvertime ? <span className="tag warning">Late</span>
                                : <span className="tag brand">On time</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </article>
        </section>

        {/* ═══ KPIs ═══ */}
        <section className="kpi-grid">
          <article className="kpi">
            <p className="kpi-label">Date</p>
            <p className="kpi-value mono">{data?.localDate || '—'}</p>
          </article>
          <article className="kpi">
            <p className="kpi-label">Active Now</p>
            <p className="kpi-value" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              {(data?.activeDutySessions.length || 0) > 0 && <span className="status-dot active" />}
              {data?.activeDutySessions.length || 0}
            </p>
          </article>
          <article className="kpi">
            <p className="kpi-label">Total Today</p>
            <p className="kpi-value">{data?.summary.totalSessionsToday || 0}</p>
          </article>
          <article className="kpi">
            <p className="kpi-label">Late</p>
            <p className="kpi-value" style={{ color: (data?.summary.totalLateMinutesToday || 0) > 0 ? 'var(--danger)' : undefined }}>
              {data?.summary.totalLateMinutesToday || 0}m
            </p>
          </article>
          <article
            className="kpi"
            style={{ cursor: totalPending > 0 ? 'pointer' : undefined }}
            onClick={() => { if (totalPending > 0) router.push('/admin/requests'); }}
          >
            <p className="kpi-label">Requests</p>
            <p className="kpi-value" style={{ color: totalPending > 0 ? 'var(--danger)' : undefined }}>
              {totalPending}
            </p>
          </article>
          <article
            className="kpi"
            style={{ cursor: pendingSignups > 0 ? 'pointer' : undefined }}
            onClick={() => { if (pendingSignups > 0) router.push('/admin/users?section=registrations'); }}
          >
            <p className="kpi-label">Signups</p>
            <p className="kpi-value" style={{ color: pendingSignups > 0 ? 'var(--warning)' : undefined }}>
              {pendingSignups}
            </p>
          </article>
        </section>

        {/* ═══ Active Sessions ═══ */}
        <section className="dash-section">
          <div className="dash-collapse-header" onClick={() => setShowActiveSessions((v) => !v)}>
            <h2 className="dash-section-title" style={{ marginBottom: 0 }}>🟢 Active Sessions</h2>
            <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{showActiveSessions ? '▲ Hide' : '▼ Show'}</span>
          </div>
          {showActiveSessions ? (
            <article className="card">
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th>Group</th>
                      <th>Role</th>
                      <th>Punched On</th>
                      <th>Late</th>
                      <th>Break</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data?.activeDutySessions.map((session) => (
                      <tr key={session.id}>
                        <td>
                          <AvatarName
                            displayName={session.user.displayName}
                            profilePhotoUrl={session.user.profilePhotoUrl}
                            subtitle={session.user.role || null}
                          />
                        </td>
                        <td>{session.team?.name ? <span className="tag brand">{session.team.name}</span> : <span className="tag">Service</span>}</td>
                        <td>{session.user.role ? <span className={`tag role-${session.user.role.toLowerCase()}`}>{session.user.role}</span> : '—'}</td>
                        <td className="mono">{fmtTime(session.punchedOnAt)}</td>
                        <td>
                          {session.lateMinutes > 0 ? (
                            <span className="tag danger">{session.lateMinutes}m</span>
                          ) : (
                            <span className="tag ok">OK</span>
                          )}
                        </td>
                        <td>
                          {session.breakSessions.length > 0 ? (
                            <span className="tag warning">
                              {session.breakSessions[0].breakPolicy.code.toUpperCase()} · {fmtTime(session.breakSessions[0].startedAt)}
                            </span>
                          ) : '—'}
                        </td>
                      </tr>
                    ))}
                    {!data?.activeDutySessions.length ? (
                      <tr><td colSpan={6} className="table-empty">No active sessions</td></tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </article>
          ) : null}
        </section>

        <section className="dash-section">
          <h2 className="dash-section-title">⏱️ Who&apos;s On Break Now</h2>
          <article className="card">
            <p style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: 0, marginBottom: '0.6rem' }}>
              All active breaks across all teams. Open an observed-incident case from here when needed.
            </p>
            {breakBoardError ? (
              <div className="alert alert-warning" style={{ marginBottom: '0.75rem' }}>{breakBoardError}</div>
            ) : null}
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Team</th>
                    <th>Break</th>
                    <th>Start</th>
                    <th>Elapsed</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {publicBreakSessions.map((session) => {
                    const activeBreak = session.activeBreak;
                    if (!activeBreak) return null;
                    const elapsedMinutes = breakBoardElapsedMinutes(activeBreak.startedAt);
                    const isOverdue = elapsedMinutes > activeBreak.expectedDurationMinutes;
                    return (
                      <tr key={activeBreak.id}>
                        <td>
                          <AvatarName
                            displayName={session.displayName}
                            profilePhotoUrl={session.profilePhotoUrl}
                          />
                        </td>
                        <td>{session.teamName}</td>
                        <td><span className="tag warning">{activeBreak.code.toUpperCase()}</span></td>
                        <td className="mono">{fmtTime(activeBreak.startedAt)}</td>
                        <td>{elapsedMinutes}m / {activeBreak.expectedDurationMinutes}m</td>
                        <td>
                          <span className={`tag ${isOverdue ? 'danger' : 'ok'}`}>
                            {isOverdue ? 'Overdue' : 'Active'}
                          </span>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="button button-danger button-sm"
                            onClick={() => openObservedModalForSession(session)}
                          >
                            Observed Incident
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {publicBreakSessions.length === 0 ? (
                    <tr><td colSpan={7} className="table-empty">No one is on break right now</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </article>
        </section>

        {/* ═══ Break History ═══ */}
        <section className="dash-section">
          <div className="dash-collapse-header" onClick={() => setShowTodayBreakHistory((v) => !v)}>
            <h2 className="dash-section-title" style={{ marginBottom: 0 }}>☕ Today Break History</h2>
            <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{showTodayBreakHistory ? '▲ Hide' : '▼ Show'}</span>
          </div>
          {showTodayBreakHistory ? (
            <article className="card">
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th>Group</th>
                      <th>Code</th>
                      <th>Start</th>
                      <th>End</th>
                      <th>Min</th>
                      <th>Status</th>
                      <th>OT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {breakHistory.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <AvatarName
                            displayName={item.user.displayName}
                            profilePhotoUrl={item.user.profilePhotoUrl}
                            subtitle={item.user.team?.name || null}
                          />
                        </td>
                        <td>{item.user.team?.name ? <span className="tag brand">{item.user.team.name}</span> : '—'}</td>
                        <td><span className="tag">{item.breakPolicy.code.toUpperCase()}</span></td>
                        <td className="mono">{fmtTime(item.startedAt)}</td>
                        <td className="mono">{item.endedAt ? fmtTime(item.endedAt) : '—'}</td>
                        <td>{formatHistoryMinutes(item)}</td>
                        <td>
                          <span className={`tag ${item.status === 'ACTIVE' ? 'ok' : item.status === 'CANCELLED' ? 'danger' : ''}`}>
                            {item.status}
                          </span>
                        </td>
                        <td>{item.isOvertime ? <span className="tag warning">Yes</span> : '—'}</td>
                      </tr>
                    ))}
                    {breakHistory.length === 0 ? (
                      <tr><td colSpan={8} className="table-empty">No breaks today</td></tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </article>
          ) : null}
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

        {showObservedModal ? (
          <div
            className="modal-overlay"
            onClick={(event) => {
              if (event.target === event.currentTarget && !violationActionId) {
                setShowObservedModal(false);
              }
            }}
          >
            <div className="modal">
              <h3>Create Observed Incident</h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: '0.6rem' }}>
                Open a violation case from the live break board. Final confirmation still happens in Requests.
              </p>
              <label style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Accused User</label>
              <select
                className="select"
                value={observedAccusedUserId}
                onChange={(e) => setObservedAccusedUserId(e.target.value)}
                disabled={!!violationActionId}
              >
                {publicBreakOptions.map((option) => (
                  <option key={option.userId} value={option.userId}>{option.label}</option>
                ))}
              </select>

              <label style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '0.6rem' }}>Reason</label>
              <select
                className="select"
                value={observedReason}
                onChange={(e) => setObservedReason(e.target.value as ViolationReason)}
                disabled={!!violationActionId}
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
                value={observedNote}
                onChange={(e) => setObservedNote(e.target.value)}
                disabled={!!violationActionId}
                placeholder="Short note (optional)"
              />

              <div className="modal-footer">
                <button
                  type="button"
                  className="button button-ghost"
                  onClick={() => setShowObservedModal(false)}
                  disabled={!!violationActionId}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="button button-danger"
                  disabled={!observedAccusedUserId || !!violationActionId}
                  onClick={() => void submitObservedViolation()}
                >
                  {violationActionId === 'observed-create' ? 'Submitting…' : 'Submit Incident'}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
