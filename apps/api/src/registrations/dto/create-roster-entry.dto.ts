import { IsBoolean, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

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
  @IsBoolean()
  isActive?: boolean;
}
