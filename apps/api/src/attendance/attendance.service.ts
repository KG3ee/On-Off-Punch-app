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

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
  ) { }

  async punchOn(user: User, note?: string, clientTimestamp?: string) {
    const now = clientTimestamp ? new Date(clientTimestamp) : new Date();
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
          lateMinutes = punchMinutes - shiftStartMin;
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

    const now = clientTimestamp ? new Date(clientTimestamp) : new Date();
    const timezone = process.env.APP_TIMEZONE || "Asia/Dubai";
    const workedMinutes = Math.max(
      0,
      Math.round((now.getTime() - active.punchedOnAt.getTime()) / 60000),
    );

    // Calculate overtime
    let overtimeMinutes = 0;

    if (user.teamId) {
      const team = await this.prisma.team.findUnique({
        where: { id: user.teamId },
      });

      if (team?.shiftStartTime && team?.shiftEndTime) {
        const shiftStartMin = parseTimeToMinutes(team.shiftStartTime);
        const shiftEndMin = parseTimeToMinutes(team.shiftEndTime);
        const punchOnMinutes = minutesNowInZone(active.punchedOnAt, timezone);
        const punchOffMinutes = minutesNowInZone(now, timezone);

        // Early overtime: punched on before shift start
        const earlyOT = Math.max(0, shiftStartMin - punchOnMinutes);
        // Late overtime: punched off after shift end
        const lateOT = Math.max(0, punchOffMinutes - shiftEndMin);
        overtimeMinutes = earlyOT + lateOT;
      }
    }

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
}
