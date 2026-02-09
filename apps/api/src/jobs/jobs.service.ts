import { Injectable, UnauthorizedException } from '@nestjs/common';
import { BreakSessionStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ReportsService } from '../reports/reports.service';

@Injectable()
export class JobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reportsService: ReportsService
  ) {}

  async runDailyJobs(secret: string | undefined) {
    this.assertJobSecret(secret);

    const autoClose = await this.autoCloseOvertimeBreaks();
    const monthly = await this.generatePreviousMonthReportIfFirstDay();

    return {
      ok: true,
      autoClose,
      monthly
    };
  }

  async runAutoCloseBreaks(secret: string | undefined) {
    this.assertJobSecret(secret);
    const autoClose = await this.autoCloseOvertimeBreaks();
    return {
      ok: true,
      autoClose
    };
  }

  async runMonthlySnapshot(
    secret: string | undefined,
    params: {
      year?: number;
      month?: number;
      teamId?: string;
      force?: boolean;
    }
  ) {
    this.assertJobSecret(secret);

    if (params.year && params.month) {
      const actorId = await this.resolveJobActorId();
      const report = await this.reportsService.generateMonthlyReportByActorId(
        {
          year: params.year,
          month: params.month,
          teamId: params.teamId
        },
        actorId
      );

      return {
        ok: true,
        generated: true,
        report
      };
    }

    const monthly = await this.generatePreviousMonthReportIfFirstDay(params.force || false, params.teamId);
    return {
      ok: true,
      monthly
    };
  }

  private assertJobSecret(secret: string | undefined): void {
    const expected = process.env.JOB_SECRET;

    if (!expected) {
      throw new UnauthorizedException('JOB_SECRET is not configured');
    }

    if (!secret || secret !== expected) {
      throw new UnauthorizedException('Invalid job secret');
    }
  }

  private async autoCloseOvertimeBreaks(): Promise<{
    checked: number;
    autoClosed: number;
  }> {
    const now = new Date();
    const graceMinutes = Number(process.env.BREAK_GRACE_MINUTES || 5);

    const activeBreaks = await this.prisma.breakSession.findMany({
      where: {
        status: BreakSessionStatus.ACTIVE
      },
      include: {
        breakPolicy: true
      }
    });

    let autoClosed = 0;

    for (const breakSession of activeBreaks) {
      const elapsedMinutes = Math.max(
        0,
        Math.round((now.getTime() - breakSession.startedAt.getTime()) / 60000)
      );

      if (elapsedMinutes <= breakSession.expectedDurationMinutes + graceMinutes) {
        continue;
      }

      await this.prisma.breakSession.update({
        where: { id: breakSession.id },
        data: {
          endedAt: now,
          actualMinutes: elapsedMinutes,
          isOvertime: true,
          autoClosed: true,
          status: BreakSessionStatus.AUTO_CLOSED
        }
      });

      await this.prisma.auditEvent.create({
        data: {
          actorUserId: breakSession.userId,
          action: 'BREAK_AUTO_CLOSE',
          entityType: 'BreakSession',
          entityId: breakSession.id,
          payload: {
            code: breakSession.breakPolicy.code,
            expectedDuration: breakSession.expectedDurationMinutes,
            actualMinutes: elapsedMinutes,
            graceMinutes
          }
        }
      });

      autoClosed++;
    }

    return {
      checked: activeBreaks.length,
      autoClosed
    };
  }

  private async generatePreviousMonthReportIfFirstDay(
    force = false,
    teamId?: string
  ): Promise<{
    generated: boolean;
    reason?: string;
    reportId?: string;
    year?: number;
    month?: number;
  }> {
    const timeZone = process.env.APP_TIMEZONE || 'Asia/Dubai';
    const now = new Date();
    const parts = this.getLocalDateParts(now, timeZone);

    if (!force && parts.day !== 1) {
      return {
        generated: false,
        reason: 'Not first day of month'
      };
    }

    let targetYear = parts.year;
    let targetMonth = parts.month - 1;
    if (targetMonth < 1) {
      targetMonth = 12;
      targetYear -= 1;
    }

    const actorId = await this.resolveJobActorId();
    const report = await this.reportsService.generateMonthlyReportByActorId(
      {
        year: targetYear,
        month: targetMonth,
        teamId
      },
      actorId
    );

    return {
      generated: true,
      reportId: report.id,
      year: targetYear,
      month: targetMonth
    };
  }

  private async resolveJobActorId(): Promise<string | null> {
    const configured = process.env.SYSTEM_JOB_USER_ID;
    if (configured) {
      const user = await this.prisma.user.findUnique({ where: { id: configured } });
      if (user) {
        return user.id;
      }
    }

    const firstAdmin = await this.prisma.user.findFirst({
      where: {
        role: Role.ADMIN,
        isActive: true
      },
      orderBy: {
        createdAt: 'asc'
      }
    });

    return firstAdmin?.id || null;
  }

  private getLocalDateParts(date: Date, timeZone: string): { year: number; month: number; day: number } {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(date);

    const map: Record<string, string> = {};
    for (const part of parts) {
      if (part.type !== 'literal') {
        map[part.type] = part.value;
      }
    }

    return {
      year: Number(map.year),
      month: Number(map.month),
      day: Number(map.day)
    };
  }
}
