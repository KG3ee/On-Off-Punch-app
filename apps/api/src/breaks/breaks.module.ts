import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { resolveJwtSecret } from "../common/config/jwt-secret";
import { UsersModule } from "../users/users.module";
import { BreaksController } from "./breaks.controller";
import { BreaksService } from "./breaks.service";

@Module({
  imports: [
    UsersModule,
    JwtModule.register({
      secret: resolveJwtSecret(),
      signOptions: { expiresIn: "8h" },
    }),
  ],
  controllers: [BreaksController],
  providers: [BreaksService],
  exports: [BreaksService],
})
export class BreaksModule {}
