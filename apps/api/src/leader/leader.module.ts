import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { resolveJwtSecret } from '../common/config/jwt-secret';
import { LeaderController } from './leader.controller';
import { LeaderService } from './leader.service';

@Module({
  imports: [
    JwtModule.register({
      secret: resolveJwtSecret(),
      signOptions: { expiresIn: '8h' }
    })
  ],
  controllers: [LeaderController],
  providers: [LeaderService],
  exports: [LeaderService]
})
export class LeaderModule {}
