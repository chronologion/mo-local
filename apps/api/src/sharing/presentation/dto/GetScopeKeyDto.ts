import { IsOptional, IsString } from 'class-validator';

export class GetScopeKeyDto {
  @IsOptional()
  @IsString()
  scopeEpoch?: string; // bigint as string, if specified fetch specific epoch
}
