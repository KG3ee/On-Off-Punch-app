import { IsDateString, IsOptional, IsString } from "class-validator";

export class PunchDto {
  @IsOptional()
  @IsString()
  note?: string;

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
}
