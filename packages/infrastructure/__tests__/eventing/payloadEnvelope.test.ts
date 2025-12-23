import { describe, expect, it } from 'vitest';
import {
  decodePayloadEnvelope,
  encodePayloadEnvelope,
} from '../../src/eventing/payloadEnvelope';

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

  it('handles legacy payloads without envelope', () => {
    const legacy = new TextEncoder().encode(
      JSON.stringify({ alpha: 1, beta: 2 })
    );
    const decoded = decodePayloadEnvelope(legacy);
    expect(decoded.payloadVersion).toBe(1);
    expect(decoded.data).toEqual({ alpha: 1, beta: 2 });
  });
});
