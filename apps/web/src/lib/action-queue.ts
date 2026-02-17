'use client';

import { apiFetch } from './api';

/* ────────────────────────────────────────────
 *  Offline-safe action queue with client timestamps
 *  ─────────────────────────────────────────── */

const QUEUE_KEY = 'punch_action_queue';
const MAX_RETRIES = 5;
const RETRY_INTERVAL_MS = 5_000;

export type QueuedAction = {
    id: string;
    path: string;
    method: string;
    body: Record<string, unknown>;
    clientTimestamp: string;
    status: 'pending' | 'syncing' | 'synced' | 'failed';
    retries: number;
    createdAt: string;
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

// ── Core: run an action with offline fallback ──

export async function runQueuedAction(
    path: string,
    body?: Record<string, unknown>,
    method = 'POST',
): Promise<{ ok: boolean; queued: boolean; data?: unknown; error?: string }> {
    const clientTimestamp = new Date().toISOString();
    const actionBody = { ...body, clientTimestamp };

    try {
        const data = await apiFetch(path, {
            method,
            body: JSON.stringify(actionBody),
        });
        return { ok: true, queued: false, data };
    } catch (err) {
        // Network error → queue for retry
        const isNetworkError =
            err instanceof TypeError ||
            (err instanceof Error && /fetch|network|abort/i.test(err.message));

        if (isNetworkError) {
            const action: QueuedAction = {
                id: uid(),
                path,
                method,
                body: actionBody,
                clientTimestamp,
                status: 'pending',
                retries: 0,
                createdAt: clientTimestamp,
            };

            const queue = loadQueue();
            queue.push(action);
            saveQueue(queue);
            notify();
            startRetryLoop();

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

async function processQueue(): Promise<void> {
    const queue = loadQueue();
    const pending = queue.filter((a) => a.status === 'pending' || a.status === 'syncing');

    if (pending.length === 0) {
        if (retryTimer) {
            clearInterval(retryTimer);
            retryTimer = null;
        }
        return;
    }

    for (const action of pending) {
        action.status = 'syncing';
        saveQueue(queue);
        notify();

        try {
            await apiFetch(action.path, {
                method: action.method,
                body: JSON.stringify(action.body),
            });

            action.status = 'synced';
        } catch (err) {
            action.retries++;
            if (action.retries >= MAX_RETRIES) {
                action.status = 'failed';
                action.error = err instanceof Error ? err.message : 'Max retries reached';
            } else {
                action.status = 'pending';
            }
        }

        saveQueue(queue);
        notify();
    }
}

// ── Get current pending count ──

export function getPendingCount(): number {
    return loadQueue().filter((a) => a.status === 'pending' || a.status === 'syncing').length;
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

// ── Auto-start retry loop on page load if there are pending items ──

if (typeof window !== 'undefined') {
    window.addEventListener('online', () => void processQueue());

    // Check on load
    setTimeout(() => {
        if (getPendingCount() > 0) {
            startRetryLoop();
        }
    }, 1000);
}
