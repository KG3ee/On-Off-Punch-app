import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { Role } from '@prisma/client';

export class CreateRosterEntryDto {
  @IsString()
  @IsNotEmpty()
  staffCode!: string;

  @IsString()
  @IsNotEmpty()
  firstName!: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsString()
  @IsNotEmpty()
  displayName!: string;

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
