import { IsDateString, IsOptional, IsString } from 'class-validator';

export class CreateDriverRequestDto {
  @IsDateString()
  requestedDate!: string;

  @IsString()
  requestedTime!: string;

  @IsString()
  destination!: string;

  @IsOptional()
  @IsString()
  purpose?: string;
}
