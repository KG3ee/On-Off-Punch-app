import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { Role } from "@prisma/client";
import { Roles } from "../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { CreateTeamDto } from "./dto/create-team.dto";
import { UpdateTeamDto } from "./dto/update-team.dto";
import { TeamsService } from "./teams.service";

@Controller("teams")
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) { }

  @UseGuards(JwtAuthGuard)
  @Get()
  async listTeams() {
    return this.teamsService.list();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Post("admin")
  async createTeam(@Body() dto: CreateTeamDto) {
    return this.teamsService.create(dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Patch("admin/:id")
  async renameTeam(@Param("id") id: string, @Body() dto: UpdateTeamDto) {
    return this.teamsService.rename(id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Delete("admin/:id")
  async deleteTeam(@Param("id") id: string) {
    return this.teamsService.remove(id);
  }
}
