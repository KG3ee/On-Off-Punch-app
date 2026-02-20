import { IsOptional, IsString } from 'class-validator';

export class RejectDriverRequestDto {
  @IsOptional()
  @IsString()
  adminNote?: string;
}
