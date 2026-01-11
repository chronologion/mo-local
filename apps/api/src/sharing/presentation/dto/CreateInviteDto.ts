import { IsString, IsNotEmpty, IsOptional, IsJSON, Matches, MaxLength } from 'class-validator';

export class CreateInviteDto {
  @IsString()
  @IsNotEmpty()
  recipientUserId!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\d+$/, { message: 'scopeEpoch must be a valid bigint string' })
  scopeEpoch!: string; // bigint as string

  @IsString()
  @IsNotEmpty()
  @Matches(/^[0-9a-fA-F]+$/, { message: 'recipientUkPubFingerprint must be valid hex' })
  @MaxLength(128)
  recipientUkPubFingerprint!: string; // hex-encoded

  @IsString()
  @IsNotEmpty()
  ciphersuite!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^[A-Za-z0-9+/]+=*$/, { message: 'ciphertext must be valid base64' })
  @MaxLength(1048576) // 1MB base64 encoded = ~786KB actual
  ciphertext!: string; // base64-encoded

  @IsOptional()
  @IsString()
  @IsJSON()
  @MaxLength(10240) // 10KB max metadata
  metadata?: string; // JSON string
}
