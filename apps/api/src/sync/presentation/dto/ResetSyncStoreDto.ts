import { IsString, Matches } from 'class-validator';

const UUID_V7_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class ResetSyncStoreDto {
  @IsString()
  @Matches(UUID_V7_REGEX, { message: 'storeId must be a UUIDv7' })
  storeId!: string;
}
