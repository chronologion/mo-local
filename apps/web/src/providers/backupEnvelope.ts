import { z } from 'zod';

type JsonObject = Record<string, unknown>;

const envelopeSchema = z.object({
  cipher: z.string().min(1),
  salt: z.string().optional(),
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
  const parsed = JSON.parse(backup, (key, value) =>
    POLLUTION_KEYS.has(key) ? undefined : value
  );
  return sanitizeValue(parsed);
};

export type BackupEnvelope = z.infer<typeof envelopeSchema>;

// Parses user-supplied backups while stripping prototype-pollution vectors
// before schema validation runs.
export const parseBackupEnvelope = (backup: string): BackupEnvelope => {
  try {
    const sanitized = parseAndSanitizeJson(backup);
    return envelopeSchema.parse(sanitized);
  } catch {
    return envelopeSchema.parse({ cipher: backup.trim() });
  }
};
