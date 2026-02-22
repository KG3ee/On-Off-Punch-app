import {
  BadRequestException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import {
  AssignmentTargetType,
  Prisma,
  ShiftChangeRequestStatus,
  ShiftAssignment,
  ShiftPreset,
  ShiftPresetSegment,
  ShiftRequestType,
  User
} from '@prisma/client';
import {
  getTimePartsInZone,
  localDateTime,
  minutesNowInZone,
  parseTimeToMinutes,
  ResolvedShiftSegment,
  ShiftPresetInput,
  formatDateInZone,
  resolveActiveShiftSegment
} from '@modern-punch/core';
import { PrismaService } from '../prisma/prisma.service';
import { CreateShiftAssignmentDto } from './dto/create-shift-assignment.dto';
import { CreateShiftOverrideDto } from './dto/create-shift-override.dto';
import {
  CreateShiftPresetDto,
  CreateShiftSegmentDto
} from './dto/create-shift-preset.dto';
import { CreateShiftChangeRequestDto } from './dto/create-shift-change-request.dto';

type PresetWithSegments = ShiftPreset & { segments: ShiftPresetSegment[] };
type AssignmentWithPreset = ShiftAssignment & {
  shiftPreset: PresetWithSegments;
};

@Injectable()
export class ShiftsService {
  constructor(private readonly prisma: PrismaService) { }

  async createPreset(dto: CreateShiftPresetDto): Promise<PresetWithSegments> {
    const normalizedSegments = this.normalizeSegments(dto.segments);

    return this.prisma.shiftPreset.create({
      data: {
        name: dto.name,
        timezone: dto.timezone || process.env.APP_TIMEZONE || 'Asia/Dubai',
        teamId: dto.teamId,
        isDefault: dto.isDefault ?? false,
        segments: {
          create: normalizedSegments
        }
      },
      include: {
        segments: {
          orderBy: { segmentNo: 'asc' }
        }
      }
    });
  }

  async listPresets(): Promise<PresetWithSegments[]> {
    return this.prisma.shiftPreset.findMany({
      where: { isActive: true },
      include: {
        team: true,
        segments: {
          orderBy: { segmentNo: 'asc' }
        }
      },
      orderBy: [{ teamId: 'asc' }, { name: 'asc' }]
    });
  }

  async listAssignments(): Promise<AssignmentWithPreset[]> {
    return this.prisma.shiftAssignment.findMany({
      where: { isActive: true },
      include: {
        shiftPreset: {
          include: {
            segments: {
              orderBy: { segmentNo: 'asc' }
            }
          }
        }
      },
      orderBy: [{ targetType: 'asc' }, { targetId: 'asc' }, { effectiveFrom: 'desc' }]
    }) as Promise<AssignmentWithPreset[]>;
  }

  async createAssignment(dto: CreateShiftAssignmentDto) {
    const effectiveFrom = new Date(`${dto.effectiveFrom}T00:00:00.000Z`);
    const effectiveTo = dto.effectiveTo
      ? new Date(`${dto.effectiveTo}T23:59:59.999Z`)
      : null;

    if (effectiveTo && effectiveTo.getTime() < effectiveFrom.getTime()) {
      throw new BadRequestException('effectiveTo must be after or equal to effectiveFrom');
    }

    const previousPeriodEnd = new Date(effectiveFrom.getTime() - 1);

    return this.prisma.$transaction(async (tx) => {
      await tx.shiftAssignment.updateMany({
        where: {
          targetType: dto.targetType,
          targetId: dto.targetId,
          isActive: true,
          effectiveFrom: { lt: effectiveFrom },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: effectiveFrom } }]
        },
        data: {
          effectiveTo: previousPeriodEnd
        }
      });

      await tx.shiftAssignment.updateMany({
        where: {
          targetType: dto.targetType,
          targetId: dto.targetId,
          isActive: true,
          effectiveFrom
        },
        data: {
          isActive: false
        }
      });

      return tx.shiftAssignment.create({
        data: {
          targetType: dto.targetType,
          targetId: dto.targetId,
          shiftPresetId: dto.shiftPresetId,
          effectiveFrom,
          effectiveTo
        }
      });
    });
  }

  async createOverride(dto: CreateShiftOverrideDto) {
    return this.prisma.shiftOverride.create({
      data: {
        targetType: dto.targetType,
        targetId: dto.targetId,
        shiftPresetId: dto.shiftPresetId,
        overrideDate: new Date(`${dto.overrideDate}T00:00:00.000Z`),
        reason: dto.reason
      }
    });
  }

  async getSegmentForPunch(
    user: User & { team?: { id: string } | null },
    now: Date
  ): Promise<
    | {
      preset: PresetWithSegments;
      segment: ResolvedShiftSegment;
      timezone: string;
    }
    | null
  > {
    const preset = await this.resolvePresetForUser(user, now);
    if (!preset) {
      return null;
    }

    const timezone = preset.timezone || process.env.APP_TIMEZONE || 'Asia/Dubai';
    const corePreset = this.toCorePreset(preset);
    const activeSegment = resolveActiveShiftSegment(corePreset, now, timezone);
    const segment = activeSegment || this.resolveClosestSegment(corePreset, now, timezone);

    if (!segment) {
      return null;
    }

    return { preset, segment, timezone };
  }

  async getActiveSegmentForUser(user: User & { team?: { id: string } | null }, now: Date): Promise<{
    preset: PresetWithSegments;
    segment: ResolvedShiftSegment;
    timezone: string;
  }> {
    const preset = await this.resolvePresetForUser(user, now);
    if (!preset) {
      throw new NotFoundException('No shift preset assigned for this user');
    }

    const timezone = preset.timezone || process.env.APP_TIMEZONE || 'Asia/Dubai';
    const segment = resolveActiveShiftSegment(this.toCorePreset(preset), now, timezone);
    if (!segment) {
      throw new NotFoundException('No active shift segment right now');
    }

    return { preset, segment, timezone };
  }

  async resolvePresetForUser(
    user: User & { team?: { id: string } | null },
    now: Date
  ): Promise<PresetWithSegments | null> {
    const baseTimeZone = process.env.APP_TIMEZONE || 'Asia/Dubai';
    const localDate = formatDateInZone(now, baseTimeZone);
    const dayStart = new Date(`${localDate}T00:00:00.000Z`);
    const dayEnd = new Date(`${localDate}T23:59:59.999Z`);
    const instant = new Date(`${localDate}T12:00:00.000Z`);

    const userOverride = await this.findOverride(AssignmentTargetType.USER, user.id, dayStart, dayEnd);
    if (userOverride) return userOverride;

    if (user.teamId) {
      const teamOverride = await this.findOverride(AssignmentTargetType.TEAM, user.teamId, dayStart, dayEnd);
      if (teamOverride) return teamOverride;
    }

    const userAssignment = await this.findAssignment(AssignmentTargetType.USER, user.id, instant);
    if (userAssignment) return userAssignment;

    if (user.teamId) {
      const teamAssignment = await this.findAssignment(AssignmentTargetType.TEAM, user.teamId, instant);
      if (teamAssignment) return teamAssignment;
    }

    if (user.teamId) {
      const teamDefault = await this.prisma.shiftPreset.findFirst({
        where: {
          isActive: true,
          isDefault: true,
          teamId: user.teamId
        },
        include: { segments: { orderBy: { segmentNo: 'asc' } } }
      });
      if (teamDefault) return teamDefault;
    }

    return this.prisma.shiftPreset.findFirst({
      where: {
        isActive: true,
        isDefault: true,
        teamId: null
      },
      include: { segments: { orderBy: { segmentNo: 'asc' } } }
    });
  }

  private async findOverride(
    targetType: AssignmentTargetType,
    targetId: string,
    dayStart: Date,
    dayEnd: Date
  ): Promise<PresetWithSegments | null> {
    const override = await this.prisma.shiftOverride.findFirst({
      where: {
        targetType,
        targetId,
        overrideDate: {
          gte: dayStart,
          lte: dayEnd
        }
      },
      orderBy: { createdAt: 'desc' },
      include: {
        shiftPreset: {
          include: {
            segments: {
              orderBy: { segmentNo: 'asc' }
            }
          }
        }
      }
    });

    return (override?.shiftPreset as PresetWithSegments) || null;
  }

  private async findAssignment(
    targetType: AssignmentTargetType,
    targetId: string,
    instant: Date
  ): Promise<PresetWithSegments | null> {
    const assignment = await this.prisma.shiftAssignment.findFirst({
      where: {
        targetType,
        targetId,
        isActive: true,
        effectiveFrom: {
          lte: instant
        },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: instant } }]
      },
      orderBy: { effectiveFrom: 'desc' },
      include: {
        shiftPreset: {
          include: {
            segments: {
              orderBy: { segmentNo: 'asc' }
            }
          }
        }
      }
    });

    return (assignment?.shiftPreset as PresetWithSegments) || null;
  }

  private toCorePreset(preset: PresetWithSegments): ShiftPresetInput {
    return {
      id: preset.id,
      name: preset.name,
      teamId: preset.teamId,
      segments: [...preset.segments]
        .sort((a, b) => a.segmentNo - b.segmentNo)
        .map((segment) => ({
          id: segment.id,
          segmentNo: segment.segmentNo,
          startTime: segment.startTime,
          endTime: segment.endTime,
          crossesMidnight: segment.crossesMidnight,
          lateGraceMinutes: segment.lateGraceMinutes
        }))
    };
  }

  private normalizeSegments(
    segments: CreateShiftSegmentDto[]
  ): Prisma.ShiftPresetSegmentCreateWithoutShiftPresetInput[] {
    const sorted = [...segments].sort((a, b) => a.segmentNo - b.segmentNo);
    const seen = new Set<number>();

    return sorted.map((segment) => {
      if (segment.segmentNo <= 0) {
        throw new BadRequestException('segmentNo must be greater than zero');
      }

      if (seen.has(segment.segmentNo)) {
        throw new BadRequestException(`Duplicate segmentNo ${segment.segmentNo}`);
      }
      seen.add(segment.segmentNo);

      const startMinutes = parseTimeToMinutes(segment.startTime);
      const endMinutes = parseTimeToMinutes(segment.endTime);
      const inferredCrossesMidnight = endMinutes <= startMinutes;
      const lateGraceMinutes = segment.lateGraceMinutes ?? 10;

      if (lateGraceMinutes < 0) {
        throw new BadRequestException('lateGraceMinutes must be 0 or greater');
      }

      return {
        segmentNo: segment.segmentNo,
        startTime: segment.startTime,
        endTime: segment.endTime,
        crossesMidnight: segment.crossesMidnight ?? inferredCrossesMidnight,
        lateGraceMinutes
      };
    });
  }

  private resolveClosestSegment(
    preset: ShiftPresetInput,
    now: Date,
    timeZone: string
  ): ResolvedShiftSegment | null {
    const ordered = [...preset.segments].sort((a, b) => a.segmentNo - b.segmentNo);
    if (ordered.length === 0) {
      return null;
    }

    const nowMinutes = minutesNowInZone(now, timeZone);
    const today = formatDateInZone(now, timeZone);
    const candidate = ordered.reduce((best, current) => {
      const currentDistance = Math.abs(parseTimeToMinutes(current.startTime) - nowMinutes);
      if (!best) {
        return { segment: current, distance: currentDistance };
      }
      if (currentDistance < best.distance) {
        return { segment: current, distance: currentDistance };
      }
      if (currentDistance === best.distance && current.segmentNo < best.segment.segmentNo) {
        return { segment: current, distance: currentDistance };
      }
      return best;
    }, null as { segment: ShiftPresetInput['segments'][number]; distance: number } | null);

    if (!candidate) {
      return null;
    }

    const segment = candidate.segment;
    const startMinutes = parseTimeToMinutes(segment.startTime);
    const endMinutes = parseTimeToMinutes(segment.endTime);
    const crossesMidnight = segment.crossesMidnight || endMinutes <= startMinutes;
    const endDate = crossesMidnight && endMinutes <= startMinutes
      ? this.addDays(today, 1)
      : today;
    const scheduleStartLocal = localDateTime(today, segment.startTime);
    const scheduleEndLocal = localDateTime(endDate, segment.endTime);

    return {
      presetId: preset.id,
      presetName: preset.name,
      segmentId: segment.id,
      segmentNo: segment.segmentNo,
      shiftDate: today,
      startTime: segment.startTime,
      endTime: segment.endTime,
      crossesMidnight,
      lateGraceMinutes: segment.lateGraceMinutes,
      scheduleStartLocal,
      scheduleEndLocal,
      isLateAt: (date: Date, zone: string) => {
        const currentMinutes = this.localMinuteStampFromDate(date, zone);
        const startStamp = this.localMinuteStamp(scheduleStartLocal);
        return currentMinutes > startStamp + segment.lateGraceMinutes;
      }
    };
  }

  private addDays(localDate: string, days: number): string {
    const base = new Date(`${localDate}T00:00:00.000Z`);
    base.setUTCDate(base.getUTCDate() + days);
    return base.toISOString().slice(0, 10);
  }

  private localMinuteStamp(localDateTimeValue: string): number {
    const [datePart, timePart] = localDateTimeValue.split('T');
    const [year, month, day] = datePart.split('-').map((value) => Number(value));
    const [hour, minute] = timePart.split(':').map((value) => Number(value));
    return Date.UTC(year, month - 1, day, hour, minute, 0, 0) / 60000;
  }

  private localMinuteStampFromDate(date: Date, timeZone: string): number {
    const parts = getTimePartsInZone(date, timeZone);
    return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0, 0) / 60000;
  }
  async createRequest(userId: string, dto: CreateShiftChangeRequestDto) {
    const requestType = dto.requestType ?? ShiftRequestType.CUSTOM;
    let shiftPresetId: string | null = dto.shiftPresetId || null;

    if (shiftPresetId) {
      const preset = await this.prisma.shiftPreset.findFirst({
        where: {
          id: shiftPresetId,
          isActive: true
        },
        select: { id: true }
      });
      if (!preset) {
        throw new BadRequestException('Selected shift preset is not active');
      }
    }

    if (requestType !== ShiftRequestType.CUSTOM) {
      shiftPresetId = null;
    }

    const requestedDate = new Date(dto.requestedDate);
    if (Number.isNaN(requestedDate.getTime())) {
      throw new BadRequestException('requestedDate is invalid');
    }

    return this.prisma.shiftChangeRequest.create({
      data: {
        userId,
        shiftPresetId,
        requestType,
        requestedDate,
        reason: dto.reason,
        status: ShiftChangeRequestStatus.PENDING
      }
    });
  }

  async listRequests(isAdmin: boolean, userId?: string) {
    return this.prisma.shiftChangeRequest.findMany({
      where: isAdmin ? {} : { userId },
      include: {
        user: { select: { id: true, displayName: true, username: true } },
        reviewedBy: { select: { id: true, displayName: true, username: true } },
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  async getAdminRequestSummary() {
    const pending = await this.prisma.shiftChangeRequest.count({
      where: { status: ShiftChangeRequestStatus.PENDING },
    });

    return { pending };
  }

  async approveRequest(requestId: string, reviewerId: string) {
    const req = await this.prisma.shiftChangeRequest.findUnique({
      where: { id: requestId },
    });
    if (!req) {
      throw new NotFoundException('Request not found');
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
      include: {
        user: { select: { id: true, displayName: true, username: true } },
        reviewedBy: { select: { id: true, displayName: true, username: true } },
      },
    });
  }

  async rejectRequest(requestId: string, reviewerId: string) {
    const existing = await this.prisma.shiftChangeRequest.findUnique({
      where: { id: requestId },
      select: { status: true }
    });
    if (!existing) {
      throw new NotFoundException('Request not found');
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
}
