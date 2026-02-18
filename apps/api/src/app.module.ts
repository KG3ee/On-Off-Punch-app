import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./auth/auth.module";
import { UsersModule } from "./users/users.module";
import { TeamsModule } from "./teams/teams.module";

import { AttendanceModule } from "./attendance/attendance.module";
import { BreaksModule } from "./breaks/breaks.module";

import { ReportsModule } from "./reports/reports.module";
import { JobsModule } from "./jobs/jobs.module";
import { ShiftsModule } from "./shifts/shifts.module";
import { RegistrationsModule } from "./registrations/registrations.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    TeamsModule,

    AttendanceModule,
    BreaksModule,
    ShiftsModule,
    RegistrationsModule,

    ReportsModule,
    JobsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
