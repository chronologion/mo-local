import { IsOptional, IsString, Matches } from 'class-validator';

export class GetScopeKeyDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d+$/, { message: 'scopeEpoch must be a valid bigint string' })
  scopeEpoch?: string; // bigint as string, if specified fetch specific epoch
}
