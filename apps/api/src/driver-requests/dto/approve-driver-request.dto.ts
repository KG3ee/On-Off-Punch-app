import { IsOptional, IsString } from 'class-validator';

export class ApproveDriverRequestDto {
  @IsOptional()
  @IsString()
  adminNote?: string;

  @IsOptional()
  @IsString()
  driverId?: string;
}
