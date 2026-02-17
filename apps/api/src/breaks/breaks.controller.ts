import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { BreakSessionStatus, Role } from "@prisma/client";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { AuthUser } from "../common/interfaces/auth-user.interface";
import { UsersService } from "../users/users.service";
import { BreaksService } from "./breaks.service";
import { CreateBreakPolicyDto } from "./dto/create-break-policy.dto";
import { StartBreakDto } from "./dto/start-break.dto";

@Controller("breaks")
@UseGuards(JwtAuthGuard)
export class BreaksController {
  constructor(
    private readonly breaksService: BreaksService,
    private readonly usersService: UsersService,
  ) {}

  @Get("policies")
  async listPolicies() {
    return this.breaksService.listPolicies();
  }

  @Get("me/today")
  async myTodayBreaks(@CurrentUser() authUser: AuthUser) {
    return this.breaksService.myTodayBreaks(authUser.sub);
  }

  @Get("me/active")
  async myActiveBreak(@CurrentUser() authUser: AuthUser) {
    return this.breaksService.myActiveBreak(authUser.sub);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Post("admin/policies")
  async createPolicy(@Body() dto: CreateBreakPolicyDto) {
    return this.breaksService.createPolicy(dto);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Get("admin/history")
  async listBreakHistory(
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("teamId") teamId?: string,
    @Query("userId") userId?: string,
    @Query("status") status?: BreakSessionStatus,
  ) {
    return this.breaksService.listBreakHistory({
      from,
      to,
      teamId,
      userId,
      status,
    });
  }

  @Post("start")
  async startBreak(
    @CurrentUser() authUser: AuthUser,
    @Body() dto: StartBreakDto,
  ) {
    const user = await this.usersService.getOrThrow(authUser.sub);
    return this.breaksService.startBreak(user, dto.code);
  }

  @Post("end")
  async endBreak(@CurrentUser() authUser: AuthUser) {
    const user = await this.usersService.getOrThrow(authUser.sub);
    return this.breaksService.endBreak(user);
  }

  @Post("cancel")
  async cancelBreak(@CurrentUser() authUser: AuthUser) {
    const user = await this.usersService.getOrThrow(authUser.sub);
    return this.breaksService.cancelBreak(user);
  }
}
