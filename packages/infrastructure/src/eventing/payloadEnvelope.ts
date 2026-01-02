export type PayloadEnvelope = Readonly<{
  payloadVersion: number;
  data: unknown;
}>;

type EnvelopeParseResult = Readonly<{
  payloadVersion: number;
  data: unknown;
}>;

const isEnvelopeObject = (value: unknown): value is { payloadVersion?: unknown; data?: unknown } =>
  typeof value === 'object' && value !== null;

export function encodePayloadEnvelope(envelope: PayloadEnvelope): Uint8Array {
  const payload = {
    payloadVersion: envelope.payloadVersion,
    data: envelope.data,
  };
  return new TextEncoder().encode(JSON.stringify(payload));
}

export function decodePayloadEnvelope(bytes: Uint8Array): EnvelopeParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid JSON payload';
    throw new Error(`Malformed payload envelope: ${message}`);
  }

  if (!isEnvelopeObject(parsed)) {
    throw new Error('Malformed payload envelope: expected envelope object');
  }

  const payloadVersion = parsed.payloadVersion;
  if (typeof payloadVersion !== 'number' || !Number.isInteger(payloadVersion) || payloadVersion < 1) {
    throw new Error('Malformed payload envelope: invalid payloadVersion');
  }

  if (!('data' in parsed)) {
    throw new Error('Malformed payload envelope: missing data');
  }

  return { payloadVersion, data: parsed.data };
}
