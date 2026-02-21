import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, Role, User } from "@prisma/client";
import { compare, hash } from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";

const PUBLIC_USER_WITH_TEAM_SELECT = {
  id: true,
  username: true,
  firstName: true,
  lastName: true,
  displayName: true,
  contactNumber: true,
  profilePhotoUrl: true,
  role: true,
  driverStatus: true,
  isActive: true,
  mustChangePassword: true,
  teamId: true,
  vehicleInfo: true,
  createdAt: true,
  updatedAt: true,
  team: {
    select: {
      id: true,
      name: true,
    },
  },
} satisfies Prisma.UserSelect;

type PublicUserWithTeam = Prisma.UserGetPayload<{
  select: typeof PUBLIC_USER_WITH_TEAM_SELECT;
}>;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) { }

  async createUser(dto: CreateUserDto): Promise<PublicUserWithTeam> {
    const passwordHash = await this.hashPassword(dto.password);

    const data: Prisma.UserCreateInput = {
      firstName: dto.firstName,
      lastName: dto.lastName,
      displayName: dto.displayName,
      username: this.normalizeUsername(dto.username),
      passwordHash,
      mustChangePassword: dto.mustChangePassword ?? true,
      role: dto.role ?? Role.MEMBER,
      isActive: dto.isActive ?? true,
      ...(dto.teamId
        ? {
          team: {
            connect: {
              id: dto.teamId,
            },
          },
        }
        : {}),
    };

    if (data.role === Role.LEADER && dto.teamId) {
      const existingLeader = await this.prisma.user.findFirst({
        where: { teamId: dto.teamId, role: Role.LEADER }
      });
      if (existingLeader) {
        throw new BadRequestException('This team already has a leader. Remove the current leader role first.');
      }
    }

    return this.prisma.user.create({
      data,
      select: PUBLIC_USER_WITH_TEAM_SELECT,
    });
  }

  async updateUser(
    id: string,
    dto: UpdateUserDto,
  ): Promise<PublicUserWithTeam> {
    await this.ensureUser(id);

    const data: Prisma.UserUncheckedUpdateInput = {
      firstName: dto.firstName,
      lastName: dto.lastName,
      displayName: dto.displayName,
      username: dto.username ? this.normalizeUsername(dto.username) : undefined,
      role: dto.role,
      isActive: dto.isActive,
      teamId: dto.teamId,
      mustChangePassword: dto.mustChangePassword,
    };

    if (dto.password) {
      data.passwordHash = await this.hashPassword(dto.password);
      if (dto.mustChangePassword === undefined) {
        data.mustChangePassword = true;
      }
    }

    const effectiveRole = dto.role ?? (await this.prisma.user.findUnique({ where: { id }, select: { role: true } }))?.role;
    const effectiveTeamId = dto.teamId !== undefined ? dto.teamId : (await this.prisma.user.findUnique({ where: { id }, select: { teamId: true } }))?.teamId;
    if (effectiveRole === Role.LEADER && effectiveTeamId) {
      const existingLeader = await this.prisma.user.findFirst({
        where: { teamId: effectiveTeamId, role: Role.LEADER, NOT: { id } }
      });
      if (existingLeader) {
        throw new BadRequestException('This team already has a leader. Remove the current leader role first.');
      }
    }

    return this.prisma.user.update({
      where: { id },
      data,
      select: PUBLIC_USER_WITH_TEAM_SELECT,
    });
  }

  async listUsers(): Promise<PublicUserWithTeam[]> {
    return this.prisma.user.findMany({
      orderBy: [{ role: "asc" }, { displayName: "asc" }],
      select: PUBLIC_USER_WITH_TEAM_SELECT,
    });
  }

  async findPublicById(id: string): Promise<PublicUserWithTeam | null> {
    return this.prisma.user.findUnique({
      where: { id },
      select: PUBLIC_USER_WITH_TEAM_SELECT,
    });
  }

  async findByUsernameForAuth(username: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: {
        username: this.normalizeUsername(username),
      },
    });
  }

  async getOrThrow(id: string): Promise<User> {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });
    if (!user) {
      throw new NotFoundException("User not found");
    }
    return user;
  }

  async getPublicOrThrow(id: string): Promise<PublicUserWithTeam> {
    const user = await this.findPublicById(id);
    if (!user) {
      throw new NotFoundException("User not found");
    }
    return user;
  }

  async updatePassword(
    id: string,
    password: string,
    mustChangePassword = false,
  ): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: {
        passwordHash: await this.hashPassword(password),
        mustChangePassword,
      },
    });
  }

  async deleteUser(id: string): Promise<void> {
    await this.ensureUser(id);

    // Hard delete with cleanup of related records
    await this.prisma.$transaction(async (tx) => {
      // 1. Anonymize Audit logs
      await tx.auditEvent.updateMany({
        where: { actorUserId: id },
        data: { actorUserId: null },
      });

      // 2. Anonymize approvals/reviews
      await tx.registrationRequest.updateMany({
        where: { reviewedById: id },
        data: { reviewedById: null },
      });
      await tx.registrationRequest.updateMany({
        where: { approvedUserId: id },
        data: { approvedUserId: null },
      });

      // 3. Anonymize reports
      await tx.monthlyReport.updateMany({
        where: { generatedById: id },
        data: { generatedById: null },
      });

      // 4. Anonymize session metadata (created/cancelled by this user)
      await tx.breakSession.updateMany({
        where: { createdById: id },
        data: { createdById: null },
      });
      await tx.breakSession.updateMany({
        where: { cancelledById: id },
        data: { cancelledById: null },
      });
      await tx.dutySession.updateMany({
        where: { createdById: id },
        data: { createdById: null },
      });

      // 5. Delete Breaks (must be before DutySessions if linked)
      await tx.breakSession.deleteMany({
        where: { userId: id },
      });

      // 6. Delete DutySessions
      await tx.dutySession.deleteMany({
        where: { userId: id },
      });

      // 7. Delete Shift Assignments
      await tx.shiftAssignment.deleteMany({
        where: { targetType: "USER", targetId: id },
      });

      // 8. Delete User
      await tx.user.delete({
        where: { id },
      });
    });
  }

  async updateProfile(
    id: string,
    data: {
      displayName?: string;
      firstName?: string;
      lastName?: string | null;
      username?: string;
      contactNumber?: string | null;
      vehicleInfo?: string | null;
    },
  ): Promise<PublicUserWithTeam> {
    await this.ensureUser(id);

    const update: Prisma.UserUncheckedUpdateInput = {};

    if (data.displayName !== undefined) update.displayName = data.displayName.trim();
    if (data.firstName !== undefined) update.firstName = data.firstName.trim();
    if (data.lastName !== undefined) update.lastName = data.lastName?.trim() || null;
    if (data.contactNumber !== undefined) update.contactNumber = data.contactNumber?.trim() || null;
    if (data.vehicleInfo !== undefined) update.vehicleInfo = data.vehicleInfo?.trim() || null;

    if (data.username !== undefined) {
      const normalized = this.normalizeUsername(data.username);
      const existing = await this.prisma.user.findFirst({
        where: { username: normalized, NOT: { id } },
        select: { id: true },
      });
      if (existing) {
        throw new BadRequestException("Username is already taken");
      }
      update.username = normalized;
    }

    return this.prisma.user.update({
      where: { id },
      data: update,
      select: PUBLIC_USER_WITH_TEAM_SELECT,
    });
  }

  async updateProfilePhoto(id: string, photoUrl: string | null): Promise<PublicUserWithTeam> {
    await this.ensureUser(id);
    return this.prisma.user.update({
      where: { id },
      data: { profilePhotoUrl: photoUrl },
      select: PUBLIC_USER_WITH_TEAM_SELECT,
    });
  }

  async changePassword(
    id: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.getOrThrow(id);
    const isValid = await compare(currentPassword, user.passwordHash);
    if (!isValid) {
      throw new BadRequestException("Current password is incorrect");
    }
    if (newPassword.length < 6) {
      throw new BadRequestException("New password must be at least 6 characters");
    }
    await this.prisma.user.update({
      where: { id },
      data: {
        passwordHash: await this.hashPassword(newPassword),
        mustChangePassword: false,
      },
    });
  }

  private async ensureUser(id: string): Promise<void> {
    const exists = await this.prisma.user.count({ where: { id } });
    if (!exists) {
      throw new NotFoundException("User not found");
    }
  }

  private normalizeUsername(username: string): string {
    const normalized = username.trim();
    if (!normalized) {
      throw new BadRequestException("username must not be blank");
    }
    return normalized;
  }

  private async hashPassword(password: string): Promise<string> {
    const parsed = Number(process.env.BCRYPT_ROUNDS || 12);
    const rounds = Number.isFinite(parsed) && parsed > 0 ? parsed : 12;
    return hash(password, rounds);
  }
}
