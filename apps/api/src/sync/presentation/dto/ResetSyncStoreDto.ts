import { IsString, Matches } from 'class-validator';

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class ResetSyncStoreDto {
  @IsString()
  @Matches(UUID_V4_REGEX, { message: 'storeId must be a UUIDv4' })
  storeId!: string;
}
