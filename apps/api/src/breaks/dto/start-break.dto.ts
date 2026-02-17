import { IsDateString, IsNotEmpty, IsOptional, IsString } from "class-validator";

export class StartBreakDto {
  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsOptional()
  @IsDateString()
  clientTimestamp?: string;
}
