import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import {
  BreakSessionStatus,
  DutySessionStatus,
  Role,
  ShiftChangeRequestStatus
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LeaderService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveTeamId(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, teamId: true }
    });
    if (!user || user.role !== Role.LEADER) {
      throw new ForbiddenException('Only leaders can access this resource');
    }
    if (!user.teamId) {
      throw new BadRequestException('Leader is not assigned to any team');
    }
    return user.teamId;
  }

  async getTeamMembers(teamId: string) {
    return this.prisma.user.findMany({
      where: { teamId },
      select: {
        id: true,
        username: true,
        displayName: true,
        role: true,
        isActive: true,
        driverStatus: true
      },
      orderBy: { displayName: 'asc' }
    });
  }

  async getLiveBoard(teamId: string, localDate?: string) {
    const timezone = process.env.APP_TIMEZONE || 'Asia/Dubai';
    const date =
      localDate || new Date().toLocaleDateString('en-CA', { timeZone: timezone });

    const [activeDutySessions, todaySummary] = await Promise.all([
      this.prisma.dutySession.findMany({
        where: { status: DutySessionStatus.ACTIVE, teamId },
        select: {
          id: true,
          localDate: true,
          punchedOnAt: true,
          isLate: true,
          lateMinutes: true,
          user: { select: { id: true, username: true, displayName: true } },
          team: { select: { id: true, name: true } },
          breakSessions: {
            where: { status: 'ACTIVE' },
            select: {
              id: true,
              startedAt: true,
              breakPolicy: {
                select: { id: true, code: true, name: true, expectedDurationMinutes: true }
              }
            }
          },
          shiftPresetSegment: {
            select: { id: true, segmentNo: true, startTime: true, endTime: true, crossesMidnight: true }
          }
        },
        orderBy: { punchedOnAt: 'asc' }
      }),
      this.prisma.dutySession.aggregate({
        where: { localDate: date, teamId },
        _count: { _all: true },
        _sum: { lateMinutes: true }
      })
    ]);

    return {
      localDate: date,
      activeDutySessions,
      summary: {
        totalSessionsToday: todaySummary._count._all,
        totalLateMinutesToday: todaySummary._sum.lateMinutes || 0
      }
    };
  }

  async listTeamRequests(teamId: string) {
    return this.prisma.shiftChangeRequest.findMany({
      where: { user: { teamId } },
      include: {
        user: { select: { id: true, displayName: true, username: true } },
        reviewedBy: { select: { id: true, displayName: true, username: true } },
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  async approveRequest(requestId: string, reviewerId: string, teamId: string) {
    const req = await this.prisma.shiftChangeRequest.findUnique({
      where: { id: requestId },
      include: { user: { select: { teamId: true } } },
    });
    if (!req) throw new NotFoundException('Request not found');
    if (req.user.teamId !== teamId) {
      throw new ForbiddenException('This request belongs to a different team');
    }
    if (req.status !== ShiftChangeRequestStatus.PENDING) {
      throw new BadRequestException('Only pending requests can be approved');
    }

    return this.prisma.shiftChangeRequest.update({
      where: { id: requestId },
      data: {
        status: ShiftChangeRequestStatus.APPROVED,
        reviewedById: reviewerId,
        reviewedAt: new Date(),
      },
    });
  }

  async rejectRequest(requestId: string, reviewerId: string, teamId: string) {
    const existing = await this.prisma.shiftChangeRequest.findUnique({
      where: { id: requestId },
      include: { user: { select: { teamId: true } } }
    });
    if (!existing) throw new NotFoundException('Request not found');
    if (existing.user.teamId !== teamId) {
      throw new ForbiddenException('This request belongs to a different team');
    }
    if (existing.status !== ShiftChangeRequestStatus.PENDING) {
      throw new BadRequestException('Only pending requests can be rejected');
    }

    return this.prisma.shiftChangeRequest.update({
      where: { id: requestId },
      data: {
        status: ShiftChangeRequestStatus.REJECTED,
        reviewedById: reviewerId,
        reviewedAt: new Date()
      }
    });
  }

  async listAttendance(teamId: string, params: {
    from: string;
    to: string;
    userId?: string;
    status?: DutySessionStatus;
    limit?: string;
    offset?: string;
  }) {
    const take = params.limit ? Math.min(Math.max(parseInt(params.limit, 10) || 50, 1), 200) : 50;
    const skip = params.offset ? Math.max(parseInt(params.offset, 10) || 0, 0) : 0;

    return this.prisma.dutySession.findMany({
      where: {
        teamId,
        localDate: { gte: params.from, lte: params.to },
        ...(params.userId ? { userId: params.userId } : {}),
        ...(params.status ? { status: params.status } : {})
      },
      select: {
        id: true,
        shiftDate: true,
        localDate: true,
        punchedOnAt: true,
        punchedOffAt: true,
        status: true,
        isLate: true,
        lateMinutes: true,
        overtimeMinutes: true,
        user: { select: { id: true, username: true, displayName: true, role: true } },
        team: { select: { id: true, name: true } }
      },
      orderBy: [{ localDate: 'desc' }, { punchedOnAt: 'desc' }],
      take,
      skip
    });
  }

  async listBreakHistory(teamId: string, params: {
    from?: string;
    to?: string;
    userId?: string;
    status?: BreakSessionStatus;
    limit?: string;
    offset?: string;
  }) {
    const timezone = process.env.APP_TIMEZONE || 'Asia/Dubai';
    const today = new Date().toLocaleDateString('en-CA', { timeZone: timezone });
    const from = params.from || today;
    const to = params.to || from;

    const take = params.limit ? Math.min(Math.max(parseInt(params.limit, 10) || 50, 1), 200) : 50;
    const skip = params.offset ? Math.max(parseInt(params.offset, 10) || 0, 0) : 0;

    return this.prisma.breakSession.findMany({
      where: {
        localDate: { gte: from, lte: to },
        user: { teamId },
        ...(params.userId ? { userId: params.userId } : {}),
        ...(params.status ? { status: params.status } : {})
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
        breakPolicy: { select: { code: true, name: true } },
        user: { select: { id: true, username: true, displayName: true } }
      },
      orderBy: [{ localDate: 'desc' }, { startedAt: 'desc' }],
      take,
      skip
    });
  }

  async listShiftPresets() {
    return this.prisma.shiftPreset.findMany({
      where: { isActive: true },
      include: { segments: { orderBy: { segmentNo: 'asc' as const } } },
      orderBy: { name: 'asc' }
    });
  }

  async listDrivers() {
    return this.prisma.user.findMany({
      where: { role: Role.DRIVER },
      select: {
        id: true,
        displayName: true,
        username: true,
        driverStatus: true
      },
      orderBy: { displayName: 'asc' }
    });
  }
}
