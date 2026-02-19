const TOKEN_KEY = 'modern_punch_access_token';

export function setAccessToken(token: string): void {
  if (typeof window === 'undefined') return;
  if (token) {
    window.localStorage.removeItem(TOKEN_KEY);
  }
}

export function getAccessToken(): string {
  return '';
}

export function clearAuth(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(TOKEN_KEY);
}
