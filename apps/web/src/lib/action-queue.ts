'use client';

import { apiFetch } from './api';

/* ────────────────────────────────────────────
 *  Offline-safe action queue with client timestamps
 *  ─────────────────────────────────────────── */

const QUEUE_KEY = 'punch_action_queue';
const RETRY_INTERVAL_MS = 5_000;
const BASE_RETRY_DELAY_MS = 5_000;
const MAX_RETRY_DELAY_MS = 5 * 60_000;

export type QueuedAction = {
    id: string;
    path: string;
    method: string;
    body: Record<string, unknown>;
    clientTimestamp: string;
    status: 'pending' | 'syncing' | 'synced' | 'failed';
    retries: number;
    createdAt: string;
    nextRetryAt?: string;
    error?: string;
};

// ── Persistence helpers ──

function loadQueue(): QueuedAction[] {
    if (typeof window === 'undefined') return [];
    try {
        return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
    } catch {
        return [];
    }
}

function saveQueue(queue: QueuedAction[]): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

function uid(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
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

// ── Listeners for UI refresh ──

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

// ── Core: run an action with offline fallback ──

export async function runQueuedAction(
    path: string,
    body?: Record<string, unknown>,
    method = 'POST',
): Promise<{ ok: boolean; queued: boolean; data?: unknown; error?: string }> {
    const clientTimestamp = new Date().toISOString();
    const actionBody = { ...body, clientTimestamp };
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

    // Preserve action ordering: if there are queued actions, new actions must join the queue.
    if (isOffline || hasActiveQueueActions(queueSnapshot)) {
        enqueueAction(action);
        if (!isOffline) {
            void processQueue();
        }
        return { ok: false, queued: true };
    }

    try {
        const data = await apiFetch(path, {
            method,
            body: JSON.stringify(actionBody),
        });
        return { ok: true, queued: false, data };
    } catch (err) {
        // Network error → queue for retry
        const isNetworkError = isLikelyNetworkError(err);

        if (isNetworkError) {
            enqueueAction(action);
            return { ok: false, queued: true };
        }

        // Server returned an error (not network) → don't queue
        return {
            ok: false,
            queued: false,
            error: err instanceof Error ? err.message : 'Action failed',
        };
    }
}

// ── Retry loop ──

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

async function processQueue(): Promise<void> {
    if (isProcessing) return;
    isProcessing = true;

    try {
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
            updateActionInQueue(action.id, (a) => { a.status = 'syncing'; });

            try {
                await apiFetch(action.path, {
                    method: action.method,
                    body: JSON.stringify(action.body),
                });

                updateActionInQueue(action.id, (a) => {
                    a.status = 'synced';
                    a.error = undefined;
                    a.nextRetryAt = undefined;
                });
            } catch (err) {
                updateActionInQueue(action.id, (a) => {
                    if (isLikelyNetworkError(err)) {
                        a.retries += 1;
                        a.status = 'pending';
                        a.error = err instanceof Error ? err.message : 'Network unavailable';
                        a.nextRetryAt = new Date(Date.now() + computeRetryDelayMs(a.retries)).toISOString();
                    } else {
                        a.status = 'failed';
                        a.error = err instanceof Error ? err.message : 'Server rejected action';
                        a.nextRetryAt = undefined;
                    }
                });
            }
        }
    } finally {
        isProcessing = false;
    }
}

// ── Get current pending count ──

export function getPendingCount(): number {
    return loadQueue().filter((a) => a.status === 'pending' || a.status === 'syncing').length;
}

export function getFailedCount(): number {
    return loadQueue().filter((a) => a.status === 'failed').length;
}

export function getQueueSnapshot(): QueuedAction[] {
    return loadQueue();
}

// Clear synced items from queue (cleanup)
export function clearSynced(): void {
    const queue = loadQueue().filter((a) => a.status !== 'synced');
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
            action.nextRetryAt = nowIso;
            changed = true;
        }
    }

    if (!changed) return;

    saveQueue(queue);
    notify();
    startRetryLoop();
    void processQueue();
}

// ── Auto-start retry loop on page load if there are pending items ──

if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
        startRetryLoop();
        void processQueue();
    });

    // Check on load
    setTimeout(() => {
        if (getPendingCount() > 0) {
            startRetryLoop();
        }
    }, 1000);
}
