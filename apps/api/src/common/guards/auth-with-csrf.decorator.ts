import { UseGuards, applyDecorators } from "@nestjs/common";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { CsrfGuard } from "./csrf.guard";

/**
 * Apply both JWT authentication and CSRF verification.
 *
 * - JWT is accepted from either the `Authorization: Bearer` header
 *   or the `access_token` httpOnly cookie.
 * - CSRF verification is ONLY enforced when the request uses the cookie.
 *   Bearer-token requests are exempt (they are not vulnerable to CSRF).
 *
 * Usage:
 *   @UseGuards(AuthWithCsrf)
 *   @Get("me")
 *   getMe() { ... }
 */
export const AuthWithCsrf = () => applyDecorators(UseGuards(JwtAuthGuard, CsrfGuard));
