import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  formatDateInZone,
  minutesNowInZone,
  parseTimeToMinutes,
  resolveEventTime,
  serializeEventTime,
} from "../core";
import { DutySessionStatus, Team, User } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
  ) { }

  async punchOn(user: User, note?: string, clientTimestamp?: string) {
    const eventTime = resolveEventTime(clientTimestamp, {
      maxPastHours: this.envNumber("MAX_CLIENT_PAST_HOURS", 72),
      maxFutureMinutes: this.envNumber("MAX_CLIENT_FUTURE_MINUTES", 2),
      highTrustSkewMinutes: this.envNumber("HIGH_TRUST_SKEW_MINUTES", 2),
    });
    const now = eventTime.effectiveAt;
    const timezone = process.env.APP_TIMEZONE || "Asia/Dubai";

    // Check for existing active session
    const existing = await this.prisma.dutySession.findFirst({
      where: {
        userId: user.id,
        status: DutySessionStatus.ACTIVE,
      },
    });

    if (existing) {
      throw new BadRequestException("Already punched ON");
    }

    const localDate = formatDateInZone(now, timezone);

    // Get team shift times for late calculation
    let isLate = false;
    let lateMinutes = 0;

    if (user.teamId) {
      const team = await this.prisma.team.findUnique({
        where: { id: user.teamId },
      });

      if (team?.shiftStartTime) {
        const shiftStartMin = parseTimeToMinutes(team.shiftStartTime);
        const punchMinutes = minutesNowInZone(now, timezone);

        if (punchMinutes > shiftStartMin) {
          isLate = true;
          lateMinutes = Math.min(
            this.maxLateMinutes(),
            punchMinutes - shiftStartMin,
          );
        }
      }
    }

    const created = await this.prisma.dutySession.create({
      data: {
        userId: user.id,
        teamId: user.teamId || null,
        shiftPresetId: null,
        shiftPresetSegmentId: null,
        shiftDate: localDate,
        localDate,
        scheduledStartLocal: null,
        scheduledEndLocal: null,
        punchedOnAt: now,
        status: DutySessionStatus.ACTIVE,
        isLate,
        lateMinutes,
        note,
        createdById: user.id,
      },
    });

    await this.prisma.auditEvent.create({
      data: {
        actorUserId: user.id,
        action: "DUTY_PUNCH_ON",
        entityType: "DutySession",
        entityId: created.id,
        payload: {
          shiftDate: localDate,
          isLate,
          lateMinutes,
          clientTimestamp: clientTimestamp || null,
          time: serializeEventTime(eventTime),
        },
      },
    });

    return created;
  }

  async punchOff(user: User, note?: string, clientTimestamp?: string) {
    const active = await this.prisma.dutySession.findFirst({
      where: {
        userId: user.id,
        status: DutySessionStatus.ACTIVE,
      },
      orderBy: {
        punchedOnAt: "desc",
      },
    });

    if (!active) {
      throw new NotFoundException("No active duty session found");
    }

    const eventTime = resolveEventTime(clientTimestamp, {
      maxPastHours: this.envNumber("MAX_CLIENT_PAST_HOURS", 72),
      maxFutureMinutes: this.envNumber("MAX_CLIENT_FUTURE_MINUTES", 2),
      highTrustSkewMinutes: this.envNumber("HIGH_TRUST_SKEW_MINUTES", 2),
    });
    let now = eventTime.effectiveAt;
    let timeAnomaly = eventTime.anomaly;

    if (now.getTime() < active.punchedOnAt.getTime()) {
      now = new Date(active.punchedOnAt);
      timeAnomaly = timeAnomaly
        ? `${timeAnomaly}|PUNCH_OFF_BEFORE_PUNCH_ON_CLAMPED`
        : "PUNCH_OFF_BEFORE_PUNCH_ON_CLAMPED";
    }

    const timezone = process.env.APP_TIMEZONE || "Asia/Dubai";
    const workedMinutes = Math.max(
      0,
      Math.round((now.getTime() - active.punchedOnAt.getTime()) / 60000),
    );

    const team = user.teamId
      ? await this.prisma.team.findUnique({
          where: { id: user.teamId },
        })
      : null;

    const overtimeMinutes = this.computeOvertimeMinutes(
      team,
      active.punchedOnAt,
      now,
      timezone,
    );

    const updated = await this.prisma.dutySession.update({
      where: { id: active.id },
      data: {
        punchedOffAt: now,
        status: DutySessionStatus.CLOSED,
        note: note || active.note,
        overtimeMinutes,
      },
    });

    await this.prisma.auditEvent.create({
      data: {
        actorUserId: user.id,
        action: "DUTY_PUNCH_OFF",
        entityType: "DutySession",
        entityId: updated.id,
        payload: {
          workedMinutes,
          overtimeMinutes,
          clientTimestamp: clientTimestamp || null,
          time: {
            ...serializeEventTime(eventTime),
            effectiveAt: now.toISOString(),
            anomaly: timeAnomaly,
          },
        },
      },
    });

    return {
      ...updated,
      workedMinutes,
    };
  }

  async myTodaySessions(userId: string): Promise<unknown> {
    const now = new Date();
    const localDate = formatDateInZone(
      now,
      process.env.APP_TIMEZONE || "Asia/Dubai",
    );

    return this.prisma.dutySession.findMany({
      where: {
        userId,
        OR: [
          { localDate },
          { status: DutySessionStatus.ACTIVE },
        ],
      },
      orderBy: {
        punchedOnAt: "desc",
      },
    });
  }

  async getLiveBoard(localDate?: string) {
    const timezone = process.env.APP_TIMEZONE || "Asia/Dubai";
    const date = localDate || formatDateInZone(new Date(), timezone);

    const activeDutySessions = await this.prisma.dutySession.findMany({
      where: {
        status: DutySessionStatus.ACTIVE,
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
          },
        },
        team: true,
        breakSessions: {
          where: {
            status: "ACTIVE",
          },
          include: {
            breakPolicy: true,
          },
        },
        shiftPresetSegment: true,
      },
      orderBy: {
        punchedOnAt: "asc",
      },
    });

    const todaySummary = await this.prisma.dutySession.aggregate({
      where: {
        localDate: date,
      },
      _count: {
        _all: true,
      },
      _sum: {
        lateMinutes: true,
      },
    });

    return {
      localDate: date,
      activeDutySessions,
      summary: {
        totalSessionsToday: todaySummary._count._all,
        totalLateMinutesToday: todaySummary._sum.lateMinutes || 0,
      },
    };
  }

  async listAttendance(params: {
    from: string;
    to: string;
    teamId?: string;
    userId?: string;
    status?: DutySessionStatus;
  }) {
    return this.prisma.dutySession.findMany({
      where: {
        localDate: {
          gte: params.from,
          lte: params.to,
        },
        ...(params.teamId ? { teamId: params.teamId } : {}),
        ...(params.userId ? { userId: params.userId } : {}),
        ...(params.status ? { status: params.status } : {}),
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            role: true,
          },
        },
        team: true,
        shiftPreset: true,
        shiftPresetSegment: true,
      },
      orderBy: [{ localDate: "desc" }, { punchedOnAt: "desc" }],
    });
  }

  private computeOvertimeMinutes(
    team: Pick<Team, "shiftStartTime" | "shiftEndTime"> | null,
    punchedOnAt: Date,
    punchedOffAt: Date,
    timeZone: string,
  ): number {
    if (!team?.shiftStartTime || !team.shiftEndTime) {
      return 0;
    }

    const shiftStartMin = parseTimeToMinutes(team.shiftStartTime);
    const shiftEndMin = parseTimeToMinutes(team.shiftEndTime);
    const punchOnMinutes = minutesNowInZone(punchedOnAt, timeZone);
    const punchOffMinutes = minutesNowInZone(punchedOffAt, timeZone);

    const dayDelta = this.localDayDelta(punchedOnAt, punchedOffAt, timeZone);
    const punchOnAbsolute = punchOnMinutes;
    const punchOffAbsolute = Math.max(
      punchOnAbsolute,
      dayDelta * 1440 + punchOffMinutes,
    );

    const scheduledStartAbsolute = shiftStartMin;
    const scheduledEndAbsolute =
      shiftEndMin > shiftStartMin ? shiftEndMin : shiftEndMin + 1440;

    const earlyOvertime = Math.max(0, scheduledStartAbsolute - punchOnAbsolute);
    const lateOvertime = Math.max(0, punchOffAbsolute - scheduledEndAbsolute);
    const rawOvertime = earlyOvertime + lateOvertime;

    return Math.min(this.maxOvertimeMinutes(), rawOvertime);
  }

  private localDayDelta(start: Date, end: Date, timeZone: string): number {
    const startLocalDate = formatDateInZone(start, timeZone);
    const endLocalDate = formatDateInZone(end, timeZone);
    const startDayMs = Date.parse(`${startLocalDate}T00:00:00.000Z`);
    const endDayMs = Date.parse(`${endLocalDate}T00:00:00.000Z`);
    if (Number.isNaN(startDayMs) || Number.isNaN(endDayMs)) {
      return 0;
    }
    return Math.max(0, Math.round((endDayMs - startDayMs) / 86400000));
  }

  private maxLateMinutes(): number {
    return this.envNumber("MAX_LATE_MINUTES", 720);
  }

  private maxOvertimeMinutes(): number {
    return this.envNumber("MAX_OVERTIME_MINUTES", 720);
  }

  private envNumber(name: string, fallback: number): number {
    const parsed = Number(process.env[name]);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
    return fallback;
  }
}
