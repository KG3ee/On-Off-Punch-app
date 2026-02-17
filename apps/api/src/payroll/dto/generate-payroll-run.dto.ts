import { IsDateString, IsOptional, IsString } from "class-validator";

export class GeneratePayrollRunDto {
  @IsDateString()
  localDateFrom!: string;

  @IsDateString()
  localDateTo!: string;

  @IsOptional()
  @IsString()
  teamId?: string;

  @IsOptional()
  @IsString()
  salaryRuleId?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
