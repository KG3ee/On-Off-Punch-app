import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  formatDateInZone,
  getTimePartsInZone,
  minutesNowInZone,
  parseTimeToMinutes,
  resolveEventTime,
  serializeEventTime,
} from "../core";
import { DutySessionStatus, Team, User } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { ShiftsService } from "../shifts/shifts.service";

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shiftsService: ShiftsService,
  ) { }

  async punchOn(user: User, note?: string, clientTimestamp?: string) {
    const eventTime = resolveEventTime(clientTimestamp, {
      maxPastHours: this.envNumber("MAX_CLIENT_PAST_HOURS", 72),
      maxFutureMinutes: this.envNumber("MAX_CLIENT_FUTURE_MINUTES", 2),
      highTrustSkewMinutes: this.envNumber("HIGH_TRUST_SKEW_MINUTES", 2),
    });
    const now = eventTime.effectiveAt;
    const resolvedShift = await this.shiftsService.getSegmentForPunch(user, now);
    const timezone = resolvedShift?.timezone || process.env.APP_TIMEZONE || "Asia/Dubai";

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

    let shiftDate = localDate;
    let shiftPresetId: string | null = null;
    let shiftPresetSegmentId: string | null = null;
    let scheduledStartLocal: string | null = null;
    let scheduledEndLocal: string | null = null;

    let isLate = false;
    let lateMinutes = 0;

    if (resolvedShift) {
      shiftDate = resolvedShift.segment.shiftDate;
      shiftPresetId = resolvedShift.preset.id;
      shiftPresetSegmentId = resolvedShift.segment.segmentId;
      scheduledStartLocal = resolvedShift.segment.scheduleStartLocal;
      scheduledEndLocal = resolvedShift.segment.scheduleEndLocal;

      const nowStamp = this.localMinuteStampFromDate(now, timezone);
      const scheduleStartStamp = this.localMinuteStamp(scheduledStartLocal);
      const rawLate = nowStamp - scheduleStartStamp - resolvedShift.segment.lateGraceMinutes;
      lateMinutes = Math.min(this.maxLateMinutes(), Math.max(0, rawLate));
      isLate = lateMinutes > 0;
    } else if (user.teamId) {
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
        shiftPresetId,
        shiftPresetSegmentId,
        shiftDate,
        localDate,
        scheduledStartLocal,
        scheduledEndLocal,
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
          shiftDate,
          isLate,
          lateMinutes,
          shiftPresetId,
          shiftPresetSegmentId,
          scheduledStartLocal,
          scheduledEndLocal,
          clientTimestamp: clientTimestamp || null,
          time: serializeEventTime(eventTime),
        },
      },
    });

    return created;
  }

  async punchOff(user: User, note?: string, clientTimestamp?: string) {
    let active = await this.prisma.dutySession.findFirst({
      where: {
        userId: user.id,
        status: DutySessionStatus.ACTIVE,
      },
      orderBy: {
        punchedOnAt: "desc",
      },
    });

    if (!active) {
      // Fallback: Check if the session was recently auto-closed while the user was offline.
      // This allows the offline "Punch OFF" action to correct the auto-closed record
      // with the actual client timestamp.
      const lastClosed = await this.prisma.dutySession.findFirst({
        where: {
          userId: user.id,
          status: DutySessionStatus.CLOSED,
        },
        orderBy: {
          punchedOnAt: "desc",
        },
      });

      if (lastClosed?.note?.includes("AUTO_CLOSED_STALE_SESSION")) {
        active = lastClosed;
      }
    }

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
      active.scheduledStartLocal,
      active.scheduledEndLocal,
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
    scheduledStartLocal?: string | null,
    scheduledEndLocal?: string | null,
  ): number {
    if (scheduledStartLocal && scheduledEndLocal) {
      const punchOnStamp = this.localMinuteStampFromDate(punchedOnAt, timeZone);
      const punchOffStamp = this.localMinuteStampFromDate(punchedOffAt, timeZone);
      const scheduledStartStamp = this.localMinuteStamp(scheduledStartLocal);
      const scheduledEndStamp = this.localMinuteStamp(scheduledEndLocal);

      const effectivePunchOffStamp = Math.max(punchOffStamp, punchOnStamp);
      const earlyOvertime = Math.max(0, scheduledStartStamp - punchOnStamp);
      const lateOvertime = Math.max(0, effectivePunchOffStamp - scheduledEndStamp);
      return Math.min(this.maxOvertimeMinutes(), earlyOvertime + lateOvertime);
    }

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

  private localMinuteStamp(localDateTimeValue: string): number {
    const [datePart, timePart] = localDateTimeValue.split("T");
    const [year, month, day] = datePart.split("-").map((value) => Number(value));
    const [hour, minute] = timePart.split(":").map((value) => Number(value));
    return Date.UTC(year, month - 1, day, hour, minute, 0, 0) / 60000;
  }

  private localMinuteStampFromDate(date: Date, timeZone: string): number {
    const parts = getTimePartsInZone(date, timeZone);
    return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0, 0) / 60000;
  }
}
