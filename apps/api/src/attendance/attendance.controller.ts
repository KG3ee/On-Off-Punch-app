import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { DutySessionStatus, Role } from "@prisma/client";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { AuthUser } from "../common/interfaces/auth-user.interface";
import { UsersService } from "../users/users.service";
import { PunchDto } from "./dto/punch.dto";
import { AttendanceService } from "./attendance.service";

@Controller("attendance")
@UseGuards(JwtAuthGuard)
export class AttendanceController {
  constructor(
    private readonly attendanceService: AttendanceService,
    private readonly usersService: UsersService,
  ) { }

  @Post("on")
  async punchOn(@CurrentUser() authUser: AuthUser, @Body() dto: PunchDto) {
    const user = await this.usersService.getOrThrow(authUser.sub);
    return this.attendanceService.punchOn(user, dto.note, dto.clientTimestamp);
  }

  @Post("off")
  async punchOff(@CurrentUser() authUser: AuthUser, @Body() dto: PunchDto) {
    const user = await this.usersService.getOrThrow(authUser.sub);
    return this.attendanceService.punchOff(user, dto.note, dto.clientTimestamp);
  }

  @Get("me/today")
  async myToday(@CurrentUser() authUser: AuthUser) {
    return this.attendanceService.myTodaySessions(authUser.sub);
  }

  @Get("me/summary")
  async mySummary(@CurrentUser() authUser: AuthUser) {
    return this.attendanceService.getMonthlySummary(authUser.sub);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Get("/admin/live")
  async getLive(@Query("localDate") localDate?: string) {
    return this.attendanceService.getLiveBoard(localDate);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Get("/admin/attendance")
  async listAttendance(
    @Query("from") from: string,
    @Query("to") to: string,
    @Query("teamId") teamId?: string,
    @Query("userId") userId?: string,
    @Query("status") status?: DutySessionStatus,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    return this.attendanceService.listAttendance({
      from,
      to,
      teamId,
      userId,
      status,
      limit,
      offset,
    });
  }
}
