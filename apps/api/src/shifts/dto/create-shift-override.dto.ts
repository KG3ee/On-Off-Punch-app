import { AssignmentTargetType } from "@prisma/client";
import { IsDateString, IsEnum, IsOptional, IsString } from "class-validator";

export class CreateShiftOverrideDto {
  @IsEnum(AssignmentTargetType)
  targetType!: AssignmentTargetType;

  @IsString()
  targetId!: string;

  @IsString()
  shiftPresetId!: string;

  @IsDateString()
  overrideDate!: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
