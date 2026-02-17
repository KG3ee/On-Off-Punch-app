import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { Role } from "@prisma/client";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { AuthUser } from "../common/interfaces/auth-user.interface";
import { UsersService } from "../users/users.service";
import { CreateShiftAssignmentDto } from "./dto/create-shift-assignment.dto";
import { CreateShiftOverrideDto } from "./dto/create-shift-override.dto";
import { CreateShiftPresetDto } from "./dto/create-shift-preset.dto";
import { ShiftsService } from "./shifts.service";

@Controller()
export class ShiftsController {
  constructor(
    private readonly shiftsService: ShiftsService,
    private readonly usersService: UsersService,
  ) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Get("admin/shift-presets")
  async listPresets() {
    return this.shiftsService.listPresets();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Post("admin/shift-presets")
  async createPreset(@Body() dto: CreateShiftPresetDto) {
    return this.shiftsService.createPreset(dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Post("admin/shift-assignments")
  async createAssignment(@Body() dto: CreateShiftAssignmentDto) {
    return this.shiftsService.createAssignment(dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Post("admin/shift-overrides")
  async createOverride(@Body() dto: CreateShiftOverrideDto) {
    return this.shiftsService.createOverride(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get("shifts/current")
  async getCurrentShift(@CurrentUser() authUser: AuthUser) {
    const user = await this.usersService.getOrThrow(authUser.sub);
    const resolved = await this.shiftsService.getActiveSegmentForUser(
      user,
      new Date(),
    );
    return resolved;
  }
}
