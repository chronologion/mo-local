import { z } from 'zod';

type JsonObject = Record<string, unknown>;

const envelopeSchema = z.object({
  cipher: z.string().min(1),
  userId: z.string().uuid().optional(),
  exportedAt: z.string().optional(),
  version: z.number().int().optional(),
});

const POLLUTION_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

const sanitizeValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }

  if (value && typeof value === 'object') {
    const clean: JsonObject = Object.create(null);
    for (const [key, nestedValue] of Object.entries(value as JsonObject)) {
      if (POLLUTION_KEYS.has(key)) continue;
      clean[key] = sanitizeValue(nestedValue);
    }
    return clean;
  }

  return value;
};

const parseAndSanitizeJson = (backup: string): unknown => {
  const parsed = JSON.parse(backup, (key, value) => (POLLUTION_KEYS.has(key) ? undefined : value));
  return sanitizeValue(parsed);
};

export type KeyVaultBackupEnvelope = z.infer<typeof envelopeSchema>;

export const parseKeyVaultEnvelope = (backup: string): KeyVaultBackupEnvelope => {
  const trimmed = backup.trim();
  try {
    const sanitized = parseAndSanitizeJson(trimmed);
    return envelopeSchema.parse(sanitized);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return envelopeSchema.parse({ cipher: trimmed });
    }
    throw error;
  }
};

export const createKeyVaultEnvelope = (params: {
  cipher: string;
  userId?: string;
  exportedAt?: string;
  version?: number;
}): KeyVaultBackupEnvelope => {
  return {
    cipher: params.cipher,
    userId: params.userId,
    exportedAt: params.exportedAt,
    version: params.version,
  };
};
