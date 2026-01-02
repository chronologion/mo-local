export type SnapshotEnvelope = Readonly<{
  snapshotVersion: number;
  data: unknown;
}>;

type EnvelopeParseResult = Readonly<{
  snapshotVersion: number;
  data: unknown;
}>;

const isEnvelopeObject = (value: unknown): value is { snapshotVersion?: unknown; data?: unknown } =>
  typeof value === 'object' && value !== null;

export function encodeSnapshotEnvelope(envelope: SnapshotEnvelope): Uint8Array {
  const payload = {
    snapshotVersion: envelope.snapshotVersion,
    data: envelope.data,
  };
  return new TextEncoder().encode(JSON.stringify(payload));
}

export function decodeSnapshotEnvelope(bytes: Uint8Array): EnvelopeParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid JSON payload';
    throw new Error(`Malformed snapshot envelope: ${message}`);
  }

  if (!isEnvelopeObject(parsed)) {
    throw new Error('Malformed snapshot envelope: expected envelope object');
  }

  const snapshotVersion = parsed.snapshotVersion;
  if (typeof snapshotVersion !== 'number' || !Number.isInteger(snapshotVersion) || snapshotVersion < 1) {
    throw new Error('Malformed snapshot envelope: invalid snapshotVersion');
  }

  if (!('data' in parsed)) {
    throw new Error('Malformed snapshot envelope: missing data');
  }

  return { snapshotVersion, data: parsed.data };
}
