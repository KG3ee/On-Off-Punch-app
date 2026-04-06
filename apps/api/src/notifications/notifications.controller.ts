import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CsrfGuard } from '../common/guards/csrf.guard';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { CreateSubscriptionDto, DeleteSubscriptionDto } from './dto/create-subscription.dto';
import { ListNotificationsDto } from './dto/list-notifications.dto';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard, CsrfGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post('subscriptions')
  async saveSubscription(@CurrentUser() authUser: AuthUser, @Body() dto: CreateSubscriptionDto) {
    return this.notificationsService.saveSubscription(authUser.sub, dto);
  }

  @Delete('subscriptions')
  async deleteSubscription(@CurrentUser() authUser: AuthUser, @Body() dto: DeleteSubscriptionDto) {
    return this.notificationsService.removeSubscription(authUser.sub, dto.endpoint);
  }

  @Get()
  async listNotifications(@CurrentUser() authUser: AuthUser, @Query() query: ListNotificationsDto) {
    return this.notificationsService.listNotifications(authUser.sub, query);
  }

  @Get('unread-count')
  async getUnreadCount(@CurrentUser() authUser: AuthUser) {
    return this.notificationsService.getUnreadCount(authUser.sub);
  }

  @Post(':id/read')
  async markRead(@CurrentUser() authUser: AuthUser, @Param('id') id: string) {
    return this.notificationsService.markRead(authUser.sub, id);
  }

  @Post('read-all')
  async markReadAll(@CurrentUser() authUser: AuthUser) {
    return this.notificationsService.markReadAll(authUser.sub);
  }
}
