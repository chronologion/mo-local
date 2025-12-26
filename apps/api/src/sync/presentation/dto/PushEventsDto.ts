import {
  IsArray,
  IsDefined,
  IsInt,
  IsString,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

const UUID_V7_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

class PushEventDto {
  @IsString()
  name!: string;

  @IsDefined()
  args!: unknown;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  seqNum!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  parentSeqNum!: number;

  @IsString()
  clientId!: string;

  @IsString()
  sessionId!: string;
}

export class PushEventsDto {
  @IsString()
  @Matches(UUID_V7_REGEX, { message: 'storeId must be a UUIDv7' })
  storeId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PushEventDto)
  events!: PushEventDto[];
}
