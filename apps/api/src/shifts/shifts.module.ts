import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { resolveJwtSecret } from '../common/config/jwt-secret';
import { UsersModule } from '../users/users.module';
import { ShiftsController } from './shifts.controller';
import { ShiftsService } from './shifts.service';

@Module({
  imports: [
    UsersModule,
    JwtModule.register({
      secret: resolveJwtSecret(),
      signOptions: { expiresIn: '8h' }
    })
  ],
  controllers: [ShiftsController],
  providers: [ShiftsService],
  exports: [ShiftsService]
})
export class ShiftsModule {}
