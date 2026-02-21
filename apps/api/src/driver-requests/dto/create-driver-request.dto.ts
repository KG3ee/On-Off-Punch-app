import { IsBoolean, IsDateString, IsOptional, IsString } from 'class-validator';

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

  @IsOptional()
  @IsBoolean()
  isRoundTrip?: boolean;

  @IsOptional()
  @IsDateString()
  returnDate?: string;

  @IsOptional()
  @IsString()
  returnTime?: string;

  @IsOptional()
  @IsString()
  returnLocation?: string;

  @IsOptional()
  @IsString()
  contactNumber?: string;
}
