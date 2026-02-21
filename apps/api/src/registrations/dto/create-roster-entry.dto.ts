import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { Role } from '@prisma/client';

export class CreateRosterEntryDto {
  @IsString()
  @IsNotEmpty()
  staffCode!: string;

  @IsOptional()
  @IsString()
  defaultTeamId?: string;

  @IsOptional()
  @IsEnum(Role)
  defaultRole?: Role;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
