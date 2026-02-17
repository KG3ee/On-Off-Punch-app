import { IsOptional, IsString } from "class-validator";

export class PunchDto {
  @IsOptional()
  @IsString()
  note?: string;
}
