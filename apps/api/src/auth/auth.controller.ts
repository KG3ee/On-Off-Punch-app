import { Body, Controller, Post, Res, UseGuards } from "@nestjs/common";
import { Response } from "express";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { AuthUser } from "../common/interfaces/auth-user.interface";
import { AuthService } from "./auth.service";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { LoginDto } from "./dto/login.dto";

type SameSiteMode = "lax" | "strict" | "none";

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

    res.cookie("access_token", result.accessToken, {
      httpOnly: true,
      sameSite,
      secure,
      maxAge: 8 * 60 * 60 * 1000,
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

    res.clearCookie("access_token", {
      httpOnly: true,
      sameSite,
      secure,
    });

    return {
      ok: true,
    };
  }
}
