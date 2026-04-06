import { Body, Controller, Post, Res, UseGuards } from "@nestjs/common";
import { Response } from "express";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { resolveAuthSessionMaxAgeMs } from "../common/config/session";
import { AuthUser } from "../common/interfaces/auth-user.interface";
import { generateCsrfToken } from "../common/utils/csrf";
import { AuthService } from "./auth.service";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { LoginDto } from "./dto/login.dto";

type SameSiteMode = "lax" | "strict" | "none";

function normalizeCookieDomain(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const value = raw.trim();
  if (!value) return undefined;
  return value.startsWith(".") ? value : `.${value}`;
}

function parseCookieDomain(): string | undefined {
  const explicit =
    normalizeCookieDomain(process.env.AUTH_COOKIE_DOMAIN) ??
    normalizeCookieDomain(process.env.COOKIE_DOMAIN);
  if (explicit) return explicit;

  const origin = process.env.CORS_ORIGIN
    ?.split(",")
    .map((value) => value.trim())
    .find(Boolean);
  if (!origin) return undefined;

  try {
    const hostname = new URL(origin).hostname;
    if (
      hostname === "localhost" ||
      /^[\d.]+$/.test(hostname) ||
      hostname.includes(":")
    ) {
      return undefined;
    }

    const parts = hostname.split(".").filter(Boolean);
    if (parts.length < 2) return undefined;
    return `.${parts.slice(-2).join(".")}`;
  } catch {
    return undefined;
  }
}

function parseSameSiteMode(): SameSiteMode {
  const raw = process.env.AUTH_COOKIE_SAMESITE?.toLowerCase();
  if (!raw) {
    return process.env.NODE_ENV === "production" ? "none" : "lax";
  }
  if (raw === "strict" || raw === "none") {
    return raw;
  }
  return "lax";
}

function parseSecureFlag(sameSite: SameSiteMode): boolean {
  const raw = process.env.AUTH_COOKIE_SECURE;
  if (raw === "true") return true;
  if (raw === "false") return false;
  return process.env.NODE_ENV === "production" || sameSite === "none";
}

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("login")
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto);
    const sameSite = parseSameSiteMode();
    const secure = parseSecureFlag(sameSite);
    const domain = parseCookieDomain();
    const csrfToken = generateCsrfToken();

    res.cookie("access_token", result.accessToken, {
      httpOnly: true,
      sameSite,
      secure,
      domain,
      maxAge: resolveAuthSessionMaxAgeMs(),
    });

    // CSRF token cookie (NOT httpOnly — readable by client JS for Double Submit)
    res.cookie("csrf_token", csrfToken, {
      httpOnly: false,
      sameSite,
      secure,
      domain,
      maxAge: resolveAuthSessionMaxAgeMs(),
    });

    return { user: result.user };
  }

  @UseGuards(JwtAuthGuard)
  @Post("change-password")
  async changePassword(
    @CurrentUser() actor: AuthUser,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(actor, dto);
  }

  @Post("logout")
  logout(@Res({ passthrough: true }) res: Response) {
    const sameSite = parseSameSiteMode();
    const secure = parseSecureFlag(sameSite);
    const domain = parseCookieDomain();

    res.clearCookie("access_token", {
      httpOnly: true,
      sameSite,
      secure,
      domain,
    });

    res.clearCookie("csrf_token", {
      httpOnly: false,
      sameSite,
      secure,
      domain,
    });

    return {
      ok: true,
    };
  }
}
