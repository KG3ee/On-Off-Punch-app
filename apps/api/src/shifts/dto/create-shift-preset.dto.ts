import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  ValidateNested
} from 'class-validator';

export class CreateShiftSegmentDto {
  @IsInt()
  segmentNo!: number;

  @IsString()
  @Matches(/^\d{2}:\d{2}$/)
  startTime!: string;

  @IsString()
  @Matches(/^\d{2}:\d{2}$/)
  endTime!: string;

  @IsOptional()
  @IsBoolean()
  crossesMidnight?: boolean;

  @IsOptional()
  @IsInt()
  lateGraceMinutes?: number;
}

export class CreateShiftPresetDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  teamId?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ValidateNested({ each: true })
  @Type(() => CreateShiftSegmentDto)
  @ArrayMinSize(1)
  segments!: CreateShiftSegmentDto[];
}
