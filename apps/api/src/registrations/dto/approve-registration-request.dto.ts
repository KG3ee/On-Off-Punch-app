import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class ApproveRegistrationRequestDto {
  @IsOptional()
  @IsString()
  teamId?: string;

  @IsOptional()
  @IsString()
  reviewNote?: string;

  @IsOptional()
  @IsBoolean()
  mustChangePassword?: boolean;
}
