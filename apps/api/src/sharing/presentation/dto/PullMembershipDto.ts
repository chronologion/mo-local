import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min, Max } from 'class-validator';

export class PullMembershipDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  since?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}
