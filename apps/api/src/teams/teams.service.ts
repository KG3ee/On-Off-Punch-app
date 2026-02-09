import { Injectable } from '@nestjs/common';
import { Team } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTeamDto } from './dto/create-team.dto';

@Injectable()
export class TeamsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateTeamDto): Promise<Team> {
    return this.prisma.team.create({
      data: {
        name: dto.name
      }
    });
  }

  async list(): Promise<Team[]> {
    return this.prisma.team.findMany({
      where: {
        isActive: true
      },
      orderBy: {
        name: 'asc'
      }
    });
  }
}
