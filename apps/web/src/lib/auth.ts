/**
 * @deprecated Auth is now cookie-based (httpOnly access_token + csrf_token).
 * These functions are kept for backwards compatibility but are no-ops.
 * The backend sets the access_token cookie on login and clears it on logout.
 */

const TOKEN_KEY = 'modern_punch_access_token';

/** @deprecated No-op — auth is now handled by httpOnly cookies. */
export function setAccessToken(_token: string): void {
  // no-op
}

/** @deprecated No-op — auth is now handled by httpOnly cookies. */
export function getAccessToken(): string {
  return '';
}

/** @deprecated No-op — auth is now handled by httpOnly cookies. */
export function clearAuth(): void {
  // no-op
}
