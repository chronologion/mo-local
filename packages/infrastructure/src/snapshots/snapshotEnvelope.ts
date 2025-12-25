export type SnapshotEnvelope = Readonly<{
  snapshotVersion: number;
  data: unknown;
}>;

type EnvelopeParseResult = Readonly<{
  snapshotVersion: number;
  data: unknown;
}>;

const isEnvelopeObject = (
  value: unknown
): value is { snapshotVersion?: unknown; data?: unknown } =>
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
    const message =
      error instanceof Error ? error.message : 'Invalid JSON payload';
    throw new Error(`Malformed snapshot envelope: ${message}`);
  }

  if (!isEnvelopeObject(parsed)) {
    return { snapshotVersion: 1, data: parsed };
  }

  const snapshotVersion =
    typeof parsed.snapshotVersion === 'number' ? parsed.snapshotVersion : 1;
  const data = parsed.data !== undefined ? parsed.data : parsed;

  return { snapshotVersion, data };
}
