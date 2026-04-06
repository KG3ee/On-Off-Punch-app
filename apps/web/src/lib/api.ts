const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001';

type ApiFetchOptions = RequestInit & {
  skipAuth?: boolean;
};

/**
 * Read the CSRF token from the csrf_token cookie (set by the backend at login).
 * Returns an empty string if the cookie is not present.
 */
function getCsrfToken(): string {
  if (typeof document === 'undefined') return '';
  const match = document.cookie.match(/(?:^|; )csrf_token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : '';
}

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const headers = new Headers(options.headers || {});

  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }

  // Attach CSRF token header for all non-skipped requests.
  // The backend verifies this only for cookie-authenticated mutating requests.
  const csrfToken = options.skipAuth ? '' : getCsrfToken();
  if (csrfToken && !headers.has('X-CSRF-Token')) {
    headers.set('X-CSRF-Token', csrfToken);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers
  });

  if (!response.ok) {
    let errorMessage = `Request failed (${response.status})`;
    try {
      const data = (await response.json()) as { message?: string | string[] };
      if (Array.isArray(data.message)) {
        errorMessage = data.message.join(', ');
      } else if (data.message) {
        errorMessage = data.message;
      }
    } catch {
      // ignore JSON parse errors
    }
    throw new Error(errorMessage);
  }

  return (await response.json()) as T;
}
