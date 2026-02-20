import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards
} from '@nestjs/common';
import { BreakSessionStatus, DutySessionStatus, Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { LeaderService } from './leader.service';

@Controller('leader')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.LEADER)
export class LeaderController {
  constructor(private readonly leaderService: LeaderService) {}

  @Get('team')
  async getTeam(@CurrentUser() authUser: AuthUser) {
    const teamId = await this.leaderService.resolveTeamId(authUser.sub);
    return this.leaderService.getTeamMembers(teamId);
  }

  @Get('live')
  async getLive(
    @CurrentUser() authUser: AuthUser,
    @Query('localDate') localDate?: string
  ) {
    const teamId = await this.leaderService.resolveTeamId(authUser.sub);
    return this.leaderService.getLiveBoard(teamId, localDate);
  }

  @Get('requests')
  async listRequests(@CurrentUser() authUser: AuthUser) {
    const teamId = await this.leaderService.resolveTeamId(authUser.sub);
    return this.leaderService.listTeamRequests(teamId);
  }

  @Post('requests/:id/approve')
  async approveRequest(
    @CurrentUser() authUser: AuthUser,
    @Param('id') id: string,
    @Body() body: { targetPresetId?: string }
  ) {
    const teamId = await this.leaderService.resolveTeamId(authUser.sub);
    return this.leaderService.approveRequest(id, authUser.sub, teamId, body.targetPresetId);
  }

  @Post('requests/:id/reject')
  async rejectRequest(
    @CurrentUser() authUser: AuthUser,
    @Param('id') id: string
  ) {
    const teamId = await this.leaderService.resolveTeamId(authUser.sub);
    return this.leaderService.rejectRequest(id, authUser.sub, teamId);
  }

  @Get('attendance')
  async listAttendance(
    @CurrentUser() authUser: AuthUser,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('userId') userId?: string,
    @Query('status') status?: DutySessionStatus,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string
  ) {
    const teamId = await this.leaderService.resolveTeamId(authUser.sub);
    return this.leaderService.listAttendance(teamId, { from, to, userId, status, limit, offset });
  }

  @Get('breaks')
  async listBreakHistory(
    @CurrentUser() authUser: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('userId') userId?: string,
    @Query('status') status?: BreakSessionStatus,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string
  ) {
    const teamId = await this.leaderService.resolveTeamId(authUser.sub);
    return this.leaderService.listBreakHistory(teamId, { from, to, userId, status, limit, offset });
  }

  @Get('drivers')
  async listDrivers() {
    return this.leaderService.listDrivers();
  }

  @Get('shift-presets')
  async listShiftPresets(@CurrentUser() authUser: AuthUser) {
    await this.leaderService.resolveTeamId(authUser.sub);
    return this.leaderService.listShiftPresets();
  }
}
