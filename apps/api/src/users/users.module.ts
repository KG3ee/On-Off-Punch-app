import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { resolveJwtSecret } from "../common/config/jwt-secret";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";

@Module({
  imports: [
    JwtModule.register({
      secret: resolveJwtSecret(),
      signOptions: { expiresIn: "8h" },
    }),
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
