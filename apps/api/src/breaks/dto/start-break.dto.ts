import { IsNotEmpty, IsString } from 'class-validator';

export class StartBreakDto {
  @IsString()
  @IsNotEmpty()
  code!: string;
}
