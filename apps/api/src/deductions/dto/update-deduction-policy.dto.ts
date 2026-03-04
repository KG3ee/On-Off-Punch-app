import { Transform } from 'class-transformer';
import { ArrayMinSize, IsArray, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class UpdateDeductionPolicyDto {
  @IsArray()
  @ArrayMinSize(1)
  @Transform(({ value }) => {
    if (!Array.isArray(value)) return value;
    return value.map((item) => Number(item));
  })
  @IsNumber({ maxDecimalPlaces: 2 }, { each: true })
  @Min(0, { each: true })
  amountsAed!: number[];

  @IsOptional()
  @IsString()
  effectiveFromLocalDate?: string | null;
}
