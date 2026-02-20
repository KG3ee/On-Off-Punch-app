import { Body, Controller, Param, Post, Get, UseGuards } from '@nestjs/common';
import { Role, DriverStatus } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { CreateDriverRequestDto } from './dto/create-driver-request.dto';
import { ApproveDriverRequestDto } from './dto/approve-driver-request.dto';
import { RejectDriverRequestDto } from './dto/reject-driver-request.dto';
import { DriverRequestsService } from './driver-requests.service';

@Controller()
export class DriverRequestsController {
  constructor(private readonly driverRequestsService: DriverRequestsService) {}

  @UseGuards(JwtAuthGuard)
  @Post('driver-requests')
  async create(@CurrentUser() authUser: AuthUser, @Body() dto: CreateDriverRequestDto) {
    return this.driverRequestsService.create(authUser.sub, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('driver-requests/me')
  async listMyRequests(@CurrentUser() authUser: AuthUser) {
    return this.driverRequestsService.listMyRequests(authUser.sub);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Get('admin/driver-requests')
  async listAllRequests() {
    return this.driverRequestsService.listAllRequests();
  }

  @UseGuards(JwtAuthGuard)
  @Get('driver-requests/available')
  async listAvailableForDrivers(@CurrentUser() authUser: AuthUser) {
    return this.driverRequestsService.listAvailableForDrivers();
  }

  @UseGuards(JwtAuthGuard)
  @Get('driver-requests/my-assignments')
  async listMyAssignments(@CurrentUser() authUser: AuthUser) {
    return this.driverRequestsService.listMyAssignments(authUser.sub);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Post('admin/driver-requests/:id/approve')
  async approve(
    @CurrentUser() authUser: AuthUser,
    @Param('id') id: string,
    @Body() dto: ApproveDriverRequestDto
  ) {
    return this.driverRequestsService.approve(id, authUser.sub, dto.adminNote);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Post('admin/driver-requests/:id/reject')
  async reject(
    @CurrentUser() authUser: AuthUser,
    @Param('id') id: string,
    @Body() dto: RejectDriverRequestDto
  ) {
    return this.driverRequestsService.reject(id, authUser.sub, dto.adminNote);
  }

  @UseGuards(JwtAuthGuard)
  @Post('driver-requests/:id/accept')
  async accept(@CurrentUser() authUser: AuthUser, @Param('id') id: string) {
    return this.driverRequestsService.accept(id, authUser.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Post('driver-requests/:id/complete')
  async complete(@CurrentUser() authUser: AuthUser, @Param('id') id: string) {
    return this.driverRequestsService.complete(id, authUser.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Post('driver-requests/status')
  async setStatus(@CurrentUser() authUser: AuthUser, @Body() dto: { status: DriverStatus }) {
    return this.driverRequestsService.setDriverStatus(authUser.sub, dto.status);
  }
}
