
import { IsDateString, IsOptional, IsString } from 'class-validator';

export class CreateShiftChangeRequestDto {
    @IsString()
    shiftPresetId: string;

    @IsDateString()
    requestedDate: string;

    @IsOptional()
    @IsString()
    reason?: string;
}
