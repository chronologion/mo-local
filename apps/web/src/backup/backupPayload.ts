import { z } from 'zod';

export type BackupPayloadIdentityKeys = Readonly<{
  signingPrivateKey: string;
  signingPublicKey: string;
  encryptionPrivateKey: string;
  encryptionPublicKey: string;
}>;

export type BackupPayload = Readonly<{
  version?: number;
  userId: string;
  identityKeys: BackupPayloadIdentityKeys | null;
  exportedAt: string;
  aggregateKeys?: Record<string, string>;
}>;

const identitySchema = z.object({
  signingPrivateKey: z.string().min(1),
  signingPublicKey: z.string().min(1),
  encryptionPrivateKey: z.string().min(1),
  encryptionPublicKey: z.string().min(1),
});

const payloadSchema = z.object({
  version: z.number().int().optional(),
  userId: z.uuid(),
  identityKeys: identitySchema.nullable(),
  exportedAt: z.string().optional().default(''),
  aggregateKeys: z.record(z.string(), z.string().min(1)).optional().default({}),
});

export type ParsedBackupPayload = Readonly<{
  version?: number;
  userId: string;
  identityKeys: BackupPayloadIdentityKeys | null;
  exportedAt: string;
  aggregateKeys: Record<string, string>;
}>;

export const parseBackupPayload = (value: unknown): ParsedBackupPayload => {
  const parsed = payloadSchema.parse(value);
  return {
    version: parsed.version,
    userId: parsed.userId,
    identityKeys: parsed.identityKeys,
    exportedAt: parsed.exportedAt,
    aggregateKeys: parsed.aggregateKeys,
  };
};

export const createBackupPayloadV2 = (params: {
  userId: string;
  identityKeys: BackupPayloadIdentityKeys;
  exportedAt: string;
}): BackupPayload => {
  return {
    version: 2,
    userId: params.userId,
    identityKeys: params.identityKeys,
    exportedAt: params.exportedAt,
  };
};
