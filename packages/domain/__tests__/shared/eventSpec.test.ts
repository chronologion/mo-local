import { describe, expect, it } from 'vitest';
import { numberField, nullable, stringField, voNumber, voString } from '../../src/shared/eventSpec';

type StubStringVO = { readonly value: string };
type StubNumberVO = { readonly value: number };

const makeStringVO = (value: string): StubStringVO => ({ value });
const makeNumberVO = (value: number): StubNumberVO => ({ value });

describe('eventSpec field mappers', () => {
  it('voString encodes and decodes', () => {
    const mapper = voString(makeStringVO);
    const input = makeStringVO('hello');
    expect(mapper.encode(input)).toBe('hello');
    expect(mapper.decode('world')).toEqual(makeStringVO('world'));
  });

  it('voString rejects non-strings', () => {
    const mapper = voString(makeStringVO);
    expect(() => mapper.decode(123)).toThrowError('Expected string');
  });

  it('voNumber encodes and decodes', () => {
    const mapper = voNumber(makeNumberVO);
    const input = makeNumberVO(42);
    expect(mapper.encode(input)).toBe(42);
    expect(mapper.decode(7)).toEqual(makeNumberVO(7));
  });

  it('voNumber rejects non-finite numbers', () => {
    const mapper = voNumber(makeNumberVO);
    expect(() => mapper.decode('1')).toThrowError('Expected finite number');
    expect(() => mapper.decode(Number.NaN)).toThrowError('Expected finite number');
    expect(() => mapper.decode(Number.POSITIVE_INFINITY)).toThrowError('Expected finite number');
  });

  it('stringField round-trips', () => {
    const mapper = stringField();
    expect(mapper.encode('abc')).toBe('abc');
    expect(mapper.decode('def')).toBe('def');
  });

  it('numberField round-trips', () => {
    const mapper = numberField();
    expect(mapper.encode(123)).toBe(123);
    expect(mapper.decode(456)).toBe(456);
  });

  it('nullable wraps inner mapper', () => {
    const mapper = nullable(stringField());
    expect(mapper.encode(null)).toBeNull();
    expect(mapper.decode(null)).toBeNull();
    expect(mapper.encode('ok')).toBe('ok');
    expect(mapper.decode('ok')).toBe('ok');
  });
});
