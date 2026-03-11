import { IsDateString, IsNotEmpty, IsOptional, IsString } from "class-validator";

export class StartBreakDto {
  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsOptional()
  @IsDateString()
  clientTimestamp?: string;

  @IsOptional()
  @IsString()
  clientActionId?: string;

  @IsOptional()
  @IsString()
  clientDeviceId?: string;

  @IsOptional()
  @IsString()
  clientDutySessionRef?: string;

  @IsOptional()
  @IsString()
  dutySessionId?: string;

  @IsOptional()
  @IsString()
  clientBreakRef?: string;
}
