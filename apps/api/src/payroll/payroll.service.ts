import {
  BadRequestException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { computePayrollItem } from '../core';
import {
  BreakDeductionMode,
  BreakSessionStatus,
  PayrollRunStatus,
  Prisma,
  Role,
  SalaryRule,
  User
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { CreateSalaryRuleDto } from './dto/create-salary-rule.dto';
import { GeneratePayrollRunDto } from './dto/generate-payroll-run.dto';

@Injectable()
export class PayrollService {
  constructor(private readonly prisma: PrismaService) {}

  async listSalaryRules() {
    return this.prisma.salaryRule.findMany({
      where: { isActive: true },
      orderBy: { effectiveFrom: 'desc' }
    });
  }

  async createSalaryRule(dto: CreateSalaryRuleDto, actorId: string) {
    return this.prisma.salaryRule.create({
      data: {
        name: dto.name,
        baseHourlyRate: dto.baseHourlyRate,
        overtimeMultiplier: dto.overtimeMultiplier,
        latePenaltyPerMinute: dto.latePenaltyPerMinute,
        breakDeductionMode: dto.breakDeductionMode || BreakDeductionMode.NONE,
        effectiveFrom: new Date(`${dto.effectiveFrom}T00:00:00.000Z`),
        effectiveTo: dto.effectiveTo ? new Date(`${dto.effectiveTo}T23:59:59.999Z`) : null,
        createdById: actorId
      }
    });
  }

  async listRuns() {
    return this.prisma.payrollRun.findMany({
      include: {
        team: true,
        salaryRule: true,
        _count: {
          select: {
            items: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  async getRunItems(runId: string) {
    return this.prisma.payrollItem.findMany({
      where: {
        payrollRunId: runId
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true
          }
        }
      },
      orderBy: {
        user: {
          displayName: 'asc'
        }
      }
    });
  }

  async exportRunCsv(runId: string): Promise<string> {
    const run = await this.prisma.payrollRun.findUnique({
      where: { id: runId },
      include: {
        team: true,
        salaryRule: true
      }
    });

    if (!run) {
      throw new NotFoundException('Payroll run not found');
    }

    const items = await this.getRunItems(runId);

    const headers = [
      'run_id',
      'period_from',
      'period_to',
      'team',
      'salary_rule',
      'employee',
      'worked_minutes',
      'break_minutes',
      'payable_minutes',
      'overtime_minutes',
      'late_minutes',
      'gross_pay',
      'late_penalty',
      'final_pay'
    ];

    const rows = items.map((item) => [
      run.id,
      run.localDateFrom,
      run.localDateTo,
      run.team?.name || 'All',
      run.salaryRule.name,
      item.user.displayName,
      String(item.workedMinutes),
      String(item.breakMinutes),
      String(item.payableMinutes),
      String(item.overtimeMinutes),
      String(item.lateMinutes),
      String(item.grossPay),
      String(item.latePenalty),
      String(item.finalPay)
    ]);

    const csvLines = [headers, ...rows].map((row) =>
      row
        .map((value) => {
          const escaped = value.replace(/"/g, '""');
          return `"${escaped}"`;
        })
        .join(',')
    );

    return csvLines.join('\n');
  }

  async generateRun(dto: GeneratePayrollRunDto, actor: AuthUser) {
    if (dto.localDateFrom > dto.localDateTo) {
      throw new BadRequestException('localDateFrom must be <= localDateTo');
    }

    const salaryRule = await this.resolveSalaryRule(dto.salaryRuleId);

    const users = await this.prisma.user.findMany({
      where: {
        isActive: true,
        role: Role.EMPLOYEE,
        ...(dto.teamId ? { teamId: dto.teamId } : {})
      },
      orderBy: {
        displayName: 'asc'
      }
    });

    if (users.length === 0) {
      throw new NotFoundException('No employees found for selected filters');
    }

    const periodStart = new Date(`${dto.localDateFrom}T00:00:00.000Z`);
    const periodEnd = new Date(`${dto.localDateTo}T23:59:59.999Z`);

    return this.prisma.$transaction(async (tx) => {
      const run = await tx.payrollRun.create({
        data: {
          periodStart,
          periodEnd,
          localDateFrom: dto.localDateFrom,
          localDateTo: dto.localDateTo,
          teamId: dto.teamId || null,
          salaryRuleId: salaryRule.id,
          createdById: actor.sub,
          notes: dto.notes
        }
      });

      for (const user of users) {
        const metrics = await this.computeUserMetrics(tx, user, dto.localDateFrom, dto.localDateTo);

        const computed = computePayrollItem({
          employeeId: user.id,
          employeeName: user.displayName,
          workedMinutes: metrics.workedMinutes,
          breakMinutes: metrics.breakMinutes,
          overtimeMinutes: metrics.overtimeMinutes,
          lateMinutes: metrics.lateMinutes,
          rule: {
            name: salaryRule.name,
            baseHourlyRate: Number(salaryRule.baseHourlyRate),
            overtimeMultiplier: Number(salaryRule.overtimeMultiplier),
            latePenaltyPerMinute: Number(salaryRule.latePenaltyPerMinute),
            breakDeductionMode: salaryRule.breakDeductionMode
          }
        });

        await tx.payrollItem.create({
          data: {
            payrollRunId: run.id,
            userId: user.id,
            workedMinutes: metrics.workedMinutes,
            breakMinutes: metrics.breakMinutes,
            payableMinutes: computed.payableMinutes,
            overtimeMinutes: computed.overtimeMinutes,
            lateMinutes: metrics.lateMinutes,
            grossPay: computed.grossPay,
            latePenalty: computed.latePenalty,
            finalPay: computed.finalPay,
            details: computed.metadata
          }
        });
      }

      await tx.auditEvent.create({
        data: {
          actorUserId: actor.sub,
          action: 'PAYROLL_RUN_GENERATED',
          entityType: 'PayrollRun',
          entityId: run.id,
          payload: {
            localDateFrom: dto.localDateFrom,
            localDateTo: dto.localDateTo,
            teamId: dto.teamId || null,
            employees: users.length,
            salaryRuleId: salaryRule.id
          }
        }
      });

      return tx.payrollRun.findUnique({
        where: { id: run.id },
        include: {
          salaryRule: true,
          _count: {
            select: { items: true }
          }
        }
      });
    });
  }

  async finalizeRun(runId: string, actor: AuthUser) {
    const run = await this.prisma.payrollRun.findUnique({ where: { id: runId } });
    if (!run) {
      throw new NotFoundException('Payroll run not found');
    }
    if (run.status === PayrollRunStatus.FINALIZED) {
      return run;
    }

    const updated = await this.prisma.payrollRun.update({
      where: { id: runId },
      data: {
        status: PayrollRunStatus.FINALIZED,
        finalizedAt: new Date(),
        finalizedById: actor.sub
      }
    });

    await this.prisma.auditEvent.create({
      data: {
        actorUserId: actor.sub,
        action: 'PAYROLL_RUN_FINALIZED',
        entityType: 'PayrollRun',
        entityId: updated.id
      }
    });

    return updated;
  }

  private async resolveSalaryRule(salaryRuleId?: string): Promise<SalaryRule> {
    if (salaryRuleId) {
      const rule = await this.prisma.salaryRule.findUnique({ where: { id: salaryRuleId } });
      if (!rule) {
        throw new NotFoundException('Salary rule not found');
      }
      return rule;
    }

    const now = new Date();
    const active = await this.prisma.salaryRule.findFirst({
      where: {
        isActive: true,
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }]
      },
      orderBy: { effectiveFrom: 'desc' }
    });

    if (!active) {
      throw new NotFoundException('No active salary rule found');
    }

    return active;
  }

  private async computeUserMetrics(
    tx: Prisma.TransactionClient,
    user: User,
    localDateFrom: string,
    localDateTo: string
  ): Promise<{
    workedMinutes: number;
    breakMinutes: number;
    overtimeMinutes: number;
    lateMinutes: number;
  }> {
    const dutySessions = await tx.dutySession.findMany({
      where: {
        userId: user.id,
        localDate: { gte: localDateFrom, lte: localDateTo },
        status: 'CLOSED'
      }
    });

    const workedMinutes = dutySessions.reduce((sum, session) => {
      if (!session.punchedOffAt) {
        return sum;
      }
      const minutes = Math.max(
        0,
        Math.round((session.punchedOffAt.getTime() - session.punchedOnAt.getTime()) / 60000)
      );
      return sum + minutes;
    }, 0);

    const lateMinutes = dutySessions.reduce((sum, session) => sum + session.lateMinutes, 0);

    const breakSessions = await tx.breakSession.findMany({
      where: {
        userId: user.id,
        localDate: { gte: localDateFrom, lte: localDateTo },
        status: {
          in: [BreakSessionStatus.COMPLETED, BreakSessionStatus.AUTO_CLOSED]
        }
      }
    });

    const breakMinutes = breakSessions.reduce((sum, session) => sum + (session.actualMinutes || 0), 0);

    // Prototype: overtime can be derived from future rule configuration.
    const overtimeMinutes = 0;

    return {
      workedMinutes,
      breakMinutes,
      overtimeMinutes,
      lateMinutes
    };
  }
}
