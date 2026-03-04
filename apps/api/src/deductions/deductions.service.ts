import { BadRequestException, Injectable } from '@nestjs/common';
import {
  DeductionCategory,
  DeductionSourceType,
  Prisma,
} from '@prisma/client';
import { formatDateInZone } from '../core';
import { PrismaService } from '../prisma/prisma.service';
import { ListDeductionEntriesDto } from './dto/list-deduction-entries.dto';
import { ListDeductionFilterDto } from './dto/list-deduction-filter.dto';
import { UpdateDeductionPolicyDto } from './dto/update-deduction-policy.dto';

type RecordDeductionInput = {
  category: DeductionCategory;
  sourceType: DeductionSourceType;
  sourceId: string;
  userId: string;
  localDate: string;
  lateMinutesSnapshot?: number | null;
  breakOvertimeMinutesSnapshot?: number | null;
  actorUserId?: string | null;
};

type DeductionTierView = {
  id: string;
  occurrenceNo: number;
  amountAed: number;
};

type DeductionPolicyView = {
  effectiveFromLocalDate: string | null;
  tiers: DeductionTierView[];
};

@Injectable()
export class DeductionsService {
  constructor(private readonly prisma: PrismaService) {}

  async listPolicies() {
    const [tierRows, policyRows] = await Promise.all([
      this.prisma.deductionTier.findMany({
        orderBy: [{ category: 'asc' }, { occurrenceNo: 'asc' }],
        select: {
          id: true,
          category: true,
          occurrenceNo: true,
          amountAed: true,
        },
      }),
      this.prisma.deductionPolicy.findMany({
        select: {
          category: true,
          effectiveFromLocalDate: true,
        },
      }),
    ]);

    const policies: Record<DeductionCategory, DeductionPolicyView> = {
      PUNCH_LATE: {
        effectiveFromLocalDate: null,
        tiers: [],
      },
      BREAK_LATE: {
        effectiveFromLocalDate: null,
        tiers: [],
      },
    };

    policyRows.forEach((row) => {
      policies[row.category].effectiveFromLocalDate = row.effectiveFromLocalDate;
    });

    tierRows.forEach((row) => {
      policies[row.category].tiers.push({
        id: row.id,
        occurrenceNo: row.occurrenceNo,
        amountAed: this.toNumber(row.amountAed),
      });
    });

    return { policies };
  }

