import {
  BadRequestException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { BreakSessionStatus, DutySessionStatus, User } from '@prisma/client';
import { formatDateInZone } from '@modern-punch/core';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBreakPolicyDto } from './dto/create-break-policy.dto';

@Injectable()
export class BreaksService {
  constructor(private readonly prisma: PrismaService) {}

  async listPolicies() {
    return this.prisma.breakPolicy.findMany({
      where: {
        isActive: true
      },
      orderBy: {
        code: 'asc'
      }
    });
  }

  async createPolicy(dto: CreateBreakPolicyDto) {
    return this.prisma.breakPolicy.create({
      data: {
        code: dto.code.toLowerCase(),
        name: dto.name,
        expectedDurationMinutes: dto.expectedDurationMinutes,
        dailyLimit: dto.dailyLimit,
        isActive: dto.isActive ?? true
      }
    });
  }

  async myTodayBreaks(userId: string) {
    const localDate = formatDateInZone(new Date(), process.env.APP_TIMEZONE || 'Asia/Dubai');

    return this.prisma.breakSession.findMany({
      where: {
        userId,
        localDate
      },
      include: {
        breakPolicy: true,
        dutySession: {
          select: {
            id: true,
            shiftDate: true,
            status: true
          }
        }
      },
      orderBy: {
        startedAt: 'asc'
      }
    });
  }

  async myActiveBreak(userId: string) {
    return this.prisma.breakSession.findFirst({
      where: {
        userId,
        status: BreakSessionStatus.ACTIVE
      },
      include: {
        breakPolicy: true,
        dutySession: {
          select: {
            id: true,
            shiftDate: true,
            status: true
          }
        }
      },
      orderBy: {
        startedAt: 'desc'
      }
    });
  }

  async listBreakHistory(params: {
    from?: string;
    to?: string;
    teamId?: string;
    userId?: string;
    status?: BreakSessionStatus;
  }) {
    const today = formatDateInZone(new Date(), process.env.APP_TIMEZONE || 'Asia/Dubai');
    const from = params.from || today;
    const to = params.to || from;

    return this.prisma.breakSession.findMany({
      where: {
        localDate: {
          gte: from,
          lte: to
        },
        ...(params.teamId ? { user: { teamId: params.teamId } } : {}),
        ...(params.userId ? { userId: params.userId } : {}),
        ...(params.status ? { status: params.status } : {})
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
                name: true
              }
            }
          }
        },
        dutySession: {
          select: {
            id: true,
            shiftDate: true,
            status: true
          }
        }
      },
      orderBy: [{ localDate: 'desc' }, { startedAt: 'desc' }]
    });
  }

  async startBreak(user: User, code: string) {
    const normalizedCode = code.toLowerCase().trim();
    const policy = await this.prisma.breakPolicy.findUnique({
      where: {
        code: normalizedCode
      }
    });

    if (!policy || !policy.isActive) {
      throw new NotFoundException('Break policy not found');
    }

    const activeDuty = await this.prisma.dutySession.findFirst({
      where: {
        userId: user.id,
        status: DutySessionStatus.ACTIVE
      },
      orderBy: {
        punchedOnAt: 'desc'
      }
    });

    if (!activeDuty) {
      throw new BadRequestException('Cannot start break without active duty session');
    }

    const activeBreak = await this.prisma.breakSession.findFirst({
      where: {
        userId: user.id,
        status: BreakSessionStatus.ACTIVE
      }
    });

    if (activeBreak) {
      throw new BadRequestException('You already have an active break');
    }

    const timezone = process.env.APP_TIMEZONE || 'Asia/Dubai';
    const localDate = formatDateInZone(new Date(), timezone);

    const usedCount = await this.prisma.breakSession.count({
      where: {
        userId: user.id,
        breakPolicyId: policy.id,
        localDate,
        status: {
          in: [BreakSessionStatus.ACTIVE, BreakSessionStatus.COMPLETED, BreakSessionStatus.AUTO_CLOSED]
        }
      }
    });

    if (usedCount >= policy.dailyLimit) {
      throw new BadRequestException(
        `Daily limit reached for ${policy.code}. Limit: ${policy.dailyLimit}`
      );
    }

    const created = await this.prisma.breakSession.create({
      data: {
        userId: user.id,
        dutySessionId: activeDuty.id,
        breakPolicyId: policy.id,
        localDate,
        startedAt: new Date(),
        expectedDurationMinutes: policy.expectedDurationMinutes,
        status: BreakSessionStatus.ACTIVE,
        createdById: user.id
      },
      include: {
        breakPolicy: true
      }
    });

    await this.prisma.auditEvent.create({
      data: {
        actorUserId: user.id,
        action: 'BREAK_START',
        entityType: 'BreakSession',
        entityId: created.id,
        payload: {
          code: policy.code,
          localDate,
          usedCountAfter: usedCount + 1,
          dailyLimit: policy.dailyLimit
        }
      }
    });

    return created;
  }

  async endBreak(user: User) {
    const activeBreak = await this.prisma.breakSession.findFirst({
      where: {
        userId: user.id,
        status: BreakSessionStatus.ACTIVE
      },
      include: {
        breakPolicy: true
      },
      orderBy: {
        startedAt: 'desc'
      }
    });

    if (!activeBreak) {
      throw new NotFoundException('No active break found');
    }

    const endedAt = new Date();
    const actualMinutes = Math.max(
      0,
      Math.round((endedAt.getTime() - activeBreak.startedAt.getTime()) / 60000)
    );
    const isOvertime = actualMinutes > activeBreak.expectedDurationMinutes;

    const updated = await this.prisma.breakSession.update({
      where: { id: activeBreak.id },
      data: {
        endedAt,
        actualMinutes,
        isOvertime,
        status: BreakSessionStatus.COMPLETED
      },
      include: {
        breakPolicy: true
      }
    });

    await this.prisma.auditEvent.create({
      data: {
        actorUserId: user.id,
        action: 'BREAK_END',
        entityType: 'BreakSession',
        entityId: updated.id,
        payload: {
          code: activeBreak.breakPolicy.code,
          actualMinutes,
          expectedDuration: activeBreak.expectedDurationMinutes,
          isOvertime
        }
      }
    });

    return updated;
  }

  async cancelBreak(user: User) {
    const activeBreak = await this.prisma.breakSession.findFirst({
      where: {
        userId: user.id,
        status: BreakSessionStatus.ACTIVE
      },
      orderBy: {
        startedAt: 'desc'
      }
    });

    if (!activeBreak) {
      throw new NotFoundException('No active break to cancel');
    }

    const updated = await this.prisma.breakSession.update({
      where: {
        id: activeBreak.id
      },
      data: {
        status: BreakSessionStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelledById: user.id
      }
    });

    await this.prisma.auditEvent.create({
      data: {
        actorUserId: user.id,
        action: 'BREAK_CANCEL',
        entityType: 'BreakSession',
        entityId: updated.id,
        payload: {
          localDate: activeBreak.localDate
        }
      }
    });

    return updated;
  }
}
