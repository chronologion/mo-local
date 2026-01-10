import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateInviteDto {
  @IsString()
  @IsNotEmpty()
  recipientUserId!: string;

  @IsString()
  @IsNotEmpty()
  scopeEpoch!: string; // bigint as string

  @IsString()
  @IsNotEmpty()
  recipientUkPubFingerprint!: string; // hex-encoded

  @IsString()
  @IsNotEmpty()
  ciphersuite!: string;

  @IsString()
  @IsNotEmpty()
  ciphertext!: string; // base64-encoded

  @IsOptional()
  @IsString()
  metadata?: string; // JSON string
}
