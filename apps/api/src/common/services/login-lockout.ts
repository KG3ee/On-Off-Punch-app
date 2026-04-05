/**
 * In-memory login lockout tracker.
 *
 * After a configurable number of failed attempts for the same username,
 * further login attempts for that username are rejected for a cooldown
 * period.  The lockout resets automatically — no admin intervention needed.
 */

type LockoutEntry = {
  attempts: number;
  lockedUntil: number | null; // epoch-ms when lockout expires, or null
};

const store = new Map<string, LockoutEntry>();

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.trunc(parsed);
}

function getMaxAttempts(): number {
  return parsePositiveInt(process.env.AUTH_LOCKOUT_MAX_ATTEMPTS, 5);
}

function getCooldownMs(): number {
  return parsePositiveInt(
    process.env.AUTH_LOCKOUT_COOLDOWN_MS,
    15 * 60 * 1000, // 15 minutes default
  );
}

/** Record a failed attempt. Returns true if the account is now locked. */
export function recordFailedLogin(username: string): boolean {
  const now = Date.now();
  sweep();
  const maxAttempts = getMaxAttempts();
  const cooldownMs = getCooldownMs();
  const key = username.toLowerCase().trim();

  const existing = store.get(key);

  if (!existing) {
    if (maxAttempts <= 1) {
      store.set(key, { attempts: 1, lockedUntil: now + cooldownMs });
      return true;
    }
    store.set(key, { attempts: 1, lockedUntil: null });
    return false;
  }

  // If currently locked, extend the lockout
  if (existing.lockedUntil !== null && existing.lockedUntil > now) {
    existing.lockedUntil = now + cooldownMs;
    return true;
  }

  // Not locked — record the attempt
  existing.attempts += 1;
  if (existing.attempts >= maxAttempts) {
    existing.lockedUntil = now + cooldownMs;
    store.set(key, existing);
    return true;
  }

  store.set(key, existing);
  return false;
}

/** Record a successful login — reset the counter. */
export function resetLoginFailures(username: string): void {
  const key = username.toLowerCase().trim();
  store.delete(key);
}

/** Check if the account is currently locked. Returns lock info if so. */
export function getLockoutInfo(
  username: string,
): { locked: boolean; retryAfterMs: number } | null {
  const key = username.toLowerCase().trim();
  const entry = store.get(key);
  if (!entry) return null;

  const now = Date.now();
  if (entry.lockedUntil !== null && entry.lockedUntil > now) {
    return { locked: true, retryAfterMs: entry.lockedUntil - now };
  }

  // Lockout expired — clean up
  store.delete(key);
  return null;
}

/** Remove stale entries to prevent memory growth. */
function sweep(): void {
  if (store.size < 5000) return;
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (entry.lockedUntil !== null && entry.lockedUntil <= now) {
      store.delete(key);
    }
  }
}
