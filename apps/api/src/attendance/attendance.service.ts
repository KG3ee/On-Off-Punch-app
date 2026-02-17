import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  formatDateInZone,
  minutesNowInZone,
  parseTimeToMinutes,
} from "../core";
import { DutySessionStatus, User } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { ShiftsService } from "../shifts/shifts.service";

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shiftsService: ShiftsService,
  ) { }

  async punchOn(user: User, note?: string) {
    const now = new Date();
    const timezone = process.env.APP_TIMEZONE || "Asia/Dubai";

    // Try to find an active shift segment, but don't fail if none exists
    let preset: Awaited<
      ReturnType<ShiftsService["getActiveSegmentForUser"]>
    >["preset"] | null = null;
    let segment: Awaited<
      ReturnType<ShiftsService["getActiveSegmentForUser"]>
    >["segment"] | null = null;

    try {
      const result = await this.shiftsService.getActiveSegmentForUser(
        user,
        now,
      );
      preset = result.preset;
      segment = result.segment;
    } catch {
      // No active segment — allow punch anyway
    }

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
    let lateMinutes = 0;

    if (segment) {
      lateMinutes = this.calculateLateMinutes(
        now,
        timezone,
        segment.startTime,
        segment.lateGraceMinutes,
        segment.crossesMidnight,
      );
    }

    const created = await this.prisma.dutySession.create({
      data: {
        userId: user.id,
        teamId: user.teamId || null,
        shiftPresetId: preset?.id || null,
        shiftPresetSegmentId: segment?.segmentId || null,
        shiftDate: segment?.shiftDate || localDate,
        localDate,
        scheduledStartLocal: segment?.scheduleStartLocal || null,
        scheduledEndLocal: segment?.scheduleEndLocal || null,
        punchedOnAt: now,
        status: DutySessionStatus.ACTIVE,
        isLate: lateMinutes > 0,
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
          shiftDate: segment?.shiftDate || localDate,
          segmentNo: segment?.segmentNo || null,
          lateMinutes,
        },
      },
    });

    return created;
  }

  async punchOff(user: User, note?: string) {
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

    const now = new Date();
    const workedMinutes = Math.max(
      0,
      Math.round((now.getTime() - active.punchedOnAt.getTime()) / 60000),
    );

    const updated = await this.prisma.dutySession.update({
      where: { id: active.id },
      data: {
        punchedOffAt: now,
        status: DutySessionStatus.CLOSED,
        note: note || active.note,
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
        localDate,
      },
      orderBy: {
        punchedOnAt: "asc",
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

  private calculateLateMinutes(
    now: Date,
    timezone: string,
    startTime: string,
    graceMinutes: number,
    crossesMidnight: boolean,
  ): number {
    const start = parseTimeToMinutes(startTime);
    let nowMinutes = minutesNowInZone(now, timezone);

    if (crossesMidnight && nowMinutes < start) {
      nowMinutes += 1440;
    }

    const threshold = start + graceMinutes;
    return Math.max(0, nowMinutes - threshold);
  }
}
