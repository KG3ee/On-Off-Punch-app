
import { ShiftRequestType } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';

export class CreateShiftChangeRequestDto {
  @IsOptional()
  @IsString()
  shiftPresetId?: string;

  @IsOptional()
  @IsEnum(ShiftRequestType)
  requestType?: ShiftRequestType;

  @IsDateString()
  requestedDate!: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
