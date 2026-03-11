import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

export const CLIENT_SYNC_ACTION = {
  DUTY_PUNCH_ON: "DUTY_PUNCH_ON",
  DUTY_PUNCH_OFF: "DUTY_PUNCH_OFF",
  BREAK_START: "BREAK_START",
  BREAK_END: "BREAK_END",
  BREAK_CANCEL: "BREAK_CANCEL",
} as const;

export const CLIENT_SYNC_STATUS = {
  APPLIED: "APPLIED",
  IDEMPOTENT: "IDEMPOTENT",
  STALE: "STALE",
} as const;

export const CLIENT_REF_TYPE = {
  DUTY_SESSION: "DUTY_SESSION",
  BREAK_SESSION: "BREAK_SESSION",
} as const;

export type ClientSyncActionType =
  (typeof CLIENT_SYNC_ACTION)[keyof typeof CLIENT_SYNC_ACTION];
export type ClientSyncStatus =
  (typeof CLIENT_SYNC_STATUS)[keyof typeof CLIENT_SYNC_STATUS];
export type ClientRefType = (typeof CLIENT_REF_TYPE)[keyof typeof CLIENT_REF_TYPE];

export type ClientSyncIdentity = {
  clientActionId?: string;
  clientDeviceId?: string;
  clientDutySessionRef?: string;
  clientBreakRef?: string;
};

type ReceiptRecordOptions<T> = {
  userId: string;
  identity: ClientSyncIdentity;
  actionType: ClientSyncActionType;
  clientTimestamp?: string | null;
  status: ClientSyncStatus;
  rejectionReason?: string | null;
  resolvedDutySessionId?: string | null;
  resolvedBreakSessionId?: string | null;
  response: T;
};

type ClientLike = PrismaService | Prisma.TransactionClient;

@Injectable()
export class ClientSyncService {
  constructor(private readonly prisma: PrismaService) {}

  async findReceiptResponse<T>(
    userId: string,
    identity: ClientSyncIdentity,
  ): Promise<T | null> {
    if (!identity.clientActionId || !identity.clientDeviceId) {
      return null;
    }

    const receipt = await this.prisma.clientActionReceipt.findUnique({
      where: {
        userId_clientDeviceId_clientActionId: {
          userId,
          clientDeviceId: identity.clientDeviceId,
          clientActionId: identity.clientActionId,
        },
      },
      select: {
        responseJson: true,
      },
    });

    return (receipt?.responseJson as T | null | undefined) ?? null;
  }

  async resolveDutySessionId(
    userId: string,
    identity: ClientSyncIdentity,
    dutySessionId?: string | null,
  ): Promise<string | null> {
    if (dutySessionId) {
      return dutySessionId;
    }

    if (!identity.clientDutySessionRef || !identity.clientDeviceId) {
      return null;
    }

    const mapping = await this.prisma.clientRefMapping.findUnique({
      where: {
        userId_clientDeviceId_refType_clientRef: {
          userId,
          clientDeviceId: identity.clientDeviceId,
          refType: CLIENT_REF_TYPE.DUTY_SESSION,
          clientRef: identity.clientDutySessionRef,
        },
      },
      select: {
        dutySessionId: true,
      },
    });

    return mapping?.dutySessionId ?? null;
  }

  async resolveBreakSessionId(
    userId: string,
    identity: ClientSyncIdentity,
    breakSessionId?: string | null,
  ): Promise<string | null> {
    if (breakSessionId) {
      return breakSessionId;
    }

    if (!identity.clientBreakRef || !identity.clientDeviceId) {
      return null;
    }

    const mapping = await this.prisma.clientRefMapping.findUnique({
      where: {
        userId_clientDeviceId_refType_clientRef: {
          userId,
          clientDeviceId: identity.clientDeviceId,
          refType: CLIENT_REF_TYPE.BREAK_SESSION,
          clientRef: identity.clientBreakRef,
        },
      },
      select: {
        breakSessionId: true,
      },
    });

    return mapping?.breakSessionId ?? null;
  }

  async recordReceipt<T>(
    client: ClientLike,
    options: ReceiptRecordOptions<T>,
  ): Promise<void> {
    const { identity } = options;
    if (!identity.clientActionId || !identity.clientDeviceId) {
      return;
    }

    await client.clientActionReceipt.upsert({
      where: {
        userId_clientDeviceId_clientActionId: {
          userId: options.userId,
          clientDeviceId: identity.clientDeviceId,
          clientActionId: identity.clientActionId,
        },
      },
      create: {
        userId: options.userId,
        clientDeviceId: identity.clientDeviceId,
        clientActionId: identity.clientActionId,
        actionType: options.actionType,
        clientTimestamp: this.parseTimestamp(options.clientTimestamp),
        status: options.status,
        rejectionReason: options.rejectionReason ?? null,
        resolvedDutySessionId: options.resolvedDutySessionId ?? null,
        resolvedBreakSessionId: options.resolvedBreakSessionId ?? null,
        responseJson: this.toJsonValue(options.response),
      },
      update: {
        status: options.status,
        rejectionReason: options.rejectionReason ?? null,
        resolvedDutySessionId: options.resolvedDutySessionId ?? null,
        resolvedBreakSessionId: options.resolvedBreakSessionId ?? null,
        responseJson: this.toJsonValue(options.response),
      },
    });
  }

  async saveDutySessionRef(
    client: ClientLike,
    userId: string,
    identity: ClientSyncIdentity,
    dutySessionId: string,
  ): Promise<void> {
    if (!identity.clientDutySessionRef || !identity.clientDeviceId) {
      return;
    }

    await client.clientRefMapping.upsert({
      where: {
        userId_clientDeviceId_refType_clientRef: {
          userId,
          clientDeviceId: identity.clientDeviceId,
          refType: CLIENT_REF_TYPE.DUTY_SESSION,
          clientRef: identity.clientDutySessionRef,
        },
      },
      create: {
        userId,
        clientDeviceId: identity.clientDeviceId,
        refType: CLIENT_REF_TYPE.DUTY_SESSION,
        clientRef: identity.clientDutySessionRef,
        dutySessionId,
      },
      update: {
        dutySessionId,
      },
    });
  }

  async saveBreakSessionRef(
    client: ClientLike,
    userId: string,
    identity: ClientSyncIdentity,
    breakSessionId: string,
  ): Promise<void> {
    if (!identity.clientBreakRef || !identity.clientDeviceId) {
      return;
    }

    await client.clientRefMapping.upsert({
      where: {
        userId_clientDeviceId_refType_clientRef: {
          userId,
          clientDeviceId: identity.clientDeviceId,
          refType: CLIENT_REF_TYPE.BREAK_SESSION,
          clientRef: identity.clientBreakRef,
        },
      },
      create: {
        userId,
        clientDeviceId: identity.clientDeviceId,
        refType: CLIENT_REF_TYPE.BREAK_SESSION,
        clientRef: identity.clientBreakRef,
        breakSessionId,
      },
      update: {
        breakSessionId,
      },
    });
  }

  private parseTimestamp(value?: string | null): Date | null {
    if (!value) {
      return null;
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }
    return parsed;
  }

  private toJsonValue<T>(value: T): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }
}
