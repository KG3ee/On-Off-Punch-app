import { RegistrationRequestStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

export class ListRegistrationRequestsDto {
  @IsOptional()
  @IsEnum(RegistrationRequestStatus)
  status?: RegistrationRequestStatus;
}
