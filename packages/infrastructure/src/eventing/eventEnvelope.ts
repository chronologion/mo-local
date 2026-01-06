export type EventEnvelopeMeta = Readonly<{
  eventId: string;
  eventType: string;
  occurredAt: number;
  actorId: string | null;
  causationId: string | null;
  correlationId: string | null;
}>;

export type EventEnvelope = Readonly<{
  envelopeVersion: number;
  meta: EventEnvelopeMeta;
  payload: Readonly<{
    payloadVersion: number;
    data: unknown;
  }>;
}>;

type EnvelopeParseResult = Readonly<{
  envelopeVersion: number;
  meta: EventEnvelopeMeta;
  payloadVersion: number;
  data: unknown;
}>;

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const isNullableString = (value: unknown): value is string | null => value === null || typeof value === 'string';

export function encodeEventEnvelope(envelope: EventEnvelope): Uint8Array {
  const payload = {
    envelopeVersion: envelope.envelopeVersion,
    meta: {
      eventId: envelope.meta.eventId,
      eventType: envelope.meta.eventType,
      occurredAt: envelope.meta.occurredAt,
      actorId: envelope.meta.actorId,
      causationId: envelope.meta.causationId,
      correlationId: envelope.meta.correlationId,
    },
    payload: {
      payloadVersion: envelope.payload.payloadVersion,
      data: envelope.payload.data,
    },
  };
  return new TextEncoder().encode(JSON.stringify(payload));
}

export function decodeEventEnvelope(bytes: Uint8Array): EnvelopeParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid JSON payload';
    throw new Error(`Malformed event envelope: ${message}`);
  }

  if (!isObject(parsed)) {
    throw new Error('Malformed event envelope: expected envelope object');
  }

  const envelopeVersion = parsed.envelopeVersion;
  if (typeof envelopeVersion !== 'number' || !Number.isInteger(envelopeVersion) || envelopeVersion < 1) {
    throw new Error('Malformed event envelope: invalid envelopeVersion');
  }

  const meta = parsed.meta;
  if (!isObject(meta)) {
    throw new Error('Malformed event envelope: missing meta');
  }

  const eventId = meta.eventId;
  if (typeof eventId !== 'string' || eventId.length === 0) {
    throw new Error('Malformed event envelope: invalid meta.eventId');
  }

  const eventType = meta.eventType;
  if (typeof eventType !== 'string' || eventType.length === 0) {
    throw new Error('Malformed event envelope: invalid meta.eventType');
  }

  const occurredAt = meta.occurredAt;
  if (typeof occurredAt !== 'number' || !Number.isFinite(occurredAt)) {
    throw new Error('Malformed event envelope: invalid meta.occurredAt');
  }

  const actorId = meta.actorId;
  if (!isNullableString(actorId)) {
    throw new Error('Malformed event envelope: invalid meta.actorId');
  }

  const causationId = meta.causationId;
  if (!isNullableString(causationId)) {
    throw new Error('Malformed event envelope: invalid meta.causationId');
  }

  const correlationId = meta.correlationId;
  if (!isNullableString(correlationId)) {
    throw new Error('Malformed event envelope: invalid meta.correlationId');
  }

  const payload = parsed.payload;
  if (!isObject(payload)) {
    throw new Error('Malformed event envelope: missing payload');
  }

  const payloadVersion = payload.payloadVersion;
  if (typeof payloadVersion !== 'number' || !Number.isInteger(payloadVersion) || payloadVersion < 1) {
    throw new Error('Malformed event envelope: invalid payloadVersion');
  }

  if (!('data' in payload)) {
    throw new Error('Malformed event envelope: missing data');
  }

  return {
    envelopeVersion,
    meta: {
      eventId,
      eventType,
      occurredAt,
      actorId,
      causationId,
      correlationId,
    },
    payloadVersion,
    data: payload.data,
  };
}
