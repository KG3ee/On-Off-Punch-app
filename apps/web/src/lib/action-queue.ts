'use client';

import { apiFetch } from './api';

const QUEUE_KEY = 'punch_action_queue';
const CLIENT_DEVICE_KEY = 'punch_client_device_id';
const CLIENT_REF_MAP_KEY = 'punch_client_ref_map_v1';
const RETRY_INTERVAL_MS = 5_000;
const BASE_RETRY_DELAY_MS = 3_000;
const MAX_RETRY_DELAY_MS = 30_000;
const MAX_ACTION_AGE_MS = 24 * 60 * 60_000;
const ACTION_TIMEOUT_MS = 6_000;

type SyncStatus = 'APPLIED' | 'IDEMPOTENT' | 'STALE';

type QueueSyncResult = {
  syncStatus?: SyncStatus;
  syncReason?: string | null;
  dutySessionId?: string | null;
  breakSessionId?: string | null;
  clientDutySessionRef?: string | null;
  clientBreakRef?: string | null;
};

type ActionBody = Record<string, unknown> & {
  clientTimestamp?: string;
  clientActionId?: string;
  clientDeviceId?: string;
  clientDutySessionRef?: string;
  clientBreakRef?: string;
  dutySessionId?: string;
  breakSessionId?: string;
};

export type QueuedAction = {
  id: string;
  path: string;
  method: string;
  body: ActionBody;
  clientTimestamp: string;
  status: 'pending' | 'syncing' | 'synced' | 'discarded' | 'failed';
  retries: number;
  serverRetries?: number;
  createdAt: string;
  nextRetryAt?: string;
  error?: string;
  result?: QueueSyncResult;
};

type ClientRefMap = {
  dutySessions: Record<string, string>;
  breakSessions: Record<string, string>;
};

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function loadQueue(): QueuedAction[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]') as QueuedAction[];
  } catch {
    return [];
  }
}

