import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  formatDateInZone,
} from "../core";
import { DutySessionStatus, User } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
  ) { }

  async punchOn(user: User, note?: string) {
    const now = new Date();
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
        isLate: false,
        lateMinutes: 0,
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
          segmentNo: null,
          lateMinutes: 0,
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
}
