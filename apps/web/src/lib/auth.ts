const TOKEN_KEY = 'modern_punch_access_token';

export function setAccessToken(token: string): void {
  if (typeof window === 'undefined') return;
  if (token) {
    window.sessionStorage.setItem(TOKEN_KEY, token);
  }
}

export function getAccessToken(): string {
  if (typeof window === 'undefined') return '';
  return window.sessionStorage.getItem(TOKEN_KEY) || '';
}

export function clearAuth(): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(TOKEN_KEY);
}
