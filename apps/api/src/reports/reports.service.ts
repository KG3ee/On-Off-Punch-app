import { Injectable } from "@nestjs/common";
import { BreakSessionStatus, DutySessionStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuthUser } from "../common/interfaces/auth-user.interface";
import { GenerateMonthlyReportDto } from "./dto/generate-monthly-report.dto";

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async listMonthlyReports() {
    return this.prisma.monthlyReport.findMany({
      include: {
        team: true,
        generatedBy: {
          select: {
            id: true,
            username: true,
            displayName: true,
            role: true,
          },
        },
      },
      orderBy: [{ year: "desc" }, { month: "desc" }, { generatedAt: "desc" }],
    });
  }

  async generateMonthlyReport(dto: GenerateMonthlyReportDto, actor: AuthUser) {
    return this.generateMonthlyReportByActorId(dto, actor.sub);
  }

  async generateMonthlyReportByActorId(
    dto: GenerateMonthlyReportDto,
    actorUserId: string | null,
  ) {
    const actorId = actorUserId || null;
    const monthStr = String(dto.month).padStart(2, "0");
    const localDateFrom = `${dto.year}-${monthStr}-01`;
    const nextMonth =
      dto.month === 12
        ? { y: dto.year + 1, m: 1 }
        : { y: dto.year, m: dto.month + 1 };
    const nextMonthDate = `${nextMonth.y}-${String(nextMonth.m).padStart(2, "0")}-01`;
    const lastDay = new Date(`${nextMonthDate}T00:00:00.000Z`);
    lastDay.setUTCDate(0);
    const localDateTo = `${dto.year}-${monthStr}-${String(lastDay.getUTCDate()).padStart(2, "0")}`;

    const scopeKey = `${dto.year}-${monthStr}:${dto.teamId || "global"}`;

    const existing = await this.prisma.monthlyReport.findUnique({
      where: { scopeKey },
    });

    if (existing) {
      return existing;
    }

    const dutySessions = await this.prisma.dutySession.findMany({
      where: {
        localDate: {
          gte: localDateFrom,
          lte: localDateTo,
        },
        status: DutySessionStatus.CLOSED,
        ...(dto.teamId ? { teamId: dto.teamId } : {}),
      },
      select: {
        id: true,
        userId: true,
        punchedOnAt: true,
        punchedOffAt: true,
        lateMinutes: true,
      },
    });

    const breakSessions = await this.prisma.breakSession.findMany({
      where: {
        localDate: {
          gte: localDateFrom,
          lte: localDateTo,
        },
        status: {
          in: [BreakSessionStatus.COMPLETED, BreakSessionStatus.AUTO_CLOSED],
        },
        ...(dto.teamId ? { user: { teamId: dto.teamId } } : {}),
      },
      select: {
        id: true,
        userId: true,
        actualMinutes: true,
        isOvertime: true,
      },
    });

    const workedMinutes = dutySessions.reduce((sum, s) => {
      if (!s.punchedOffAt) return sum;
      return (
        sum +
        Math.max(
          0,
          Math.round(
            (s.punchedOffAt.getTime() - s.punchedOnAt.getTime()) / 60000,
          ),
        )
      );
    }, 0);

    const lateMinutes = dutySessions.reduce((sum, s) => sum + s.lateMinutes, 0);
    const breakMinutes = breakSessions.reduce(
      (sum, s) => sum + (s.actualMinutes || 0),
      0,
    );
    const overtimeBreakCount = breakSessions.filter((s) => s.isOvertime).length;

    const employeeIds = new Set<string>();
    dutySessions.forEach((s) => employeeIds.add(s.userId));
    breakSessions.forEach((s) => employeeIds.add(s.userId));

    const summary = {
      period: {
        localDateFrom,
        localDateTo,
      },
      employeesCount: employeeIds.size,
      dutySessionsCount: dutySessions.length,
      breakSessionsCount: breakSessions.length,
      overtimeBreakCount,
      totals: {
        workedMinutes,
        breakMinutes,
        lateMinutes,
      },
    };

    const created = await this.prisma.monthlyReport.create({
      data: {
        scopeKey,
        year: dto.year,
        month: dto.month,
        teamId: dto.teamId || null,
        periodStart: new Date(`${localDateFrom}T00:00:00.000Z`),
        periodEnd: new Date(`${localDateTo}T23:59:59.999Z`),
        reportJson: summary,
        generatedById: actorId,
      },
    });

    await this.prisma.auditEvent.create({
      data: {
        actorUserId: actorId,
        action: "MONTHLY_REPORT_GENERATED",
        entityType: "MonthlyReport",
        entityId: created.id,
        payload: summary,
      },
    });

    return created;
  }
}
