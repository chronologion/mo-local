import { IsArray, IsInt, IsString, Matches, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

class PushEventDto {
  @IsString()
  eventId!: string;

  @IsString()
  recordJson!: string;
}

export class PushEventsDto {
  @IsString()
  @Matches(UUID_V4_REGEX, { message: 'storeId must be a UUIDv4' })
  storeId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedHead!: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PushEventDto)
  events!: PushEventDto[];
}
