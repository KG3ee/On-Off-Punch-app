import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CsrfGuard } from '../common/guards/csrf.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { UsersService } from '../users/users.service';
import { CreateShiftAssignmentDto } from './dto/create-shift-assignment.dto';
import { CreateShiftOverrideDto } from './dto/create-shift-override.dto';
import { CreateShiftPresetDto } from './dto/create-shift-preset.dto';
import { CreateShiftChangeRequestDto } from './dto/create-shift-change-request.dto';
import { ShiftsService } from './shifts.service';

@Controller()
@UseGuards(JwtAuthGuard, CsrfGuard)
export class ShiftsController {
  constructor(
    private readonly shiftsService: ShiftsService,
    private readonly usersService: UsersService
  ) { }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Get('admin/shift-presets')
  async listPresets() {
    return this.shiftsService.listPresets();
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Post('admin/shift-presets')
  async createPreset(@Body() dto: CreateShiftPresetDto) {
    return this.shiftsService.createPreset(dto);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Delete('admin/shift-presets/:id')
  async deletePreset(@Param('id') id: string) {
    return this.shiftsService.deletePreset(id);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Get('admin/shift-assignments')
  async listAssignments() {
    return this.shiftsService.listAssignments();
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Post('admin/shift-assignments')
  async createAssignment(@Body() dto: CreateShiftAssignmentDto) {
    return this.shiftsService.createAssignment(dto);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Post('admin/shift-overrides')
  async createOverride(@Body() dto: CreateShiftOverrideDto) {
    return this.shiftsService.createOverride(dto);
  }

  @Get('shifts/current')
  async getCurrentShift(@CurrentUser() authUser: AuthUser) {
    const user = await this.usersService.getOrThrow(authUser.sub);
    const resolved = await this.shiftsService.getActiveSegmentForUser(user, new Date());
    return resolved;
  }

  @Get('shifts/presets')
  async listPublicPresets() {
    return this.shiftsService.listPresets();
  }
  @Post('shifts/requests')
  async createRequest(@CurrentUser() authUser: AuthUser, @Body() dto: CreateShiftChangeRequestDto) {
    const user = await this.usersService.getOrThrow(authUser.sub);
    return this.shiftsService.createRequest(user.id, dto);
  }

  @Get('shifts/requests/me')
  async listMyRequests(@CurrentUser() authUser: AuthUser) {
    const user = await this.usersService.getOrThrow(authUser.sub);
    return this.shiftsService.listRequests(false, user.id);
  }

  @Get('shifts/requests/me/summary')
  async getMyRequestSummary(@CurrentUser() authUser: AuthUser) {
    const user = await this.usersService.getOrThrow(authUser.sub);
    return this.shiftsService.getMyRequestSummary(user.id);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Get('admin/requests')
  async listAllRequests() {
    return this.shiftsService.listRequests(true);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Get('admin/requests/summary')
  async getRequestSummary() {
    return this.shiftsService.getAdminRequestSummary();
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Post('admin/requests/:id/approve')
  async approveRequest(
    @CurrentUser() authUser: AuthUser,
    @Param('id') id: string,
  ) {
    return this.shiftsService.approveRequest(id, authUser.sub);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Post('admin/requests/:id/reject')
  async rejectRequest(@CurrentUser() authUser: AuthUser, @Param('id') id: string) {
    return this.shiftsService.rejectRequest(id, authUser.sub);
  }
}
