import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CsrfGuard } from '../common/guards/csrf.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { CreateObservedViolationDto } from './dto/create-observed-violation.dto';
import { CreateViolationReportDto } from './dto/create-violation-report.dto';
import { FinalizeViolationDto } from './dto/finalize-violation.dto';
import { ListViolationPointsDto } from './dto/list-violation-points.dto';
import { ListViolationsDto } from './dto/list-violations.dto';
import { TriageViolationDto } from './dto/triage-violation.dto';
import { ViolationsService } from './violations.service';

@Controller()
@UseGuards(JwtAuthGuard, CsrfGuard)
export class ViolationsController {
  constructor(private readonly violationsService: ViolationsService) {}

  @Post('violations/reports')
  async createMemberReport(
    @CurrentUser() authUser: AuthUser,
    @Body() dto: CreateViolationReportDto,
  ) {
    return this.violationsService.createMemberReport(authUser.sub, dto);
  }

  @Get('violations/reports/me')
  async listMyReports(@CurrentUser() authUser: AuthUser) {
    return this.violationsService.listMyReports(authUser.sub);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.LEADER)
  @Get('leader/violations')
  async listLeaderCases(
    @CurrentUser() authUser: AuthUser,
    @Query() query: ListViolationsDto,
  ) {
    return this.violationsService.listLeaderCases(authUser.sub, query);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.LEADER)
  @Post('leader/violations/:id/triage')
  async triageLeaderCase(
    @CurrentUser() authUser: AuthUser,
    @Param('id') id: string,
    @Body() dto: TriageViolationDto,
  ) {
    return this.violationsService.triageLeaderCase(authUser.sub, id, dto);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.LEADER)
  @Post('leader/violations/observed')
  async createLeaderObserved(
    @CurrentUser() authUser: AuthUser,
    @Body() dto: CreateObservedViolationDto,
  ) {
    return this.violationsService.createLeaderObserved(authUser.sub, dto);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Get('admin/violations')
  async listAdminCases(@Query() query: ListViolationsDto) {
    return this.violationsService.listAdminCases(query);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Get('admin/violations/summary')
  async getAdminSummary() {
    return this.violationsService.getAdminSummary();
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Post('admin/violations/observed')
  async createAdminObserved(
    @CurrentUser() authUser: AuthUser,
    @Body() dto: CreateObservedViolationDto,
  ) {
    return this.violationsService.createAdminObserved(authUser.sub, dto);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Post('admin/violations/:id/finalize')
  async finalizeCase(
    @CurrentUser() authUser: AuthUser,
    @Param('id') id: string,
    @Body() dto: FinalizeViolationDto,
  ) {
    return this.violationsService.finalizeCase(authUser.sub, id, dto);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Get('admin/violations/points')
  async listPoints(@Query() query: ListViolationPointsDto) {
    return this.violationsService.listPoints(query);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Get('admin/violations/points/export.csv')
  async exportPointsCsv(
    @Query() query: ListViolationPointsDto,
    @Res() response: Response,
  ) {
    const exported = await this.violationsService.exportPointsCsv(query);
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', `attachment; filename="${exported.filename}"`);
    response.send(exported.csv);
  }
}
