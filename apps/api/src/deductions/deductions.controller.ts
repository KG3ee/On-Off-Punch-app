import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { DeductionCategory, Role } from '@prisma/client';
import { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CsrfGuard } from '../common/guards/csrf.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { DeductionsService } from './deductions.service';
import { ListDeductionEntriesDto } from './dto/list-deduction-entries.dto';
import { ListDeductionFilterDto } from './dto/list-deduction-filter.dto';
import { UpdateDeductionPolicyDto } from './dto/update-deduction-policy.dto';

@Controller('admin/deductions')
@UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
@Roles(Role.ADMIN)
export class DeductionsController {
  constructor(private readonly deductionsService: DeductionsService) {}

  @Get('policies')
  async listPolicies() {
    return this.deductionsService.listPolicies();
  }

  @Put('policies/:category')
  async updatePolicy(
    @CurrentUser() authUser: AuthUser,
    @Param('category') category: DeductionCategory,
    @Body() dto: UpdateDeductionPolicyDto,
  ) {
    if (!Object.values(DeductionCategory).includes(category)) {
      throw new BadRequestException('Invalid deduction category');
    }
    return this.deductionsService.updatePolicy(authUser.sub, category, dto);
  }

  @Get('entries')
  async listEntries(@Query() query: ListDeductionEntriesDto) {
    return this.deductionsService.listEntries(query);
  }

  @Get('summary')
  async getSummary(@Query() query: ListDeductionFilterDto) {
    return this.deductionsService.getSummary(query);
  }

  @Get('export.csv')
  async exportCsv(
    @CurrentUser() authUser: AuthUser,
    @Query() query: ListDeductionFilterDto,
    @Res() response: Response,
  ) {
    const exported = await this.deductionsService.exportEntriesCsv(authUser.sub, query);
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', `attachment; filename="${exported.filename}"`);
    response.send(exported.csv);
  }
}
