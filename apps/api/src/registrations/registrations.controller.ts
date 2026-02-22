import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards
} from '@nestjs/common';
import { RegistrationRequestStatus, Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { ApproveRegistrationRequestDto } from './dto/approve-registration-request.dto';
import { CreateRegistrationRequestDto } from './dto/create-registration-request.dto';
import { ListRegistrationRequestsDto } from './dto/list-registration-requests.dto';
import { RejectRegistrationRequestDto } from './dto/reject-registration-request.dto';
import { RegistrationsService } from './registrations.service';

@Controller()
export class RegistrationsController {
  constructor(private readonly registrationsService: RegistrationsService) {}

  @Post('auth/register-request')
  async createRequest(@Body() dto: CreateRegistrationRequestDto) {
    return this.registrationsService.createRequest(dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Get('admin/registration-requests')
  async listRequests(@Query() query: ListRegistrationRequestsDto) {
    return this.registrationsService.listRequests(query.status as RegistrationRequestStatus | undefined);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Get('admin/registration-requests/summary')
  async getSummary() {
    return this.registrationsService.getAdminSummary();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Post('admin/registration-requests/:id/approve')
  async approveRequest(
    @Param('id') id: string,
    @Body() dto: ApproveRegistrationRequestDto,
    @CurrentUser() actor: AuthUser
  ) {
    return this.registrationsService.approveRequest(id, dto, actor.sub);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Post('admin/registration-requests/:id/reject')
  async rejectRequest(
    @Param('id') id: string,
    @Body() dto: RejectRegistrationRequestDto,
    @CurrentUser() actor: AuthUser
  ) {
    return this.registrationsService.rejectRequest(id, dto, actor.sub);
  }
}
