import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { Team } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CreateTeamDto } from "./dto/create-team.dto";
import { UpdateTeamDto } from "./dto/update-team.dto";

@Injectable()
export class TeamsService {
  constructor(private readonly prisma: PrismaService) { }

  async create(dto: CreateTeamDto): Promise<Team> {
    return this.prisma.team.create({
      data: {
        name: dto.name,
      },
    });
  }

  async list(): Promise<Team[]> {
    return this.prisma.team.findMany({
      where: {
        isActive: true,
      },
      orderBy: {
        name: "asc",
      },
    });
  }

  async rename(id: string, dto: UpdateTeamDto): Promise<Team> {
    const team = await this.prisma.team.findUnique({ where: { id } });
    if (!team) throw new NotFoundException("Team not found");
    return this.prisma.team.update({
      where: { id },
      data: { name: dto.name },
    });
  }

  async remove(id: string): Promise<{ ok: true }> {
    const team = await this.prisma.team.findUnique({
      where: { id },
      include: { _count: { select: { users: true } } },
    });
    if (!team) throw new NotFoundException("Team not found");
    if (team._count.users > 0) {
      throw new BadRequestException(
        `Cannot delete team "${team.name}" — it still has ${team._count.users} user(s). Reassign them first.`
      );
    }
    await this.prisma.team.delete({ where: { id } });
    return { ok: true };
  }
}
