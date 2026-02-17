import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Res,
  UseGuards,
} from "@nestjs/common";
import { Role } from "@prisma/client";
import { Response } from "express";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { AuthUser } from "../common/interfaces/auth-user.interface";
import { CreateSalaryRuleDto } from "./dto/create-salary-rule.dto";
import { GeneratePayrollRunDto } from "./dto/generate-payroll-run.dto";
import { PayrollService } from "./payroll.service";

@Controller("admin/payroll")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class PayrollController {
  constructor(private readonly payrollService: PayrollService) {}

  @Get("salary-rules")
  async listSalaryRules() {
    return this.payrollService.listSalaryRules();
  }

  @Post("salary-rules")
  async createSalaryRule(
    @Body() dto: CreateSalaryRuleDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.payrollService.createSalaryRule(dto, actor.sub);
  }

  @Get("runs")
  async listRuns() {
    return this.payrollService.listRuns();
  }

  @Post("runs/generate")
  async generateRun(
    @Body() dto: GeneratePayrollRunDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.payrollService.generateRun(dto, actor);
  }

  @Post("runs/:id/finalize")
  async finalizeRun(
    @Param("id") runId: string,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.payrollService.finalizeRun(runId, actor);
  }

  @Get("runs/:id/items")
  async getRunItems(@Param("id") runId: string) {
    return this.payrollService.getRunItems(runId);
  }

  @Get("runs/:id/export.csv")
  async exportRunCsv(@Param("id") runId: string, @Res() res: Response) {
    const csv = await this.payrollService.exportRunCsv(runId);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="payroll-${runId}.csv"`,
    );
    res.send(csv);
  }
}
