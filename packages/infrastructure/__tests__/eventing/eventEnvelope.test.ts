import { describe, expect, it } from 'vitest';
import { decodeEventEnvelope, encodeEventEnvelope } from '../../src/eventing/eventEnvelope';

describe('eventEnvelope', () => {
  it('round-trips envelope encode/decode', () => {
    const bytes = encodeEventEnvelope({
      envelopeVersion: 1,
      meta: {
        eventId: 'event-1',
        eventType: 'GoalCreated',
        occurredAt: 123,
        actorId: 'actor-1',
        causationId: null,
        correlationId: 'corr-1',
      },
      payload: {
        payloadVersion: 2,
        data: { title: 'Hello' },
      },
    });

    expect(decodeEventEnvelope(bytes)).toEqual({
      envelopeVersion: 1,
      meta: {
        eventId: 'event-1',
        eventType: 'GoalCreated',
        occurredAt: 123,
        actorId: 'actor-1',
        causationId: null,
        correlationId: 'corr-1',
      },
      payloadVersion: 2,
      data: { title: 'Hello' },
    });
  });

  it('rejects missing meta', () => {
    const bytes = new TextEncoder().encode(
      JSON.stringify({
        envelopeVersion: 1,
        payload: { payloadVersion: 1, data: {} },
      })
    );
    expect(() => decodeEventEnvelope(bytes)).toThrow(/meta/i);
  });
});
