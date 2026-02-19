import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { resolveJwtSecret } from '../common/config/jwt-secret';
import { RegistrationsController } from './registrations.controller';
import { RegistrationsService } from './registrations.service';

@Module({
  imports: [
    JwtModule.register({
      secret: resolveJwtSecret(),
      signOptions: { expiresIn: '8h' }
    })
  ],
  controllers: [RegistrationsController],
  providers: [RegistrationsService],
  exports: [RegistrationsService]
})
export class RegistrationsModule {}
