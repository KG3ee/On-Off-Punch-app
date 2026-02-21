import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import {
  Prisma,
  RegistrationRequestStatus,
  Role
} from '@prisma/client';
import { hash } from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { ApproveRegistrationRequestDto } from './dto/approve-registration-request.dto';
import { CreateRegistrationRequestDto } from './dto/create-registration-request.dto';
import { CreateRosterEntryDto } from './dto/create-roster-entry.dto';
import { RejectRegistrationRequestDto } from './dto/reject-registration-request.dto';

const REQUEST_PUBLIC_INCLUDE = {
  rosterEntry: {
    select: {
      id: true,
      staffCode: true,
      defaultTeamId: true,
      defaultRole: true,
      defaultTeam: {
        select: {
          id: true,
          name: true
        }
      }
    }
  },
  requestedTeam: {
    select: {
      id: true,
      name: true
    }
  },
  reviewedBy: {
    select: {
      id: true,
      username: true,
      displayName: true
    }
  },
  approvedUser: {
    select: {
      id: true,
      username: true,
      displayName: true,
      role: true,
      teamId: true,
      team: {
        select: {
          id: true,
          name: true
        }
      }
    }
  }
} satisfies Prisma.RegistrationRequestInclude;

@Injectable()
export class RegistrationsService {
  constructor(private readonly prisma: PrismaService) { }

  async createRequest(dto: CreateRegistrationRequestDto) {
    const desiredUsername = this.normalizeUsername(dto.username);
    const staffCode = dto.staffCode.trim().toUpperCase();
    // phoneLast4 logic removed

    await this.ensureUsernameAvailable(desiredUsername);

    const openRequest = await this.prisma.registrationRequest.findFirst({
      where: {
        desiredUsername,
        status: {
          in: [
            RegistrationRequestStatus.PENDING,
            RegistrationRequestStatus.READY_REVIEW
          ]
        }
      }
    });
    if (openRequest) {
      throw new ConflictException('A pending request for this username already exists');
    }

    const openStaffCodeRequest = await this.prisma.registrationRequest.findFirst({
      where: {
        staffCode,
        status: {
          in: [
            RegistrationRequestStatus.PENDING,
            RegistrationRequestStatus.READY_REVIEW
          ]
        }
      }
    });
    if (openStaffCodeRequest) {
      throw new ConflictException('A pending request for this staff code already exists');
    }

    const rosterByStaffCode = await this.prisma.employeeRoster.findFirst({
      where: {
        staffCode,
        isActive: true
      }
    });

    // Verification Logic: Only verify by Staff Code now
    const rosterMatch = rosterByStaffCode;

    const passwordHash = await hash(dto.password, this.bcryptRounds());
    const status = rosterMatch
      ? RegistrationRequestStatus.READY_REVIEW
      : RegistrationRequestStatus.PENDING;

    const verificationScore = rosterMatch ? 100 : 10;
    const verificationNotes = rosterMatch
      ? 'Matched active roster entry by staffCode'
      : 'No active roster match';

    const created = await this.prisma.registrationRequest.create({
      data: {
        staffCode,
        // phoneLast4 removed
        firstName: dto.firstName.trim(),
        lastName: dto.lastName?.trim() || null,
        displayName: dto.displayName.trim(),
        desiredUsername,
        passwordHash,
        status,
        verificationScore,
        verificationNotes,
        rosterEntryId: rosterMatch?.id || null,
        requestedTeamId: dto.requestedTeamId || null
      },
      include: REQUEST_PUBLIC_INCLUDE
    });

    return this.toPublicRequest(created);
  }

  async listRequests(status?: RegistrationRequestStatus) {
    const rows = await this.prisma.registrationRequest.findMany({
      where: status ? { status } : undefined,
      include: REQUEST_PUBLIC_INCLUDE,
      orderBy: [{ status: 'asc' }, { submittedAt: 'desc' }]
    });

    return rows.map((row) => this.toPublicRequest(row));
  }

