import { Injectable, UnauthorizedException } from "@nestjs/common";
import { BreakSessionStatus, DutySessionStatus, Role } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { ReportsService } from "../reports/reports.service";

@Injectable()
export class JobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reportsService: ReportsService,
  ) {}

  async runDailyJobs(secret: string | undefined) {
    this.assertJobSecret(secret);

    const autoClose = await this.autoCloseOvertimeBreaks();
    const staleDuty = await this.autoCloseStaleDutySessions();
    const monthly = await this.generatePreviousMonthReportIfFirstDay();

    return {
      ok: true,
      autoClose,
      staleDuty,
      monthly,
    };
  }

  async runAutoCloseBreaks(secret: string | undefined) {
    this.assertJobSecret(secret);
    const autoClose = await this.autoCloseOvertimeBreaks();
    return {
      ok: true,
      autoClose,
    };
  }

  async runAutoCloseStaleDuty(secret: string | undefined) {
    this.assertJobSecret(secret);
    const staleDuty = await this.autoCloseStaleDutySessions();
    return {
      ok: true,
      staleDuty,
    };
  }

  async runMonthlySnapshot(
    secret: string | undefined,
    params: {
      year?: number;
      month?: number;
      teamId?: string;
      force?: boolean;
    },
  ) {
    this.assertJobSecret(secret);

    if (params.year && params.month) {
      const actorId = await this.resolveJobActorId();
      const report = await this.reportsService.generateMonthlyReportByActorId(
        {
          year: params.year,
          month: params.month,
          teamId: params.teamId,
        },
        actorId,
      );

      return {
        ok: true,
        generated: true,
        report,
      };
    }

    const monthly = await this.generatePreviousMonthReportIfFirstDay(
      params.force || false,
      params.teamId,
    );
    return {
      ok: true,
      monthly,
    };
  }

  private assertJobSecret(secret: string | undefined): void {
    const expected = process.env.JOB_SECRET;

    if (!expected) {
      throw new UnauthorizedException("JOB_SECRET is not configured");
    }

    if (!secret || secret !== expected) {
      throw new UnauthorizedException("Invalid job secret");
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
        status: BreakSessionStatus.ACTIVE,
      },
      include: {
        breakPolicy: true,
      },
    });

    let autoClosed = 0;

    for (const breakSession of activeBreaks) {
      const elapsedMinutes = Math.max(
        0,
        Math.round((now.getTime() - breakSession.startedAt.getTime()) / 60000),
      );

      if (
        elapsedMinutes <=
        breakSession.expectedDurationMinutes + graceMinutes
      ) {
        continue;
      }

      await this.prisma.breakSession.update({
        where: { id: breakSession.id },
        data: {
          endedAt: now,
          actualMinutes: elapsedMinutes,
          isOvertime: true,
          autoClosed: true,
          status: BreakSessionStatus.AUTO_CLOSED,
        },
      });

      await this.prisma.auditEvent.create({
        data: {
          actorUserId: breakSession.userId,
          action: "BREAK_AUTO_CLOSE",
          entityType: "BreakSession",
          entityId: breakSession.id,
          payload: {
            code: breakSession.breakPolicy.code,
            expectedDuration: breakSession.expectedDurationMinutes,
            actualMinutes: elapsedMinutes,
            graceMinutes,
          },
        },
      });

      autoClosed++;
    }

    return {
      checked: activeBreaks.length,
      autoClosed,
    };
  }

  private async autoCloseStaleDutySessions(): Promise<{
    checked: number;
    autoClosed: number;
    maxHours: number;
  }> {
    const maxHours = Number(process.env.MAX_ACTIVE_DUTY_HOURS || 20);
    const cutoff = new Date(Date.now() - maxHours * 60 * 60 * 1000);

    const staleSessions = await this.prisma.dutySession.findMany({
      where: {
        status: DutySessionStatus.ACTIVE,
        punchedOnAt: {
          lte: cutoff,
        },
      },
      include: {
        user: {
          select: {
            id: true,
          },
        },
      },
    });

    let autoClosed = 0;

    for (const session of staleSessions) {
      const autoPunchedOffAt = new Date(
        session.punchedOnAt.getTime() + maxHours * 60 * 60 * 1000,
      );

      await this.prisma.dutySession.update({
        where: { id: session.id },
        data: {
          status: DutySessionStatus.CLOSED,
          punchedOffAt: autoPunchedOffAt,
          note: session.note
            ? `${session.note} | AUTO_CLOSED_STALE_SESSION`
            : "AUTO_CLOSED_STALE_SESSION",
        },
      });

      await this.prisma.auditEvent.create({
        data: {
          actorUserId: session.userId,
          action: "DUTY_AUTO_CLOSE_STALE",
          entityType: "DutySession",
          entityId: session.id,
          payload: {
            maxHours,
            cutoff: cutoff.toISOString(),
            autoPunchedOffAt: autoPunchedOffAt.toISOString(),
          },
        },
      });

      autoClosed++;
    }

    return {
      checked: staleSessions.length,
      autoClosed,
      maxHours,
    };
  }

  private async generatePreviousMonthReportIfFirstDay(
    force = false,
    teamId?: string,
  ): Promise<{
    generated: boolean;
    reason?: string;
    reportId?: string;
    year?: number;
    month?: number;
  }> {
    const timeZone = process.env.APP_TIMEZONE || "Asia/Dubai";
    const now = new Date();
    const parts = this.getLocalDateParts(now, timeZone);

    if (!force && parts.day !== 1) {
      return {
        generated: false,
        reason: "Not first day of month",
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
        teamId,
      },
      actorId,
    );

    return {
      generated: true,
      reportId: report.id,
      year: targetYear,
      month: targetMonth,
    };
  }

  private async resolveJobActorId(): Promise<string | null> {
    const configured = process.env.SYSTEM_JOB_USER_ID;
    if (configured) {
      const user = await this.prisma.user.findUnique({
        where: { id: configured },
      });
      if (user) {
        return user.id;
      }
    }

    const firstAdmin = await this.prisma.user.findFirst({
      where: {
        role: Role.ADMIN,
        isActive: true,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    return firstAdmin?.id || null;
  }

  private getLocalDateParts(
    date: Date,
    timeZone: string,
  ): { year: number; month: number; day: number } {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);

    const map: Record<string, string> = {};
    for (const part of parts) {
      if (part.type !== "literal") {
        map[part.type] = part.value;
      }
    }

    return {
      year: Number(map.year),
      month: Number(map.month),
      day: Number(map.day),
    };
  }
}
