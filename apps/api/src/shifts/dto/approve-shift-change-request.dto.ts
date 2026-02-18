import { IsOptional, IsString } from 'class-validator';

export class ApproveShiftChangeRequestDto {
  @IsOptional()
  @IsString()
  targetPresetId?: string;
}