  async approveRequest(
    requestId: string,
    dto: ApproveRegistrationRequestDto,
    reviewerUserId: string
  ) {
    const request = await this.prisma.registrationRequest.findUnique({
      where: { id: requestId },
      include: REQUEST_PUBLIC_INCLUDE
    });

    if (!request) {
      throw new NotFoundException('Registration request not found');
    }

    if (
      request.status === RegistrationRequestStatus.APPROVED ||
      request.status === RegistrationRequestStatus.REJECTED
    ) {
      throw new BadRequestException('This registration request is already finalized');
    }

    await this.ensureUsernameAvailable(request.desiredUsername);

    const teamId =
      dto.teamId ||
      request.requestedTeamId ||
      request.rosterEntry?.defaultTeamId ||
      null;

    const mustChangePassword = dto.mustChangePassword ?? false;

    return this.prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          username: request.desiredUsername,
          passwordHash: request.passwordHash,
          mustChangePassword,
          firstName: request.firstName,
          lastName: request.lastName,
          displayName: request.displayName,
          role: request.rosterEntry?.defaultRole || Role.MEMBER,
          isActive: true,
          teamId
        },
        select: {
          id: true,
          username: true,
          displayName: true,
          role: true,
          teamId: true,
          team: {
            select: {
              id: true,
              name: true
            }
          }
        }
      });

      const rosterEntryId = request.rosterEntryId;

      const updatedRequest = await tx.registrationRequest.update({
        where: { id: request.id },
        data: {
          status: RegistrationRequestStatus.APPROVED,
          reviewedById: reviewerUserId,
          reviewedAt: new Date(),
          reviewNote: dto.reviewNote || null,
          approvedUserId: createdUser.id,
          rosterEntryId: null
        },
        include: REQUEST_PUBLIC_INCLUDE
      });

      if (rosterEntryId) {
        const otherPending = await tx.registrationRequest.count({
          where: {
            rosterEntryId,
            status: { in: [RegistrationRequestStatus.PENDING, RegistrationRequestStatus.READY_REVIEW] }
          }
        });
        if (otherPending === 0) {
          await tx.employeeRoster.delete({ where: { id: rosterEntryId } }).catch(() => {});
        }
      }

      return {
        request: this.toPublicRequest(updatedRequest),
        user: createdUser
      };
    });
  }

  async rejectRequest(
    requestId: string,
    dto: RejectRegistrationRequestDto,
    reviewerUserId: string
  ) {
    const request = await this.prisma.registrationRequest.findUnique({
      where: { id: requestId }
    });

    if (!request) {
      throw new NotFoundException('Registration request not found');
    }

    if (
      request.status === RegistrationRequestStatus.APPROVED ||
      request.status === RegistrationRequestStatus.REJECTED
    ) {
      throw new BadRequestException('This registration request is already finalized');
    }

    const updated = await this.prisma.registrationRequest.update({
      where: { id: request.id },
      data: {
        status: RegistrationRequestStatus.REJECTED,
        reviewedById: reviewerUserId,
        reviewedAt: new Date(),
        reviewNote: dto.reviewNote || null
      },
      include: REQUEST_PUBLIC_INCLUDE
    });

    return this.toPublicRequest(updated);
  }

  async listRoster() {
    return this.prisma.employeeRoster.findMany({
      where: { isActive: true },
      include: {
        defaultTeam: {
          select: {
            id: true,
            name: true
          }
        }
      },
      orderBy: { staffCode: 'asc' }
    });
  }

  async upsertRoster(dto: CreateRosterEntryDto) {
    const staffCode = dto.staffCode.trim().toUpperCase();

    return this.prisma.employeeRoster.upsert({
      where: { staffCode },
      update: {
        defaultTeamId: dto.defaultTeamId || null,
        defaultRole: dto.defaultRole || 'MEMBER',
        isActive: dto.isActive ?? true
      },
      create: {
        staffCode,
        defaultTeamId: dto.defaultTeamId || null,
        defaultRole: dto.defaultRole || 'MEMBER',
        isActive: dto.isActive ?? true
      },
      include: {
        defaultTeam: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });
  }

  async removeRoster(id: string) {
    const exists = await this.prisma.employeeRoster.count({ where: { id } });
    if (!exists) {
      throw new NotFoundException('Roster entry not found');
    }

    await this.prisma.employeeRoster.delete({ where: { id } });

    return { ok: true };
  }

  private async ensureUsernameAvailable(username: string): Promise<void> {
    const existing = await this.prisma.user.findUnique({
      where: {
        username
      },
      select: {
        id: true
      }
    });

    if (existing) {
      throw new ConflictException('Username is already used');
    }
  }

  private normalizeUsername(username: string): string {
    const normalized = username.trim();
    if (!normalized) {
      throw new BadRequestException('username must not be blank');
    }
    return normalized;
  }

  private bcryptRounds(): number {
    const parsed = Number(process.env.BCRYPT_ROUNDS || 12);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
    return 12;
  }

  private toPublicRequest<T extends { passwordHash: string }>(request: T): Omit<T, 'passwordHash'> {
    // Never return passwordHash back to clients.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash, ...safe } = request;
    return safe;
  }
}
