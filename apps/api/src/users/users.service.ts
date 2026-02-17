import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, Role, User } from "@prisma/client";
import { hash } from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";

const PUBLIC_USER_WITH_TEAM_SELECT = {
  id: true,
  username: true,
  firstName: true,
  lastName: true,
  displayName: true,
  role: true,
  isActive: true,
  mustChangePassword: true,
  teamId: true,
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
  constructor(private readonly prisma: PrismaService) {}

  async createUser(dto: CreateUserDto): Promise<PublicUserWithTeam> {
    const passwordHash = await this.hashPassword(dto.password);

    const data: Prisma.UserCreateInput = {
      firstName: dto.firstName,
      lastName: dto.lastName,
      displayName: dto.displayName,
      username: this.normalizeUsername(dto.username),
      passwordHash,
      mustChangePassword: dto.mustChangePassword ?? true,
      role: dto.role ?? Role.EMPLOYEE,
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
