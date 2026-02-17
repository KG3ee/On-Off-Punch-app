import { AssignmentTargetType } from "@prisma/client";
import { IsDateString, IsEnum, IsOptional, IsString } from "class-validator";

export class CreateShiftAssignmentDto {
  @IsEnum(AssignmentTargetType)
  targetType!: AssignmentTargetType;

  @IsString()
  targetId!: string;

  @IsString()
  shiftPresetId!: string;

  @IsDateString()
  effectiveFrom!: string;

  @IsOptional()
  @IsDateString()
  effectiveTo?: string;
}
