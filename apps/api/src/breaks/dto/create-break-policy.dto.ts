import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from "class-validator";

export class CreateBreakPolicyDto {
  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsInt()
  @Min(1)
  expectedDurationMinutes!: number;

  @IsInt()
  @Min(1)
  dailyLimit!: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
