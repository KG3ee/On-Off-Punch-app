import { IsOptional, IsString } from 'class-validator';

export class RejectRegistrationRequestDto {
  @IsOptional()
  @IsString()
  reviewNote?: string;
}
