import { BreakDeductionMode } from "@prisma/client";
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from "class-validator";

export class CreateSalaryRuleDto {
  @IsString()
  name!: string;

  @IsNumber()
  @Min(0)
  baseHourlyRate!: number;

  @IsNumber()
  @Min(1)
  overtimeMultiplier!: number;

  @IsNumber()
  @Min(0)
  latePenaltyPerMinute!: number;

  @IsOptional()
  @IsEnum(BreakDeductionMode)
  breakDeductionMode?: BreakDeductionMode;

  @IsDateString()
  effectiveFrom!: string;

  @IsOptional()
  @IsDateString()
  effectiveTo?: string;
}
