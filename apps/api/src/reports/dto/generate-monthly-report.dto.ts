import { IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export class GenerateMonthlyReportDto {
  @IsInt()
  @Min(2000)
  year!: number;

  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;

  @IsOptional()
  @IsString()
  teamId?: string;
}
