import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { UsersModule } from '../users/users.module';
import { BreaksController } from './breaks.controller';
import { BreaksService } from './breaks.service';

@Module({
  imports: [
    UsersModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'dev-secret',
      signOptions: { expiresIn: '8h' }
    })
  ],
  controllers: [BreaksController],
  providers: [BreaksService],
  exports: [BreaksService]
})
export class BreaksModule {}
