import { IsDateString, IsOptional, IsString } from "class-validator";

export class EndBreakDto {
    @IsOptional()
    @IsDateString()
    clientTimestamp?: string;

    @IsOptional()
    @IsString()
    clientActionId?: string;

    @IsOptional()
    @IsString()
    clientDeviceId?: string;

    @IsOptional()
    @IsString()
    breakSessionId?: string;

    @IsOptional()
    @IsString()
    clientBreakRef?: string;

    @IsOptional()
    @IsString()
    clientDutySessionRef?: string;
}
