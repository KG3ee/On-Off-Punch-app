import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { UsersService } from '../users/users.service';
import { BreaksService } from './breaks.service';
import { CreateBreakPolicyDto } from './dto/create-break-policy.dto';
import { StartBreakDto } from './dto/start-break.dto';

@Controller('breaks')
@UseGuards(JwtAuthGuard)
export class BreaksController {
  constructor(
    private readonly breaksService: BreaksService,
    private readonly usersService: UsersService
  ) {}

  @Get('policies')
  async listPolicies() {
    return this.breaksService.listPolicies();
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Post('admin/policies')
  async createPolicy(@Body() dto: CreateBreakPolicyDto) {
    return this.breaksService.createPolicy(dto);
  }

  @Post('start')
  async startBreak(@CurrentUser() authUser: AuthUser, @Body() dto: StartBreakDto) {
    const user = await this.usersService.getOrThrow(authUser.sub);
    return this.breaksService.startBreak(user, dto.code);
  }

  @Post('end')
  async endBreak(@CurrentUser() authUser: AuthUser) {
    const user = await this.usersService.getOrThrow(authUser.sub);
    return this.breaksService.endBreak(user);
  }

  @Post('cancel')
  async cancelBreak(@CurrentUser() authUser: AuthUser) {
    const user = await this.usersService.getOrThrow(authUser.sub);
    return this.breaksService.cancelBreak(user);
  }
}