function saveQueue(queue: QueuedAction[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

function loadRefMap(): ClientRefMap {
  if (typeof window === 'undefined') {
    return { dutySessions: {}, breakSessions: {} };
  }
  try {
    const parsed = JSON.parse(localStorage.getItem(CLIENT_REF_MAP_KEY) || '{}') as Partial<ClientRefMap>;
    return {
      dutySessions: parsed.dutySessions || {},
      breakSessions: parsed.breakSessions || {},
    };
  } catch {
    return { dutySessions: {}, breakSessions: {} };
  }
}

function saveRefMap(refMap: ClientRefMap): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(CLIENT_REF_MAP_KEY, JSON.stringify(refMap));
}

function getClientDeviceId(): string {
  if (typeof window === 'undefined') return 'server';
  const existing = localStorage.getItem(CLIENT_DEVICE_KEY);
  if (existing) return existing;
  const next = `device-${uid()}`;
  localStorage.setItem(CLIENT_DEVICE_KEY, next);
  return next;
}

function buildActionBody(path: string, body: Record<string, unknown> | undefined, clientTimestamp: string): ActionBody {
  const nextBody: ActionBody = {
    ...(body || {}),
    clientTimestamp,
  };
  if (typeof nextBody.clientActionId !== 'string' || !nextBody.clientActionId) {
    nextBody.clientActionId = `action-${uid()}`;
  }
  if (typeof nextBody.clientDeviceId !== 'string' || !nextBody.clientDeviceId) {
    nextBody.clientDeviceId = getClientDeviceId();
  }
  if (path === '/attendance/on' && (typeof nextBody.clientDutySessionRef !== 'string' || !nextBody.clientDutySessionRef)) {
    nextBody.clientDutySessionRef = `duty-${nextBody.clientActionId}`;
  }
  if (path === '/breaks/start' && (typeof nextBody.clientBreakRef !== 'string' || !nextBody.clientBreakRef)) {
    nextBody.clientBreakRef = `break-${nextBody.clientActionId}`;
  }
  return nextBody;
}

function extractSyncResult(payload: unknown): QueueSyncResult {
  if (!payload || typeof payload !== 'object') {
    return {};
  }
  const source = payload as Record<string, unknown>;
  return {
    syncStatus: typeof source.syncStatus === 'string' ? (source.syncStatus as SyncStatus) : undefined,
    syncReason: typeof source.syncReason === 'string' ? source.syncReason : null,
    dutySessionId: typeof source.dutySessionId === 'string' ? source.dutySessionId : null,
    breakSessionId: typeof source.breakSessionId === 'string' ? source.breakSessionId : null,
    clientDutySessionRef: typeof source.clientDutySessionRef === 'string' ? source.clientDutySessionRef : null,
    clientBreakRef: typeof source.clientBreakRef === 'string' ? source.clientBreakRef : null,
  };
}

function rememberResolvedRefs(body: ActionBody, payload: unknown): QueueSyncResult {
  const result = extractSyncResult(payload);
  const refMap = loadRefMap();
  let changed = false;

  const dutyRef = result.clientDutySessionRef || (typeof body.clientDutySessionRef === 'string' ? body.clientDutySessionRef : null);
  const dutyId = result.dutySessionId || (typeof body.dutySessionId === 'string' ? body.dutySessionId : null);
  if (dutyRef && dutyId && refMap.dutySessions[dutyRef] !== dutyId) {
    refMap.dutySessions[dutyRef] = dutyId;
    changed = true;
  }

  const breakRef = result.clientBreakRef || (typeof body.clientBreakRef === 'string' ? body.clientBreakRef : null);
  const breakId = result.breakSessionId || (typeof body.breakSessionId === 'string' ? body.breakSessionId : null);
  if (breakRef && breakId && refMap.breakSessions[breakRef] !== breakId) {
    refMap.breakSessions[breakRef] = breakId;
    changed = true;
  }

  if (changed) {
    saveRefMap(refMap);
  }

  return result;
}

function hydrateActionBody(action: QueuedAction): { body: ActionBody; changed: boolean } {
  const body: ActionBody = { ...action.body };
  const refMap = loadRefMap();
  let changed = false;

  if (
    action.path === '/breaks/start' &&
    typeof body.clientDutySessionRef === 'string' &&
    !body.dutySessionId
  ) {
    const resolved = refMap.dutySessions[body.clientDutySessionRef];
    if (resolved) {
      body.dutySessionId = resolved;
      changed = true;
    }
  }

  if (
    (action.path === '/breaks/end' || action.path === '/breaks/cancel') &&
    typeof body.clientBreakRef === 'string' &&
    !body.breakSessionId
  ) {
    const resolved = refMap.breakSessions[body.clientBreakRef];
    if (resolved) {
      body.breakSessionId = resolved;
      changed = true;
    }
  }

  return { body, changed };
}

function hasUnresolvedDependency(action: QueuedAction, body: ActionBody): boolean {
  if (
    action.path === '/breaks/start' &&
    typeof action.body.clientDutySessionRef === 'string' &&
    !body.dutySessionId
  ) {
    return true;
  }

  if (
    (action.path === '/breaks/end' || action.path === '/breaks/cancel') &&
    typeof action.body.clientBreakRef === 'string' &&
    !body.breakSessionId
  ) {
    return true;
  }

  return false;
}

function isLikelyNetworkError(err: unknown): boolean {
  return (
    err instanceof TypeError ||
    (err instanceof Error && /fetch|network|abort|offline|502|503|504|timeout/i.test(err.message))
  );
}

function computeRetryDelayMs(retries: number): number {
  const exponent = Math.min(retries, 6);
  return Math.min(MAX_RETRY_DELAY_MS, BASE_RETRY_DELAY_MS * (2 ** exponent));
}

type Listener = (queue: QueuedAction[]) => void;
const listeners = new Set<Listener>();

export function subscribeQueue(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify(): void {
  const q = loadQueue();
  listeners.forEach((fn) => fn(q));
}

function hasActiveQueueActions(queue: QueuedAction[]): boolean {
  return queue.some((a) => a.status === 'pending' || a.status === 'syncing');
}

function enqueueAction(action: QueuedAction): void {
  const queue = loadQueue();
  queue.push(action);
  saveQueue(queue);
  notify();
  startRetryLoop();
}

export async function runQueuedAction(
  path: string,
  body?: Record<string, unknown>,
  method = 'POST',
): Promise<{ ok: boolean; queued: boolean; data?: unknown; error?: string }> {
  const clientTimestamp = new Date().toISOString();
  const actionBody = buildActionBody(path, body, clientTimestamp);
  const action: QueuedAction = {
    id: uid(),
    path,
    method,
    body: actionBody,
    clientTimestamp,
    status: 'pending',
    retries: 0,
    createdAt: clientTimestamp,
    nextRetryAt: new Date().toISOString(),
  };

  const queueSnapshot = loadQueue();
  const isOffline = typeof navigator !== 'undefined' ? !navigator.onLine : false;

  if (isOffline || hasActiveQueueActions(queueSnapshot)) {
    enqueueAction(action);
    if (!isOffline) {
      void processQueue();
    }
    return { ok: false, queued: true };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ACTION_TIMEOUT_MS);

  try {
    const data = await apiFetch(path, {
      method,
      body: JSON.stringify(actionBody),
      signal: controller.signal,
    });
    rememberResolvedRefs(actionBody, data);
    return { ok: true, queued: false, data };
  } catch (err) {
    const isNetworkError = isLikelyNetworkError(err) ||
      (err instanceof DOMException && err.name === 'AbortError');

    if (isNetworkError) {
      enqueueAction(action);
      return { ok: false, queued: true };
    }

    return {
      ok: false,
      queued: false,
      error: err instanceof Error ? err.message : 'Action failed',
    };
  } finally {
    clearTimeout(timeout);
  }
}

let retryTimer: ReturnType<typeof setInterval> | null = null;

function startRetryLoop(): void {
  if (retryTimer) return;
  retryTimer = setInterval(() => void processQueue(), RETRY_INTERVAL_MS);
}

function updateActionInQueue(id: string, updateFn: (a: QueuedAction) => void) {
  const queue = loadQueue();
  const action = queue.find((a) => a.id === id);
  if (action) {
    updateFn(action);
    saveQueue(queue);
    notify();
  }
}

let isProcessing = false;

function isStaleServerError(errorMsg: string): boolean {
  const stalePatterns = /already punched|no active|not found|already .*(on|off|started|ended)|duplicate|expired|session .* closed/i;
  return stalePatterns.test(errorMsg);
}

function isDependencyNotReadyError(errorMsg: string): boolean {
  return /queued (duty session|break) has not synced yet/i.test(errorMsg);
}

function cleanupQueue(): void {
  const queue = loadQueue();
  const nowMs = Date.now();
  let changed = false;

  for (const action of queue) {
    const ageMs = nowMs - new Date(action.createdAt).getTime();

    if (action.status === 'syncing') {
      action.status = 'pending';
      action.nextRetryAt = new Date().toISOString();
      changed = true;
    }

    if (ageMs > MAX_ACTION_AGE_MS && (action.status === 'pending' || action.status === 'failed')) {
      action.status = 'failed';
      action.error = 'Expired — action too old to sync';
      action.nextRetryAt = undefined;
      changed = true;
    }

    if (action.status === 'failed' && action.error && isDependencyNotReadyError(action.error)) {
      action.status = 'pending';
      action.error = undefined;
      action.nextRetryAt = new Date(Date.now() + computeRetryDelayMs(action.serverRetries || 0)).toISOString();
      changed = true;
    }
  }

  if (changed) {
    saveQueue(queue);
    notify();
  }
}

async function processQueue(): Promise<void> {
  if (isProcessing) return;
  isProcessing = true;

  try {
    cleanupQueue();

    const queue = loadQueue();
    const nowMs = Date.now();
    const activeQueue = queue.filter((a) => a.status === 'pending' || a.status === 'syncing');
    if (activeQueue.length === 0) {
      if (retryTimer) {
        clearInterval(retryTimer);
        retryTimer = null;
      }
      return;
    }

    const pending = activeQueue.filter((a) => {
      if (!a.nextRetryAt) return true;
      const retryAtMs = Date.parse(a.nextRetryAt);
      return Number.isNaN(retryAtMs) || retryAtMs <= nowMs;
    });

    if (pending.length === 0) {
      return;
    }

    for (const action of pending) {
      const hydrated = hydrateActionBody(action);
      if (hydrated.changed) {
        updateActionInQueue(action.id, (item) => {
          item.body = hydrated.body;
        });
      }

      if (hasUnresolvedDependency(action, hydrated.body)) {
        continue;
      }

      updateActionInQueue(action.id, (a) => { a.status = 'syncing'; });

      try {
        const data = await apiFetch(action.path, {
          method: action.method,
          body: JSON.stringify(hydrated.body),
        });

        const syncResult = rememberResolvedRefs(hydrated.body, data);

        updateActionInQueue(action.id, (a) => {
          a.status = syncResult.syncStatus === 'STALE' ? 'discarded' : 'synced';
          a.error = undefined;
          a.nextRetryAt = undefined;
          a.result = syncResult;
          a.body = hydrated.body;
        });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Unknown error';

        updateActionInQueue(action.id, (a) => {
          if (isLikelyNetworkError(err) || (err instanceof DOMException && err.name === 'AbortError')) {
            a.retries += 1;
            a.status = 'pending';
            a.error = errMsg;
            a.nextRetryAt = new Date(Date.now() + computeRetryDelayMs(a.retries)).toISOString();
          } else if (isDependencyNotReadyError(errMsg)) {
            a.serverRetries = (a.serverRetries || 0) + 1;
            a.status = 'pending';
            a.error = errMsg;
            a.nextRetryAt = new Date(Date.now() + computeRetryDelayMs(a.serverRetries)).toISOString();
          } else if (isStaleServerError(errMsg)) {
            a.status = 'discarded';
            a.error = undefined;
            a.nextRetryAt = undefined;
            a.result = { syncStatus: 'STALE', syncReason: errMsg };
          } else {
            a.serverRetries = (a.serverRetries || 0) + 1;
            a.status = 'failed';
            a.error = errMsg;
            a.nextRetryAt = undefined;
          }
        });
      }
    }
  } finally {
    isProcessing = false;
  }
}

export function getPendingCount(): number {
  return loadQueue().filter((a) => a.status === 'pending' || a.status === 'syncing').length;
}

export function getFailedCount(): number {
  return loadQueue().filter((a) => a.status === 'failed').length;
}

export function getQueueSnapshot(): QueuedAction[] {
  return loadQueue();
}

export function clearSynced(): void {
  const queue = loadQueue().filter((a) => a.status !== 'synced' && a.status !== 'discarded');
  saveQueue(queue);
  notify();
}

export function retryFailedActions(): void {
  const queue = loadQueue();
  const nowIso = new Date().toISOString();

  let changed = false;
  for (const action of queue) {
    if (action.status === 'failed') {
      action.status = 'pending';
      action.retries = 0;
      action.serverRetries = 0;
      action.nextRetryAt = nowIso;
      action.error = undefined;
      changed = true;
    }
  }

  if (!changed) return;

  saveQueue(queue);
  notify();
  startRetryLoop();
  void processQueue();
}

export function dismissFailedActions(): void {
  const queue = loadQueue().filter((a) => a.status !== 'failed');
  saveQueue(queue);
  notify();
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    startRetryLoop();
    void processQueue();
  });

  setTimeout(() => {
    cleanupQueue();
    if (getPendingCount() > 0) {
      startRetryLoop();
      void processQueue();
    }
  }, 1000);
}
