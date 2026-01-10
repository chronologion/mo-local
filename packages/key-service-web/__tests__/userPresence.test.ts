import { describe, expect, it } from 'vitest';
import { isUserPresenceSupported, parseUserPresencePrfOutput } from '../src/userPresence';

describe('userPresence helpers', () => {
  it('returns false when not in a browser context', () => {
    expect(isUserPresenceSupported()).toBe(false);
  });

  it('parses PRF output from results.first', () => {
    const buffer = new Uint8Array([1, 2, 3]).buffer;
    const output = parseUserPresencePrfOutput({
      prf: {
        results: {
          first: buffer,
        },
      },
    });
    expect(output).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('parses PRF output from prf.first', () => {
    const buffer = new Uint8Array([4, 5]).buffer;
    const output = parseUserPresencePrfOutput({
      prf: {
        first: buffer,
      },
    });
    expect(output).toEqual(new Uint8Array([4, 5]));
  });

  it('throws when PRF output missing', () => {
    expect(() => parseUserPresencePrfOutput({})).toThrow('PRF extension results missing');
  });
});