  async updatePolicy(
    actorUserId: string,
    category: DeductionCategory,
    dto: UpdateDeductionPolicyDto,
  ) {
    const amounts = this.normalizeAmounts(dto.amountsAed);
    const existingPolicy = await this.prisma.deductionPolicy.findUnique({
      where: { category },
      select: {
        effectiveFromLocalDate: true,
      },
    });
    const effectiveFromLocalDate = dto.effectiveFromLocalDate === undefined
      ? existingPolicy?.effectiveFromLocalDate ?? null
      : this.normalizeEffectiveFromLocalDate(dto.effectiveFromLocalDate);

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.deductionTier.deleteMany({ where: { category } });

      await tx.deductionTier.createMany({
        data: amounts.map((amountAed, index) => ({
          category,
          occurrenceNo: index + 1,
          amountAed,
        })),
      });

      const tiers = await tx.deductionTier.findMany({
        where: { category },
        orderBy: { occurrenceNo: 'asc' },
        select: {
          id: true,
          category: true,
          occurrenceNo: true,
          amountAed: true,
        },
      });

      const policy = await tx.deductionPolicy.upsert({
        where: { category },
        create: {
          category,
          effectiveFromLocalDate,
        },
        update: {
          effectiveFromLocalDate,
        },
        select: {
          category: true,
          effectiveFromLocalDate: true,
        },
      });

      return {
        tiers,
        policy,
      };
    });

    await this.createAuditEvent(
      actorUserId,
      'DEDUCTION_POLICY_UPDATED',
      'DeductionPolicy',
      category,
      {
        category,
        effectiveFromLocalDate: result.policy.effectiveFromLocalDate,
        tiers: result.tiers.map((tier) => ({
          occurrenceNo: tier.occurrenceNo,
          amountAed: this.toNumber(tier.amountAed),
        })),
      },
    );

    return {
      category,
      effectiveFromLocalDate: result.policy.effectiveFromLocalDate,
      tiers: result.tiers.map((tier) => ({
        id: tier.id,
        occurrenceNo: tier.occurrenceNo,
        amountAed: this.toNumber(tier.amountAed),
      })),
    };
  }

  async listEntries(query: ListDeductionEntriesDto) {
    const where = this.buildWhere(query);

    const [items, total] = await Promise.all([
      this.prisma.deductionEntry.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: this.parseTake(query.limit),
        skip: this.parseSkip(query.offset),
        select: {
          id: true,
          userId: true,
          category: true,
          sourceType: true,
          sourceId: true,
          localDate: true,
          periodMonth: true,
          occurrenceNo: true,
          amountAed: true,
          currency: true,
          lateMinutesSnapshot: true,
          breakOvertimeMinutesSnapshot: true,
          createdAt: true,
          user: {
            select: {
              id: true,
              username: true,
              displayName: true,
              role: true,
              team: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.deductionEntry.count({ where }),
    ]);

    return {
      total,
      items: items.map((item) => ({
        ...item,
        amountAed: this.toNumber(item.amountAed),
      })),
    };
  }

  async getSummary(query: ListDeductionFilterDto) {
    const where = this.buildWhere(query);

    const rows = await this.prisma.deductionEntry.findMany({
      where,
      select: {
        id: true,
        userId: true,
        category: true,
        occurrenceNo: true,
        amountAed: true,
        localDate: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            role: true,
            team: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });

    const byUser = new Map<string, {
      user: {
        id: string;
        username: string;
        displayName: string;
        role: string;
        team: { id: string; name: string } | null;
      };
      punchLateEvents: number;
      breakLateEvents: number;
      punchLateAed: number;
      breakLateAed: number;
      totalAed: number;
    }>();

    let totalAed = 0;
    let punchLateAed = 0;
    let breakLateAed = 0;
    let punchLateEvents = 0;
    let breakLateEvents = 0;

    rows.forEach((row) => {
      const amount = this.toNumber(row.amountAed);
      totalAed += amount;

      if (row.category === DeductionCategory.PUNCH_LATE) {
        punchLateEvents += 1;
        punchLateAed += amount;
      } else {
        breakLateEvents += 1;
        breakLateAed += amount;
      }

      const existing = byUser.get(row.userId) || {
        user: {
          id: row.user.id,
          username: row.user.username,
          displayName: row.user.displayName,
          role: row.user.role,
          team: row.user.team,
        },
        punchLateEvents: 0,
        breakLateEvents: 0,
        punchLateAed: 0,
        breakLateAed: 0,
        totalAed: 0,
      };

      if (row.category === DeductionCategory.PUNCH_LATE) {
        existing.punchLateEvents += 1;
        existing.punchLateAed += amount;
      } else {
        existing.breakLateEvents += 1;
        existing.breakLateAed += amount;
      }
      existing.totalAed += amount;

      byUser.set(row.userId, existing);
    });

    const summaryRows = [...byUser.values()].sort((a, b) => {
      if (b.totalAed !== a.totalAed) return b.totalAed - a.totalAed;
      return a.user.displayName.localeCompare(b.user.displayName);
    });

    return {
      totals: {
        totalAed,
        usersAffected: summaryRows.length,
        punchLateAed,
        breakLateAed,
        punchLateEvents,
        breakLateEvents,
      },
      rows: summaryRows,
    };
  }

  async exportEntriesCsv(actorUserId: string, query: ListDeductionFilterDto) {
    const result = await this.listEntries({
      ...query,
      limit: '5000',
      offset: '0',
    });

    const header = [
      'Entry ID',
      'Date',
      'Month',
      'User',
      'Username',
      'Role',
      'Team',
      'Category',
      'Occurrence #',
      'Amount AED',
      'Currency',
      'Source Type',
      'Source ID',
      'Late Minutes',
      'Break Overtime Minutes',
      'Created At',
    ];

    const csvRows = result.items.map((row) => [
      row.id,
      row.localDate,
      row.periodMonth,
      row.user.displayName,
      row.user.username,
      row.user.role,
      row.user.team?.name || '',
      row.category,
      String(row.occurrenceNo),
      row.amountAed.toFixed(2),
      row.currency,
      row.sourceType,
      row.sourceId,
      row.lateMinutesSnapshot !== null && row.lateMinutesSnapshot !== undefined
        ? String(row.lateMinutesSnapshot)
        : '',
      row.breakOvertimeMinutesSnapshot !== null && row.breakOvertimeMinutesSnapshot !== undefined
        ? String(row.breakOvertimeMinutesSnapshot)
        : '',
      row.createdAt.toISOString(),
    ]);

    const csv = [header, ...csvRows]
      .map((columns) => columns.map((column) => this.escapeCsv(column)).join(','))
      .join('\n');

    const suffix = query.periodMonth || (query.from || query.to
      ? `${query.from || 'start'}_${query.to || 'end'}`
      : 'all');

    await this.createAuditEvent(
      actorUserId,
      'DEDUCTION_EXPORT_CSV',
      'DeductionEntry',
      suffix,
      {
        count: result.items.length,
        filter: {
          periodMonth: query.periodMonth || null,
          from: query.from || null,
          to: query.to || null,
          teamId: query.teamId || null,
          userId: query.userId || null,
          category: query.category || null,
        },
      },
    );

    return {
      filename: `deductions-${suffix}.csv`,
      csv,
      count: result.items.length,
    };
  }

  async recordPunchLateFromDutySession(input: {
    dutySessionId: string;
    userId: string;
    localDate: string;
    lateMinutes: number;
    actorUserId?: string | null;
  }) {
    if (input.lateMinutes <= 0) return null;

    return this.createDeductionEntry({
      category: DeductionCategory.PUNCH_LATE,
      sourceType: DeductionSourceType.DUTY_SESSION,
      sourceId: input.dutySessionId,
      userId: input.userId,
      localDate: input.localDate,
      lateMinutesSnapshot: input.lateMinutes,
      breakOvertimeMinutesSnapshot: null,
      actorUserId: input.actorUserId,
    });
  }

  async recordBreakLateFromBreakSession(input: {
    breakSessionId: string;
    userId: string;
    localDate: string;
    breakOvertimeMinutes: number;
    actorUserId?: string | null;
  }) {
    if (input.breakOvertimeMinutes <= 0) return null;

    return this.createDeductionEntry({
      category: DeductionCategory.BREAK_LATE,
      sourceType: DeductionSourceType.BREAK_SESSION,
      sourceId: input.breakSessionId,
      userId: input.userId,
      localDate: input.localDate,
      lateMinutesSnapshot: null,
      breakOvertimeMinutesSnapshot: input.breakOvertimeMinutes,
      actorUserId: input.actorUserId,
    });
  }

  private async createDeductionEntry(input: RecordDeductionInput) {
    const existing = await this.prisma.deductionEntry.findUnique({
      where: {
        sourceType_sourceId: {
          sourceType: input.sourceType,
          sourceId: input.sourceId,
        },
      },
      select: { id: true },
    });

    if (existing) {
      return null;
    }

    const [tierConfig, tierRows] = await Promise.all([
      this.prisma.deductionPolicy.findUnique({
        where: { category: input.category },
        select: { effectiveFromLocalDate: true },
      }),
      this.prisma.deductionTier.findMany({
        where: { category: input.category },
        orderBy: { occurrenceNo: 'asc' },
        select: { occurrenceNo: true, amountAed: true },
      }),
    ]);
    const effectiveFromLocalDate = tierConfig?.effectiveFromLocalDate || null;

    if (tierRows.length === 0) {
      return null;
    }

    if (effectiveFromLocalDate && input.localDate < effectiveFromLocalDate) {
      return null;
    }

    const periodMonth = this.periodMonthFromLocalDate(input.localDate);

    const occurrenceNo =
      (await this.prisma.deductionEntry.count({
        where: {
          userId: input.userId,
          category: input.category,
          periodMonth,
          ...(effectiveFromLocalDate
            ? {
                localDate: {
                  gte: effectiveFromLocalDate,
                },
              }
            : {}),
        },
      })) + 1;

    const selectedTier =
      tierRows.find((tier) => tier.occurrenceNo === occurrenceNo) || tierRows[tierRows.length - 1];

    try {
      const created = await this.prisma.deductionEntry.create({
        data: {
          userId: input.userId,
          category: input.category,
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          localDate: input.localDate,
          periodMonth,
          occurrenceNo,
          amountAed: selectedTier.amountAed,
          currency: 'AED',
          lateMinutesSnapshot: input.lateMinutesSnapshot ?? null,
          breakOvertimeMinutesSnapshot: input.breakOvertimeMinutesSnapshot ?? null,
        },
        select: {
          id: true,
          category: true,
          sourceType: true,
          sourceId: true,
          userId: true,
          localDate: true,
          periodMonth: true,
          occurrenceNo: true,
          amountAed: true,
          lateMinutesSnapshot: true,
          breakOvertimeMinutesSnapshot: true,
          createdAt: true,
        },
      });

      await this.createAuditEvent(
        input.actorUserId || input.userId,
        'DEDUCTION_ENTRY_CREATED',
        'DeductionEntry',
        created.id,
        {
          userId: created.userId,
          category: created.category,
          sourceType: created.sourceType,
          sourceId: created.sourceId,
          localDate: created.localDate,
          periodMonth: created.periodMonth,
          occurrenceNo: created.occurrenceNo,
          amountAed: this.toNumber(created.amountAed),
          effectiveFromLocalDate,
          lateMinutesSnapshot: created.lateMinutesSnapshot,
          breakOvertimeMinutesSnapshot: created.breakOvertimeMinutesSnapshot,
        },
      );

      return created;
    } catch (error) {
      if ((error as { code?: string })?.code === 'P2002') {
        return null;
      }
      throw error;
    }
  }

  private buildWhere(query: ListDeductionFilterDto): Prisma.DeductionEntryWhereInput {
    if (query.periodMonth && !/^\d{4}-\d{2}$/.test(query.periodMonth)) {
      throw new BadRequestException('periodMonth must be YYYY-MM');
    }

    if (query.from && !/^\d{4}-\d{2}-\d{2}$/.test(query.from)) {
      throw new BadRequestException('from must be YYYY-MM-DD');
    }

    if (query.to && !/^\d{4}-\d{2}-\d{2}$/.test(query.to)) {
      throw new BadRequestException('to must be YYYY-MM-DD');
    }

    const where: Prisma.DeductionEntryWhereInput = {
      ...(query.category ? { category: query.category } : {}),
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.teamId ? { user: { teamId: query.teamId } } : {}),
      ...(query.periodMonth ? { periodMonth: query.periodMonth } : {}),
      ...(query.from || query.to
        ? {
            localDate: {
              ...(query.from ? { gte: query.from } : {}),
              ...(query.to ? { lte: query.to } : {}),
            },
          }
        : {}),
    };

    return where;
  }

  private normalizeAmounts(values: number[]): number[] {
    if (!Array.isArray(values) || values.length === 0) {
      throw new BadRequestException('amountsAed must include at least one tier');
    }

    const normalized = values.map((value) => Number(value));
    if (normalized.some((value) => !Number.isFinite(value) || value < 0)) {
      throw new BadRequestException('All amounts must be numbers >= 0');
    }

    return normalized.map((value) => Number(value.toFixed(2)));
  }

  private normalizeEffectiveFromLocalDate(value: string | null | undefined): string | null {
    if (value === null || value === undefined) {
      return null;
    }

    const normalized = String(value).trim();
    if (!normalized) {
      return null;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
      throw new BadRequestException('effectiveFromLocalDate must be YYYY-MM-DD');
    }

    return normalized;
  }

  private parseTake(limit?: string): number {
    if (!limit) return 200;
    const parsed = Number(limit);
    if (!Number.isFinite(parsed) || parsed <= 0) return 200;
    return Math.min(5000, Math.trunc(parsed));
  }

  private parseSkip(offset?: string): number {
    if (!offset) return 0;
    const parsed = Number(offset);
    if (!Number.isFinite(parsed) || parsed < 0) return 0;
    return Math.trunc(parsed);
  }

  private periodMonthFromLocalDate(localDate: string): string {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate)) {
      return formatDateInZone(new Date(), process.env.APP_TIMEZONE || 'Asia/Dubai').slice(0, 7);
    }
    return localDate.slice(0, 7);
  }

  private toNumber(value: Prisma.Decimal | number | string): number {
    return Number(value.toString());
  }

  private async createAuditEvent(
    actorUserId: string,
    action: string,
    entityType: string,
    entityId: string,
    payload: Record<string, unknown>,
  ) {
    await this.prisma.auditEvent
      .create({
        data: {
          actorUserId,
          action,
          entityType,
          entityId,
          payload: payload as Prisma.InputJsonValue,
        },
      })
      .catch(() => undefined);
  }

  private escapeCsv(value: unknown): string {
    const text = String(value ?? '');
    return `"${text.replace(/"/g, '""')}"`;
  }
}
