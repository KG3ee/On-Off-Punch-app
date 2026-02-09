import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { GenerateMonthlyReportDto } from './dto/generate-monthly-report.dto';
import { ReportsService } from './reports.service';

@Controller('admin/reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('monthly')
  async listMonthly() {
    return this.reportsService.listMonthlyReports();
  }

  @Post('monthly/generate')
  async generateMonthly(
    @Body() dto: GenerateMonthlyReportDto,
    @CurrentUser() actor: AuthUser
  ) {
    return this.reportsService.generateMonthlyReport(dto, actor);
  }
}
