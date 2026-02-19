import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { BreakSessionStatus, DutySessionStatus, User } from "@prisma/client";
import { formatDateInZone, resolveEventTime, serializeEventTime } from "../core";
import { PrismaService } from "../prisma/prisma.service";
import { CreateBreakPolicyDto } from "./dto/create-break-policy.dto";

@Injectable()
export class BreaksService {
  constructor(private readonly prisma: PrismaService) { }

  async listPolicies() {
    return this.prisma.breakPolicy.findMany({
      where: {
        isActive: true,
      },
      orderBy: {
        code: "asc",
      },
    });
  }

  async createPolicy(dto: CreateBreakPolicyDto) {
    return this.prisma.breakPolicy.create({
      data: {
        code: dto.code.toLowerCase(),
        name: dto.name,
        expectedDurationMinutes: dto.expectedDurationMinutes,
        dailyLimit: dto.dailyLimit,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async myTodayBreaks(userId: string) {
    const localDate = formatDateInZone(
      new Date(),
      process.env.APP_TIMEZONE || "Asia/Dubai",
    );

    return this.prisma.breakSession.findMany({
      where: {
        userId,
        OR: [
          { localDate },
          { status: BreakSessionStatus.ACTIVE },
        ],
      },
      include: {
        breakPolicy: true,
        dutySession: {
          select: {
            id: true,
            shiftDate: true,
            status: true,
          },
        },
      },
      orderBy: {
        startedAt: "desc",
      },
    });
  }

  async myActiveBreak(userId: string) {
    return this.prisma.breakSession.findFirst({
      where: {
        userId,
        status: BreakSessionStatus.ACTIVE,
      },
      include: {
        breakPolicy: true,
        dutySession: {
          select: {
            id: true,
            shiftDate: true,
            status: true,
          },
        },
      },
      orderBy: {
        startedAt: "desc",
      },
    });
  }

  async listBreakHistory(params: {
    from?: string;
    to?: string;
    teamId?: string;
    userId?: string;
    status?: BreakSessionStatus;
  }) {
    const today = formatDateInZone(
      new Date(),
      process.env.APP_TIMEZONE || "Asia/Dubai",
    );
    const from = params.from || today;
    const to = params.to || from;

    return this.prisma.breakSession.findMany({
      where: {
        localDate: {
          gte: from,
          lte: to,
        },
        ...(params.teamId ? { user: { teamId: params.teamId } } : {}),
        ...(params.userId ? { userId: params.userId } : {}),
        ...(params.status ? { status: params.status } : {}),
      },
      include: {
        breakPolicy: true,
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            team: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        dutySession: {
          select: {
            id: true,
            shiftDate: true,
            status: true,
          },
        },
      },
      orderBy: [{ localDate: "desc" }, { startedAt: "desc" }],
    });
  }

  async startBreak(user: User, code: string, clientTimestamp?: string) {
    const normalizedCode = code.toLowerCase().trim();

    // Fetch all three prerequisites in parallel
    const [policy, activeDuty, activeBreak] = await Promise.all([
      this.prisma.breakPolicy.findUnique({ where: { code: normalizedCode } }),
      this.prisma.dutySession.findFirst({
        where: { userId: user.id, status: DutySessionStatus.ACTIVE },
        orderBy: { punchedOnAt: "desc" },
      }),
      this.prisma.breakSession.findFirst({
        where: { userId: user.id, status: BreakSessionStatus.ACTIVE },
      }),
    ]);

    if (!policy || !policy.isActive) {
      throw new NotFoundException("Break policy not found");
    }

    if (!activeDuty) {
      throw new BadRequestException(
        "Cannot start break without active duty session",
      );
    }

    if (activeBreak) {
      throw new BadRequestException("You already have an active break");
    }

    const eventTime = resolveEventTime(clientTimestamp, {
      maxPastHours: this.envNumber("MAX_CLIENT_PAST_HOURS", 72),
      maxFutureMinutes: this.envNumber("MAX_CLIENT_FUTURE_MINUTES", 2),
      highTrustSkewMinutes: this.envNumber("HIGH_TRUST_SKEW_MINUTES", 2),
    });
    let now = eventTime.effectiveAt;
    let timeAnomaly = eventTime.anomaly;
    if (now.getTime() < activeDuty.punchedOnAt.getTime()) {
      now = new Date(activeDuty.punchedOnAt);
      timeAnomaly = timeAnomaly
        ? `${timeAnomaly}|BREAK_START_BEFORE_DUTY_START_CLAMPED`
        : "BREAK_START_BEFORE_DUTY_START_CLAMPED";
    }

    const timezone = process.env.APP_TIMEZONE || "Asia/Dubai";
    const localDate = formatDateInZone(now, timezone);

    const usedCount = await this.prisma.breakSession.count({
      where: {
        userId: user.id,
        breakPolicyId: policy.id,
        localDate,
        status: {
          in: [
            BreakSessionStatus.ACTIVE,
            BreakSessionStatus.COMPLETED,
            BreakSessionStatus.AUTO_CLOSED,
          ],
        },
      },
    });

    // Soft limit: allow override but flag it
    const isOverLimit = usedCount >= policy.dailyLimit;

    const created = await this.prisma.breakSession.create({
      data: {
        userId: user.id,
        dutySessionId: activeDuty.id,
        breakPolicyId: policy.id,
        localDate,
        startedAt: now,
        expectedDurationMinutes: policy.expectedDurationMinutes,
        status: BreakSessionStatus.ACTIVE,
        createdById: user.id,
      },
      include: {
        breakPolicy: true,
      },
    });

    this.prisma.auditEvent.create({
      data: {
        actorUserId: user.id,
        action: isOverLimit ? "BREAK_START_OVER_LIMIT" : "BREAK_START",
        entityType: "BreakSession",
        entityId: created.id,
        payload: {
          code: policy.code,
          localDate,
          usedCountAfter: usedCount + 1,
          dailyLimit: policy.dailyLimit,
          isOverLimit,
          clientTimestamp: clientTimestamp || null,
          time: {
            ...serializeEventTime(eventTime),
            effectiveAt: now.toISOString(),
            anomaly: timeAnomaly,
          },
        },
      },
    }).catch(() => { /* audit failure is non-critical */ });

    return {
      ...created,
      isOverLimit,
      usedCount: usedCount + 1,
      dailyLimit: policy.dailyLimit,
    };
  }

  async endBreak(user: User, clientTimestamp?: string) {
    const activeBreak = await this.prisma.breakSession.findFirst({
      where: {
        userId: user.id,
        status: BreakSessionStatus.ACTIVE,
      },
      include: {
        breakPolicy: true,
      },
      orderBy: {
        startedAt: "desc",
      },
    });

    if (!activeBreak) {
      throw new NotFoundException("No active break found");
    }

    const eventTime = resolveEventTime(clientTimestamp, {
      maxPastHours: this.envNumber("MAX_CLIENT_PAST_HOURS", 72),
      maxFutureMinutes: this.envNumber("MAX_CLIENT_FUTURE_MINUTES", 2),
      highTrustSkewMinutes: this.envNumber("HIGH_TRUST_SKEW_MINUTES", 2),
    });
    let endedAt = eventTime.effectiveAt;
    let timeAnomaly = eventTime.anomaly;
    if (endedAt.getTime() < activeBreak.startedAt.getTime()) {
      endedAt = new Date(activeBreak.startedAt);
      timeAnomaly = timeAnomaly
        ? `${timeAnomaly}|BREAK_END_BEFORE_START_CLAMPED`
        : "BREAK_END_BEFORE_START_CLAMPED";
    }

    const actualMinutes = Math.max(
      0,
      Math.round((endedAt.getTime() - activeBreak.startedAt.getTime()) / 60000),
    );
    const isOvertime = actualMinutes > activeBreak.expectedDurationMinutes;

    const updated = await this.prisma.breakSession.update({
      where: { id: activeBreak.id },
      data: {
        endedAt,
        actualMinutes,
        isOvertime,
        status: BreakSessionStatus.COMPLETED,
      },
      include: {
        breakPolicy: true,
      },
    });

    this.prisma.auditEvent.create({
      data: {
        actorUserId: user.id,
        action: "BREAK_END",
        entityType: "BreakSession",
        entityId: updated.id,
        payload: {
          code: activeBreak.breakPolicy.code,
          actualMinutes,
          expectedDuration: activeBreak.expectedDurationMinutes,
          isOvertime,
          clientTimestamp: clientTimestamp || null,
          time: {
            ...serializeEventTime(eventTime),
            effectiveAt: endedAt.toISOString(),
            anomaly: timeAnomaly,
          },
        },
      },
    }).catch(() => { /* audit failure is non-critical */ });

    return updated;
  }

  async cancelBreak(user: User, clientTimestamp?: string) {
    const activeBreak = await this.prisma.breakSession.findFirst({
      where: {
        userId: user.id,
        status: BreakSessionStatus.ACTIVE,
      },
      orderBy: {
        startedAt: "desc",
      },
    });

    if (!activeBreak) {
      throw new NotFoundException("No active break to cancel");
    }

    const eventTime = resolveEventTime(clientTimestamp, {
      maxPastHours: this.envNumber("MAX_CLIENT_PAST_HOURS", 72),
      maxFutureMinutes: this.envNumber("MAX_CLIENT_FUTURE_MINUTES", 2),
      highTrustSkewMinutes: this.envNumber("HIGH_TRUST_SKEW_MINUTES", 2),
    });
    let cancelledAt = eventTime.effectiveAt;
    let timeAnomaly = eventTime.anomaly;
    if (cancelledAt.getTime() < activeBreak.startedAt.getTime()) {
      cancelledAt = new Date(activeBreak.startedAt);
      timeAnomaly = timeAnomaly
        ? `${timeAnomaly}|BREAK_CANCEL_BEFORE_START_CLAMPED`
        : "BREAK_CANCEL_BEFORE_START_CLAMPED";
    }

    const updated = await this.prisma.breakSession.update({
      where: {
        id: activeBreak.id,
      },
      data: {
        status: BreakSessionStatus.CANCELLED,
        cancelledAt,
        cancelledById: user.id,
      },
    });

    this.prisma.auditEvent.create({
      data: {
        actorUserId: user.id,
        action: "BREAK_CANCEL",
        entityType: "BreakSession",
        entityId: updated.id,
        payload: {
          localDate: activeBreak.localDate,
          clientTimestamp: clientTimestamp || null,
          time: {
            ...serializeEventTime(eventTime),
            effectiveAt: cancelledAt.toISOString(),
            anomaly: timeAnomaly,
          },
        },
      },
    }).catch(() => { /* audit failure is non-critical */ });

    return updated;
  }

  private envNumber(name: string, fallback: number): number {
    const parsed = Number(process.env[name]);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
    return fallback;
  }
}
