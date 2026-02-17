import { IsDateString, IsOptional, IsString } from "class-validator";

export class PunchDto {
  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsDateString()
  clientTimestamp?: string;
}
