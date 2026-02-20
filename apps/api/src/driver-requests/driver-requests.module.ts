import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { resolveJwtSecret } from '../common/config/jwt-secret';
import { DriverRequestsController } from './driver-requests.controller';
import { DriverRequestsService } from './driver-requests.service';

@Module({
  imports: [
    JwtModule.register({
      secret: resolveJwtSecret(),
      signOptions: { expiresIn: '8h' }
    })
  ],
  controllers: [DriverRequestsController],
  providers: [DriverRequestsService],
  exports: [DriverRequestsService]
})
export class DriverRequestsModule {}
