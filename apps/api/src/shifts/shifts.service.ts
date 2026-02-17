import { Injectable, NotFoundException } from '@nestjs/common';
import {
  AssignmentTargetType,
  Prisma,
  ShiftPreset,
  ShiftPresetSegment,
  User
} from '@prisma/client';
import {
  ResolvedShiftSegment,
  ShiftPresetInput,
  resolveActiveShiftSegment,
  formatDateInZone
} from '../core';
import { PrismaService } from '../prisma/prisma.service';
import { CreateShiftAssignmentDto } from './dto/create-shift-assignment.dto';
import { CreateShiftOverrideDto } from './dto/create-shift-override.dto';
import { CreateShiftPresetDto } from './dto/create-shift-preset.dto';

type PresetWithSegments = ShiftPreset & { segments: ShiftPresetSegment[] };

@Injectable()
export class ShiftsService {
  constructor(private readonly prisma: PrismaService) {}

  async createPreset(dto: CreateShiftPresetDto): Promise<PresetWithSegments> {
    return this.prisma.shiftPreset.create({
      data: {
        name: dto.name,
        timezone: dto.timezone || 'Asia/Dubai',
        teamId: dto.teamId,
        isDefault: dto.isDefault ?? false,
        segments: {
          create: dto.segments.map((segment) => ({
            segmentNo: segment.segmentNo,
            startTime: segment.startTime,
            endTime: segment.endTime,
            crossesMidnight: segment.crossesMidnight ?? false,
            lateGraceMinutes: segment.lateGraceMinutes ?? 10
          }))
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

  async createAssignment(dto: CreateShiftAssignmentDto) {
    return this.prisma.shiftAssignment.create({
      data: {
        targetType: dto.targetType,
        targetId: dto.targetId,
        shiftPresetId: dto.shiftPresetId,
        effectiveFrom: new Date(`${dto.effectiveFrom}T00:00:00.000Z`),
        effectiveTo: dto.effectiveTo ? new Date(`${dto.effectiveTo}T23:59:59.999Z`) : null
      }
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

  async getActiveSegmentForUser(user: User & { team?: { id: string } | null }, now: Date): Promise<{
    preset: PresetWithSegments;
    segment: ResolvedShiftSegment;
    timezone: string;
  }> {
    const preset = await this.resolvePresetForUser(user, now);
    if (!preset) {
      throw new NotFoundException('No shift preset assigned for this user');
    }

    const timezone = preset.timezone || 'Asia/Dubai';
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
    const baseTimeZone = 'Asia/Dubai';
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
      segments: preset.segments.map((segment) => ({
        id: segment.id,
        segmentNo: segment.segmentNo,
        startTime: segment.startTime,
        endTime: segment.endTime,
        crossesMidnight: segment.crossesMidnight,
        lateGraceMinutes: segment.lateGraceMinutes
      }))
    };
  }
}
