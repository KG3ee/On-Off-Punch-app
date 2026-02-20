import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import {
  DriverRequestStatus,
  DriverStatus,
  Prisma,
  Role
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDriverRequestDto } from './dto/create-driver-request.dto';

type DriverRequestWithRelations = Prisma.DriverRequestGetPayload<{
  include: {
    user: { select: { id: true; displayName: true; username: true } };
    driver: { select: { id: true; displayName: true; username: true } };
    reviewedBy: { select: { id: true; displayName: true; username: true } };
  };
}>;

@Injectable()
export class DriverRequestsService {
  constructor(private readonly prisma: PrismaService) {}

  private getInclude() {
    return {
      user: {
        select: {
          id: true,
          displayName: true,
          username: true
        }
      },
      driver: {
        select: {
          id: true,
          displayName: true,
          username: true
        }
      },
      reviewedBy: {
        select: {
          id: true,
          displayName: true,
          username: true
        }
      }
    };
  }

  async create(userId: string, dto: CreateDriverRequestDto): Promise<DriverRequestWithRelations> {
    const requestedDate = new Date(dto.requestedDate);
    if (Number.isNaN(requestedDate.getTime())) {
      throw new BadRequestException('requestedDate is invalid');
    }

    if (!dto.requestedTime || typeof dto.requestedTime !== 'string') {
      throw new BadRequestException('requestedTime is required');
    }

    if (!dto.destination || typeof dto.destination !== 'string') {
      throw new BadRequestException('destination is required');
    }

    return this.prisma.driverRequest.create({
      data: {
        userId,
        requestedDate,
        requestedTime: dto.requestedTime,
        destination: dto.destination,
        purpose: dto.purpose ?? null,
        status: DriverRequestStatus.PENDING
      },
      include: this.getInclude()
    });
  }

  async listMyRequests(userId: string): Promise<DriverRequestWithRelations[]> {
    return this.prisma.driverRequest.findMany({
      where: { userId },
      include: this.getInclude(),
      orderBy: { createdAt: 'desc' }
    });
  }

  async listAllRequests(): Promise<DriverRequestWithRelations[]> {
    return this.prisma.driverRequest.findMany({
      include: this.getInclude(),
      orderBy: { createdAt: 'desc' }
    });
  }

  async listAvailableForDrivers(): Promise<DriverRequestWithRelations[]> {
    return this.prisma.driverRequest.findMany({
      where: {
        status: DriverRequestStatus.APPROVED,
        driverId: null
      },
      include: this.getInclude(),
      orderBy: { requestedDate: 'asc' }
    });
  }

  async listMyAssignments(driverId: string): Promise<DriverRequestWithRelations[]> {
    return this.prisma.driverRequest.findMany({
      where: { driverId },
      include: this.getInclude(),
      orderBy: { requestedDate: 'asc' }
    });
  }

  async approve(
    requestId: string,
    reviewerId: string,
    adminNote?: string
  ): Promise<DriverRequestWithRelations> {
    const existing = await this.prisma.driverRequest.findUnique({
      where: { id: requestId },
      select: { status: true }
    });
    if (!existing) {
      throw new NotFoundException('Driver request not found');
    }
    if (existing.status !== DriverRequestStatus.PENDING) {
      throw new BadRequestException('Only pending requests can be approved');
    }

    return this.prisma.driverRequest.update({
      where: { id: requestId },
      data: {
        status: DriverRequestStatus.APPROVED,
        reviewedById: reviewerId,
        reviewedAt: new Date(),
        adminNote: adminNote ?? null
      },
      include: this.getInclude()
    });
  }

  async reject(
    requestId: string,
    reviewerId: string,
    adminNote?: string
  ): Promise<DriverRequestWithRelations> {
    const existing = await this.prisma.driverRequest.findUnique({
      where: { id: requestId },
      select: { status: true }
    });
    if (!existing) {
      throw new NotFoundException('Driver request not found');
    }
    if (existing.status !== DriverRequestStatus.PENDING) {
      throw new BadRequestException('Only pending requests can be rejected');
    }

    return this.prisma.driverRequest.update({
      where: { id: requestId },
      data: {
        status: DriverRequestStatus.REJECTED,
        reviewedById: reviewerId,
        reviewedAt: new Date(),
        adminNote: adminNote ?? null
      },
      include: this.getInclude()
    });
  }

  async accept(requestId: string, driverId: string): Promise<DriverRequestWithRelations> {
    const user = await this.prisma.user.findUnique({
      where: { id: driverId },
      select: { isDriver: true, role: true }
    });
    if (!user?.isDriver && user?.role !== Role.DRIVER) {
      throw new ForbiddenException('Only drivers can accept requests');
    }

    const existing = await this.prisma.driverRequest.findUnique({
      where: { id: requestId },
      select: { status: true, driverId: true }
    });
    if (!existing) {
      throw new NotFoundException('Driver request not found');
    }
    if (existing.status !== DriverRequestStatus.APPROVED) {
      throw new BadRequestException('Only approved requests can be accepted by a driver');
    }
    if (existing.driverId) {
      throw new BadRequestException('This request has already been accepted by another driver');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.driverRequest.update({
        where: { id: requestId },
        data: {
          status: DriverRequestStatus.IN_PROGRESS,
          driverId
        },
        include: this.getInclude()
      });

      await tx.user.update({
        where: { id: driverId },
        data: { driverStatus: DriverStatus.BUSY }
      });

      return updated;
    });
  }

  async complete(requestId: string, driverId: string): Promise<DriverRequestWithRelations> {
    const existing = await this.prisma.driverRequest.findUnique({
      where: { id: requestId },
      select: { status: true, driverId: true }
    });
    if (!existing) {
      throw new NotFoundException('Driver request not found');
    }
    if (existing.status !== DriverRequestStatus.IN_PROGRESS) {
      throw new BadRequestException('Only in-progress requests can be completed');
    }
    if (existing.driverId !== driverId) {
      throw new ForbiddenException('Only the assigned driver can complete this request');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.driverRequest.update({
        where: { id: requestId },
        data: { status: DriverRequestStatus.COMPLETED },
        include: this.getInclude()
      });

      await tx.user.update({
        where: { id: driverId },
        data: { driverStatus: DriverStatus.AVAILABLE }
      });

      return updated;
    });
  }

  async setDriverStatus(userId: string, status: DriverStatus): Promise<{ driverStatus: DriverStatus }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { isDriver: true, role: true }
    });

    if (!user?.isDriver && user?.role !== Role.DRIVER) {
      throw new ForbiddenException('Only drivers can update driver status');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { driverStatus: status },
      select: { driverStatus: true }
    });

    return updated;
  }
}
