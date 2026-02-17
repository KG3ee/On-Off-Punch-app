import { IsNotEmpty, IsOptional, IsString, Matches } from "class-validator";

export class CreateTeamDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: "shiftStartTime must be in HH:MM format" })
  shiftStartTime?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: "shiftEndTime must be in HH:MM format" })
  shiftEndTime?: string;
}
