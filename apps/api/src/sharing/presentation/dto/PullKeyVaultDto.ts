import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

export class PullKeyVaultDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  since?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}
