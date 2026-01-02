import { describe, expect, it } from 'vitest';
import { decodePayloadEnvelope, encodePayloadEnvelope } from '../../src/eventing/payloadEnvelope';

describe('payloadEnvelope', () => {
  it('round-trips payload envelope', () => {
    const bytes = encodePayloadEnvelope({
      payloadVersion: 3,
      data: { a: 1, b: 'two' },
    });
    const decoded = decodePayloadEnvelope(bytes);
    expect(decoded).toEqual({
      payloadVersion: 3,
      data: { a: 1, b: 'two' },
    });
  });

  it('rejects payloads without envelope', () => {
    const legacy = new TextEncoder().encode(JSON.stringify({ alpha: 1, beta: 2 }));
    expect(() => decodePayloadEnvelope(legacy)).toThrow(/payload envelope/i);
  });
});
