import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { resolveJwtSecret } from "../common/config/jwt-secret";
import { ReportsController } from "./reports.controller";
import { ReportsService } from "./reports.service";

@Module({
  imports: [
    JwtModule.register({
      secret: resolveJwtSecret(),
      signOptions: { expiresIn: "8h" },
    }),
  ],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
