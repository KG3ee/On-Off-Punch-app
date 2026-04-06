import { Injectable, UnauthorizedException, HttpException, HttpStatus } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { compare } from "bcryptjs";
import { resolveJwtSecret } from "../common/config/jwt-secret";
import { resolveAuthSessionTtlSeconds } from "../common/config/session";
import { getLockoutInfo, recordFailedLogin, resetLoginFailures } from "../common/services/login-lockout";
import { AuthUser } from "../common/interfaces/auth-user.interface";
import { UsersService } from "../users/users.service";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { LoginDto } from "./dto/login.dto";

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async login(dto: LoginDto) {
    const normalizedUsername = dto.username.toLowerCase().trim();

    // Check if account is currently locked out
    const lockoutInfo = getLockoutInfo(normalizedUsername);
    if (lockoutInfo) {
      throw new HttpException(
        "Account temporarily locked due to too many failed login attempts. Please try again later.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const user = await this.usersService.findByUsernameForAuth(dto.username);
    if (!user || !user.isActive) {
      recordFailedLogin(normalizedUsername);
      throw new UnauthorizedException("Invalid username or password");
    }

    const passwordOk = await compare(dto.password, user.passwordHash);
    if (!passwordOk) {
      const nowLocked = recordFailedLogin(normalizedUsername);
      if (nowLocked) {
        throw new HttpException(
          "Account temporarily locked due to too many failed login attempts. Please try again later.",
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      throw new UnauthorizedException("Invalid username or password");
    }

    // Success — reset the failure counter
    resetLoginFailures(normalizedUsername);

    const accessToken = await this.signToken({
      sub: user.id,
      role: user.role,
      displayName: user.displayName,
      username: user.username,
    });
    const publicUser = await this.usersService.getPublicOrThrow(user.id);

    return { accessToken, user: publicUser };
  }

  async changePassword(actor: AuthUser, dto: ChangePasswordDto) {
    const user = await this.usersService.getOrThrow(actor.sub);
    const currentPasswordOk = await compare(
      dto.currentPassword,
      user.passwordHash,
    );
    if (!currentPasswordOk) {
      throw new UnauthorizedException("Current password is incorrect");
    }

    await this.usersService.updatePassword(user.id, dto.newPassword, false);

    return {
      ok: true,
    };
  }

  private async signToken(payload: AuthUser): Promise<string> {
    return this.jwtService.signAsync(payload, {
      secret: resolveJwtSecret(),
      expiresIn: resolveAuthSessionTtlSeconds(),
    });
  }
}
