/**
 * Per-user rate limiting middleware for authenticated mutating endpoints.
 *
 * Unlike the IP-based rate limiter in `bootstrap.ts` (which protects login
 * and registration), this limiter keys requests by the authenticated user
 * ID (`request.user.sub`).  This prevents multiple users sharing a NAT IP
 * from throttling each other.
 *
 * Usage — wrap any Express handler:
 *   app.use('/attendance/on', perUserRateLimiter({ max: 20, windowMs: 300_000 }));
 */

type Bucket = { count: number; resetAt: number };

const store = new Map<string, Bucket>();

export interface PerUserRateLimitOptions {
  max: number;
  windowMs: number;
}

export function perUserRateLimiter(options: PerUserRateLimitOptions) {
  return (request: any, response: any, next: () => void) => {
    // Only limit mutating methods
    const method = request.method?.toUpperCase();
    if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
      next();
      return;
    }

    const nowMs = Date.now();

    // Sweep stale entries when the map grows large
    if (store.size >= 5000) {
      for (const [key, bucket] of store.entries()) {
        if (bucket.resetAt <= nowMs) {
          store.delete(key);
        }
      }
    }

    // Prefer authenticated user ID, fall back to IP
    const userId = request.user?.sub as string | undefined;
    const ip =
      request.headers?.["x-forwarded-for"]?.split(",")[0]?.trim() ||
      request.ip ||
      request.socket?.remoteAddress ||
      "unknown";
    const key = userId ? `user:${userId}` : `ip:${ip}`;

    const current = store.get(key);

    if (!current || current.resetAt <= nowMs) {
      store.set(key, { count: 1, resetAt: nowMs + options.windowMs });
      next();
      return;
    }

    current.count += 1;
    if (current.count > options.max) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((current.resetAt - nowMs) / 1000),
      );
      response.setHeader("Retry-After", String(retryAfterSeconds));
      response.status(429).json({
        message: "Too many requests. Please slow down and try again later.",
      });
      return;
    }

    store.set(key, current);
    next();
  };
}
