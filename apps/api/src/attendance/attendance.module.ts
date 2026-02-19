import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { resolveJwtSecret } from "../common/config/jwt-secret";

import { ShiftsModule } from "../shifts/shifts.module";
import { UsersModule } from "../users/users.module";
import { AttendanceController } from "./attendance.controller";
import { AttendanceService } from "./attendance.service";

@Module({
  imports: [

    UsersModule,
    ShiftsModule,
    JwtModule.register({
      secret: resolveJwtSecret(),
      signOptions: { expiresIn: "8h" },
    }),
  ],
  controllers: [AttendanceController],
  providers: [AttendanceService],
  exports: [AttendanceService],
})
export class AttendanceModule { }
