import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { BreakSessionStatus, DutySessionStatus, Prisma, User } from "@prisma/client";
import {
  ClientSyncIdentity,
  ClientSyncService,
  CLIENT_SYNC_ACTION,
  CLIENT_SYNC_STATUS,
} from "../client-sync/client-sync.service";
import {
  formatDateInZone,
  localMinuteStampInZone,
  resolveEventTime,
  serializeEventTime,
} from "../core";
import { DeductionsService } from "../deductions/deductions.service";
import { PrismaService } from "../prisma/prisma.service";
import { CreateBreakPolicyDto } from "./dto/create-break-policy.dto";
import { EndBreakDto } from "./dto/end-break.dto";
import { StartBreakDto } from "./dto/start-break.dto";

type BreakWithPolicy = Prisma.BreakSessionGetPayload<{
  include: {
    breakPolicy: true;
  };
}>;

@Injectable()
export class BreaksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly deductionsService: DeductionsService,
    private readonly clientSyncService: ClientSyncService,
  ) { }

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
      select: {
        id: true,
        localDate: true,
        dutySessionId: true,
        startedAt: true,
        endedAt: true,
        expectedDurationMinutes: true,
        actualMinutes: true,
        status: true,
        isOvertime: true,
        breakPolicy: {
          select: {
            code: true,
            name: true,
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
      select: {
        id: true,
        localDate: true,
        dutySessionId: true,
        startedAt: true,
        endedAt: true,
        expectedDurationMinutes: true,
        actualMinutes: true,
        status: true,
        isOvertime: true,
        breakPolicy: {
          select: {
            code: true,
            name: true,
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
    limit?: string;
    offset?: string;
  }) {
    const today = formatDateInZone(
      new Date(),
      process.env.APP_TIMEZONE || "Asia/Dubai",
    );
    const from = params.from || today;
    const to = params.to || from;

    const take = this.parseTake(params.limit);
    const skip = this.parseSkip(params.offset);

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
      select: {
        id: true,
        localDate: true,
        startedAt: true,
        endedAt: true,
        expectedDurationMinutes: true,
        actualMinutes: true,
        status: true,
        isOvertime: true,
        breakPolicy: {
          select: {
            code: true,
            name: true,
          },
        },
        user: {
          select: {
            displayName: true,
            profilePhotoUrl: true,
            team: {
              select: {
                name: true,
              },
            },
          },
        },
      },
      orderBy: [{ localDate: "desc" }, { startedAt: "desc" }],
      ...(take ? { take } : {}),
      ...(skip ? { skip } : {}),
    });
  }

  async startBreak(user: User, dto: StartBreakDto) {
    const identity = this.toClientSyncIdentity(dto);
    const receipt = await this.clientSyncService.findReceiptResponse<unknown>(
      user.id,
      identity,
    );
    if (receipt) {
      return receipt;
    }

    const normalizedCode = dto.code.toLowerCase().trim();
    const clientTimestamp = dto.clientTimestamp;
    const eventTime = resolveEventTime(clientTimestamp, {
      maxPastHours: this.envNumber("MAX_CLIENT_PAST_HOURS", 72),
      maxFutureMinutes: this.envNumber("MAX_CLIENT_FUTURE_MINUTES", 2),
      highTrustSkewMinutes: this.envNumber("HIGH_TRUST_SKEW_MINUTES", 2),
    });
    const policy = await this.prisma.breakPolicy.findUnique({
      where: { code: normalizedCode },
    });

    if (!policy || !policy.isActive) {
      throw new NotFoundException("Break policy not found");
    }

    const explicitDutyResolution =
      !!dto.dutySessionId || !!identity.clientDutySessionRef;
    const resolvedDutySessionId = await this.clientSyncService.resolveDutySessionId(
      user.id,
      identity,
      dto.dutySessionId,
    );

    let activeDuty = resolvedDutySessionId
      ? await this.prisma.dutySession.findFirst({
          where: {
            id: resolvedDutySessionId,
            userId: user.id,
          },
        })
      : null;

    if (!activeDuty && explicitDutyResolution) {
      throw new BadRequestException("Queued duty session has not synced yet");
    }

    if (!activeDuty) {
      activeDuty = await this.prisma.dutySession.findFirst({
        where: { userId: user.id, status: DutySessionStatus.ACTIVE },
        orderBy: { punchedOnAt: "desc" },
      });
    }

    if (!activeDuty) {
      throw new BadRequestException(
        "Cannot start break without active duty session",
      );
    }

    if (activeDuty.status !== DutySessionStatus.ACTIVE) {
      throw new BadRequestException("Target duty session is no longer active");
    }

    let now = eventTime.effectiveAt;
    let timeAnomaly = eventTime.anomaly;
    if (now.getTime() < activeDuty.punchedOnAt.getTime()) {
      now = new Date(activeDuty.punchedOnAt);
      timeAnomaly = timeAnomaly
        ? `${timeAnomaly}|BREAK_START_BEFORE_DUTY_START_CLAMPED`
        : "BREAK_START_BEFORE_DUTY_START_CLAMPED";
    }

    const timezone = process.env.APP_TIMEZONE || "Asia/Dubai";

    let [activeBreak, priorSamePolicyBreaks] = await Promise.all([
      this.prisma.breakSession.findFirst({
        where: { userId: user.id, status: BreakSessionStatus.ACTIVE },
        include: {
          breakPolicy: true,
          dutySession: {
            select: {
              id: true,
              status: true,
            },
          },
        },
        orderBy: {
          startedAt: "desc",
        },
      }),
      this.prisma.breakSession.findMany({
        where: {
          dutySessionId: activeDuty.id,
          breakPolicyId: policy.id,
          status: {
            in: [
              BreakSessionStatus.ACTIVE,
              BreakSessionStatus.COMPLETED,
              BreakSessionStatus.AUTO_CLOSED,
            ],
          },
        },
        include: {
          breakPolicy: true,
        },
        orderBy: {
          startedAt: "asc",
        },
      }),
    ]);

    if (
      activeBreak &&
      (activeBreak.dutySessionId !== activeDuty.id ||
        activeBreak.dutySession?.status !== DutySessionStatus.ACTIVE)
    ) {
      let endedAt = now;
      if (endedAt.getTime() < activeBreak.startedAt.getTime()) {
        endedAt = new Date(activeBreak.startedAt);
      }

      const actualMinutes = Math.max(
        0,
        localMinuteStampInZone(endedAt, timezone) -
          localMinuteStampInZone(activeBreak.startedAt, timezone),
      );

      const closedBreak = await this.prisma.breakSession.update({
        where: { id: activeBreak.id },
        data: {
          endedAt,
          actualMinutes,
          isOvertime: actualMinutes > activeBreak.expectedDurationMinutes,
          autoClosed: true,
          status: BreakSessionStatus.AUTO_CLOSED,
        },
        include: {
          breakPolicy: true,
          dutySession: {
            select: {
              id: true,
              status: true,
            },
          },
        },
      });

      this.prisma.auditEvent.create({
        data: {
          actorUserId: user.id,
          action: "BREAK_AUTO_CLOSE_ORPHANED",
          entityType: "BreakSession",
          entityId: closedBreak.id,
          payload: {
            priorDutySessionId: activeBreak.dutySessionId,
            replacementDutySessionId: activeDuty.id,
            code: closedBreak.breakPolicy.code,
            actualMinutes,
          },
        },
      }).catch(() => { /* audit failure is non-critical */ });

      activeBreak = null;
      priorSamePolicyBreaks = priorSamePolicyBreaks.map((breakSession) =>
        breakSession.id === closedBreak.id ? closedBreak : breakSession,
      );
    }

    if (activeBreak) {
      if (
        activeBreak.dutySessionId === activeDuty.id &&
        activeBreak.breakPolicy.code === policy.code
      ) {
        const response = await this.persistStaleBreakStart(
          user.id,
          identity,
          clientTimestamp,
          activeBreak,
          policy.dailyLimit,
          activeDuty.id,
          "BREAK_ALREADY_RECORDED_FROM_ANOTHER_DEVICE",
        );
        return response;
      }
      throw new BadRequestException("You already have an active break");
    }

    const staleCandidate = this.selectCanonicalSamePolicyBreak(
      priorSamePolicyBreaks,
      now,
    );
    if (staleCandidate) {
      const response = await this.persistStaleBreakStart(
        user.id,
        identity,
        clientTimestamp,
        staleCandidate,
        policy.dailyLimit,
        activeDuty.id,
        "BREAK_ALREADY_RECORDED_FROM_ANOTHER_DEVICE",
      );
      return response;
    }

    const localDate = formatDateInZone(now, timezone);
    const usedCount = priorSamePolicyBreaks.length;
    const isOverLimit = usedCount >= policy.dailyLimit;

    let created: BreakWithPolicy;
    try {
      created = await this.prisma.$transaction(async (tx) => {
        const createdBreak = await tx.breakSession.create({
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

        await this.clientSyncService.saveDutySessionRef(
          tx,
          user.id,
          identity,
          activeDuty.id,
        );
        await this.clientSyncService.saveBreakSessionRef(
          tx,
          user.id,
          identity,
          createdBreak.id,
        );

        const response = this.buildBreakResponse(createdBreak, identity, {
          syncStatus: CLIENT_SYNC_STATUS.APPLIED,
          syncReason: null,
          isOverLimit,
          usedCount: usedCount + 1,
          dailyLimit: policy.dailyLimit,
          quotaScope: "DUTY_SESSION",
          quotaScopeId: activeDuty.id,
        });

        await this.clientSyncService.recordReceipt(tx, {
          userId: user.id,
          identity,
          actionType: CLIENT_SYNC_ACTION.BREAK_START,
          clientTimestamp,
          status: CLIENT_SYNC_STATUS.APPLIED,
          resolvedDutySessionId: activeDuty.id,
          resolvedBreakSessionId: createdBreak.id,
          response,
        });

        return createdBreak;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new BadRequestException("You already have an active break");
      }
      throw error;
    }

    this.prisma.auditEvent.create({
      data: {
        actorUserId: user.id,
        action: isOverLimit ? "BREAK_START_OVER_LIMIT" : "BREAK_START",
        entityType: "BreakSession",
        entityId: created.id,
        payload: {
          code: policy.code,
          localDate,
          quotaScope: "DUTY_SESSION",
          quotaScopeId: activeDuty.id,
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

    return this.buildBreakResponse(created, identity, {
      syncStatus: CLIENT_SYNC_STATUS.APPLIED,
      syncReason: null,
      isOverLimit,
      usedCount: usedCount + 1,
      dailyLimit: policy.dailyLimit,
      quotaScope: "DUTY_SESSION",
      quotaScopeId: activeDuty.id,
    });
  }

  async endBreak(user: User, dto: EndBreakDto) {
    const identity = this.toClientSyncIdentity(dto);
    const receipt = await this.clientSyncService.findReceiptResponse<unknown>(
      user.id,
      identity,
    );
    if (receipt) {
      return receipt;
    }

    const clientTimestamp = dto.clientTimestamp;
    const explicitBreakResolution = !!dto.breakSessionId || !!identity.clientBreakRef;
    const resolvedBreakSessionId = await this.clientSyncService.resolveBreakSessionId(
      user.id,
      identity,
      dto.breakSessionId,
    );

    let activeBreak = resolvedBreakSessionId
      ? await this.prisma.breakSession.findFirst({
          where: {
            id: resolvedBreakSessionId,
            userId: user.id,
          },
          include: {
            breakPolicy: true,
          },
        })
      : null;

    if (!activeBreak && explicitBreakResolution) {
      throw new BadRequestException("Queued break has not synced yet");
    }

    if (!activeBreak) {
      activeBreak = await this.prisma.breakSession.findFirst({
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
    }

    if (!activeBreak) {
      throw new NotFoundException("No active break found");
    }

    if (activeBreak.status === BreakSessionStatus.COMPLETED || activeBreak.status === BreakSessionStatus.AUTO_CLOSED) {
      return this.persistResolvedBreakNoop(
        user.id,
        identity,
        clientTimestamp,
        activeBreak,
        CLIENT_SYNC_ACTION.BREAK_END,
        CLIENT_SYNC_STATUS.IDEMPOTENT,
        "BREAK_ALREADY_ENDED",
      );
    }

    if (activeBreak.status === BreakSessionStatus.CANCELLED) {
      return this.persistResolvedBreakNoop(
        user.id,
        identity,
        clientTimestamp,
        activeBreak,
        CLIENT_SYNC_ACTION.BREAK_END,
        CLIENT_SYNC_STATUS.STALE,
        "BREAK_ALREADY_CANCELLED",
      );
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

    const timezone = process.env.APP_TIMEZONE || "Asia/Dubai";
    const actualMinutes = Math.max(
      0,
      localMinuteStampInZone(endedAt, timezone) -
        localMinuteStampInZone(activeBreak.startedAt, timezone),
    );
    const isOvertime = actualMinutes > activeBreak.expectedDurationMinutes;

    const updated = await this.prisma.$transaction(async (tx) => {
      const completedBreak = await tx.breakSession.update({
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

      await this.clientSyncService.saveBreakSessionRef(
        tx,
        user.id,
        identity,
        completedBreak.id,
      );

      const response = this.buildBreakResponse(completedBreak, identity, {
        syncStatus: CLIENT_SYNC_STATUS.APPLIED,
        syncReason: null,
      });

      await this.clientSyncService.recordReceipt(tx, {
        userId: user.id,
        identity,
        actionType: CLIENT_SYNC_ACTION.BREAK_END,
        clientTimestamp,
        status: CLIENT_SYNC_STATUS.APPLIED,
        resolvedDutySessionId: completedBreak.dutySessionId,
        resolvedBreakSessionId: completedBreak.id,
        response,
      });

      return completedBreak;
    });

    if (isOvertime) {
      const breakOvertimeMinutes = Math.max(
        0,
        actualMinutes - activeBreak.expectedDurationMinutes,
      );
      await this.deductionsService
        .recordBreakLateFromBreakSession({
          breakSessionId: updated.id,
          userId: updated.userId,
          localDate: updated.localDate,
          breakOvertimeMinutes,
          actorUserId: user.id,
        })
        .catch(() => undefined);
    }

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

    return this.buildBreakResponse(updated, identity, {
      syncStatus: CLIENT_SYNC_STATUS.APPLIED,
      syncReason: null,
    });
  }

  async cancelBreak(user: User, dto: EndBreakDto) {
    const identity = this.toClientSyncIdentity(dto);
    const receipt = await this.clientSyncService.findReceiptResponse<unknown>(
      user.id,
      identity,
    );
    if (receipt) {
      return receipt;
    }

    const clientTimestamp = dto.clientTimestamp;
    const explicitBreakResolution = !!dto.breakSessionId || !!identity.clientBreakRef;
    const resolvedBreakSessionId = await this.clientSyncService.resolveBreakSessionId(
      user.id,
      identity,
      dto.breakSessionId,
    );

    let activeBreak = resolvedBreakSessionId
      ? await this.prisma.breakSession.findFirst({
          where: {
            id: resolvedBreakSessionId,
            userId: user.id,
          },
        })
      : null;

    if (!activeBreak && explicitBreakResolution) {
      throw new BadRequestException("Queued break has not synced yet");
    }

    if (!activeBreak) {
      activeBreak = await this.prisma.breakSession.findFirst({
        where: {
          userId: user.id,
          status: BreakSessionStatus.ACTIVE,
        },
        orderBy: {
          startedAt: "desc",
        },
      });
    }

    if (!activeBreak) {
      throw new NotFoundException("No active break to cancel");
    }

    if (activeBreak.status === BreakSessionStatus.CANCELLED) {
      return this.persistResolvedBreakNoop(
        user.id,
        identity,
        clientTimestamp,
        await this.prisma.breakSession.findFirstOrThrow({
          where: { id: activeBreak.id, userId: user.id },
          include: { breakPolicy: true },
        }),
        CLIENT_SYNC_ACTION.BREAK_CANCEL,
        CLIENT_SYNC_STATUS.IDEMPOTENT,
        "BREAK_ALREADY_CANCELLED",
      );
    }

    if (activeBreak.status === BreakSessionStatus.COMPLETED || activeBreak.status === BreakSessionStatus.AUTO_CLOSED) {
      return this.persistResolvedBreakNoop(
        user.id,
        identity,
        clientTimestamp,
        await this.prisma.breakSession.findFirstOrThrow({
          where: { id: activeBreak.id, userId: user.id },
          include: { breakPolicy: true },
        }),
        CLIENT_SYNC_ACTION.BREAK_CANCEL,
        CLIENT_SYNC_STATUS.STALE,
        "BREAK_ALREADY_ENDED",
      );
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

    const updated = await this.prisma.$transaction(async (tx) => {
      const cancelledBreak = await tx.breakSession.update({
        where: {
          id: activeBreak.id,
        },
        data: {
          status: BreakSessionStatus.CANCELLED,
          cancelledAt,
          cancelledById: user.id,
        },
        include: {
          breakPolicy: true,
        },
      });

      await this.clientSyncService.saveBreakSessionRef(
        tx,
        user.id,
        identity,
        cancelledBreak.id,
      );

      const response = this.buildBreakResponse(cancelledBreak, identity, {
        syncStatus: CLIENT_SYNC_STATUS.APPLIED,
        syncReason: null,
      });

      await this.clientSyncService.recordReceipt(tx, {
        userId: user.id,
        identity,
        actionType: CLIENT_SYNC_ACTION.BREAK_CANCEL,
        clientTimestamp,
        status: CLIENT_SYNC_STATUS.APPLIED,
        resolvedDutySessionId: cancelledBreak.dutySessionId,
        resolvedBreakSessionId: cancelledBreak.id,
        response,
      });

      return cancelledBreak;
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

    return this.buildBreakResponse(updated, identity, {
      syncStatus: CLIENT_SYNC_STATUS.APPLIED,
      syncReason: null,
    });
  }

  private async persistStaleBreakStart(
    userId: string,
    identity: ClientSyncIdentity,
    clientTimestamp: string | undefined,
    canonicalBreak: BreakWithPolicy,
    dailyLimit: number,
    quotaScopeId: string,
    syncReason: string,
  ) {
    const usedCount = await this.prisma.breakSession.count({
      where: {
        dutySessionId: canonicalBreak.dutySessionId,
        breakPolicyId: canonicalBreak.breakPolicyId,
        status: {
          in: [
            BreakSessionStatus.ACTIVE,
            BreakSessionStatus.COMPLETED,
            BreakSessionStatus.AUTO_CLOSED,
          ],
        },
      },
    });

    const response = this.buildBreakResponse(canonicalBreak, identity, {
      syncStatus: CLIENT_SYNC_STATUS.STALE,
      syncReason,
      isOverLimit: usedCount > dailyLimit,
      usedCount,
      dailyLimit,
      quotaScope: "DUTY_SESSION",
      quotaScopeId,
    });

    await this.prisma.$transaction(async (tx) => {
      await this.clientSyncService.saveDutySessionRef(
        tx,
        userId,
        identity,
        canonicalBreak.dutySessionId ?? quotaScopeId,
      );
      await this.clientSyncService.saveBreakSessionRef(
        tx,
        userId,
        identity,
        canonicalBreak.id,
      );
      await this.clientSyncService.recordReceipt(tx, {
        userId,
        identity,
        actionType: CLIENT_SYNC_ACTION.BREAK_START,
        clientTimestamp,
        status: CLIENT_SYNC_STATUS.STALE,
        rejectionReason: syncReason,
        resolvedDutySessionId: canonicalBreak.dutySessionId ?? quotaScopeId,
        resolvedBreakSessionId: canonicalBreak.id,
        response,
      });
    });

    return response;
  }

  private async persistResolvedBreakNoop(
    userId: string,
    identity: ClientSyncIdentity,
    clientTimestamp: string | undefined,
    canonicalBreak: BreakWithPolicy,
    actionType: typeof CLIENT_SYNC_ACTION.BREAK_END | typeof CLIENT_SYNC_ACTION.BREAK_CANCEL,
    syncStatus: typeof CLIENT_SYNC_STATUS.IDEMPOTENT | typeof CLIENT_SYNC_STATUS.STALE,
    syncReason: string,
  ) {
    const response = this.buildBreakResponse(canonicalBreak, identity, {
      syncStatus,
      syncReason,
    });

    await this.prisma.$transaction(async (tx) => {
      await this.clientSyncService.saveBreakSessionRef(
        tx,
        userId,
        identity,
        canonicalBreak.id,
      );
      await this.clientSyncService.recordReceipt(tx, {
        userId,
        identity,
        actionType,
        clientTimestamp,
        status: syncStatus,
        rejectionReason: syncReason,
        resolvedDutySessionId: canonicalBreak.dutySessionId,
        resolvedBreakSessionId: canonicalBreak.id,
        response,
      });
    });

    return response;
  }

  private buildBreakResponse(
    session: BreakWithPolicy,
    identity: ClientSyncIdentity,
    extras: Record<string, unknown>,
  ) {
    return {
      ...session,
      breakSessionId: session.id,
      dutySessionId: session.dutySessionId,
      clientBreakRef: identity.clientBreakRef ?? null,
      clientDutySessionRef: identity.clientDutySessionRef ?? null,
      ...extras,
    };
  }

  private selectCanonicalSamePolicyBreak(
    breaks: BreakWithPolicy[],
    eventAt: Date,
  ): BreakWithPolicy | null {
    if (breaks.length === 0) {
      return null;
    }

    const latestBreak = breaks[breaks.length - 1];
    const latestRelevantAt = latestBreak.endedAt ?? latestBreak.startedAt;

    if (eventAt.getTime() > latestRelevantAt.getTime()) {
      return null;
    }

    return (
      breaks.find((item) => item.startedAt.getTime() >= eventAt.getTime()) ??
      latestBreak
    );
  }

  private toClientSyncIdentity(
    dto?: Pick<
      StartBreakDto | EndBreakDto,
      "clientActionId" | "clientDeviceId" | "clientDutySessionRef" | "clientBreakRef"
    >,
  ): ClientSyncIdentity {
    return {
      clientActionId: dto?.clientActionId,
      clientDeviceId: dto?.clientDeviceId,
      clientDutySessionRef: dto?.clientDutySessionRef,
      clientBreakRef: dto?.clientBreakRef,
    };
  }

  private envNumber(name: string, fallback: number): number {
    const parsed = Number(process.env[name]);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
    return fallback;
  }

  private parseTake(limit?: string): number | undefined {
    if (!limit) return undefined;
    const parsed = Number(limit);
    if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
    return Math.min(500, Math.trunc(parsed));
  }

  private parseSkip(offset?: string): number | undefined {
    if (!offset) return undefined;
    const parsed = Number(offset);
    if (!Number.isFinite(parsed) || parsed < 0) return undefined;
    return Math.trunc(parsed);
  }
}
