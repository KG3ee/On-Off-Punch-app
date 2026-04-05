import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from "@nestjs/common";

/**
 * Double-Submit Cookie CSRF verification guard.
 *
 * Only activates when the request is authenticated via the `access_token` cookie.
 * Requests that use `Authorization: Bearer <token>` are exempt (Bearer auth is
 * not vulnerable to CSRF because browsers do not auto-attach custom headers).
 *
 * The client must send an `X-CSRF-Token` header whose value matches the
 * `csrf_token` cookie.  Both are set together at login.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const method = request.method?.toUpperCase();

    // Only protect state-changing methods
    if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
      return true;
    }

    // If using Bearer auth, CSRF does not apply
    const authHeader = request.headers?.authorization;
    if (authHeader && typeof authHeader === "string") {
      const [type] = authHeader.split(" ");
      if (type === "Bearer") {
        return true;
      }
    }

    // Cookie-authenticated request — require CSRF token
    const csrfCookie = request.cookies?.csrf_token;
    const csrfHeader = request.headers?.["x-csrf-token"];

    if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
      throw new ForbiddenException("Invalid or missing CSRF token");
    }

    return true;
  }
}
