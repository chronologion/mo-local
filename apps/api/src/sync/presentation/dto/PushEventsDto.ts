import {
  IsArray,
  IsDefined,
  IsInt,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

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
  storeId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PushEventDto)
  events!: PushEventDto[];
}
