import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { resolveJwtSecret } from "../common/config/jwt-secret";
import { UsersModule } from "../users/users.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";

@Module({
  imports: [
    UsersModule,
    JwtModule.register({
      secret: resolveJwtSecret(),
      signOptions: { expiresIn: "8h" },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
