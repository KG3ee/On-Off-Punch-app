import { IsDateString, IsOptional } from "class-validator";

export class EndBreakDto {
    @IsOptional()
    @IsDateString()
    clientTimestamp?: string;
}
