import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { resolveJwtSecret } from "../config/jwt-secret";
import { AuthUser } from "../interfaces/auth-user.interface";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException("Missing authorization token");
    }

    try {
      const payload = await this.jwtService.verifyAsync<AuthUser>(token, {
        secret: resolveJwtSecret(),
      });
      request.user = payload;
      return true;
    } catch {
      throw new UnauthorizedException("Invalid or expired token");
    }
  }

  private extractToken(request: Record<string, any>): string | null {
    const authHeader = request.headers?.authorization;
    if (authHeader && typeof authHeader === "string") {
      const [type, token] = authHeader.split(" ");
      if (type === "Bearer" && token) {
        return token;
      }
    }

    if (request.cookies?.access_token) {
      return request.cookies.access_token;
    }

    return null;
  }
}
