import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { Role } from '@prisma/client';

export class ApproveRegistrationRequestDto {
  @IsOptional()
  @IsString()
  teamId?: string;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @IsOptional()
  @IsString()
  reviewNote?: string;

  @IsOptional()
  @IsBoolean()
  mustChangePassword?: boolean;
}
