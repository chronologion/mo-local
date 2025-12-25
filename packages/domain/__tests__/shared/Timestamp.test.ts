import { describe, expect, it } from 'vitest';
import { Timestamp } from '../../src/shared/vos/Timestamp';

describe('Timestamp', () => {
  it('creates from millis and exposes value', () => {
    const ts = Timestamp.fromMillis(1_700_000_000_000);
    expect(ts.value).toBe(1_700_000_000_000);
  });

  it('rejects non-finite millis', () => {
    expect(() => Timestamp.fromMillis(Number.NaN)).toThrow(
      'Timestamp must be a finite number of milliseconds'
    );
    expect(() => Timestamp.fromMillis(Number.POSITIVE_INFINITY)).toThrow(
      'Timestamp must be a finite number of milliseconds'
    );
  });

  it('creates from ISO string and Date', () => {
    const iso = '2025-01-02T03:04:05.000Z';
    const fromIso = Timestamp.fromISOString(iso);
    const fromDate = Timestamp.fromDate(new Date(iso));
    expect(fromIso.toISOString()).toBe(iso);
    expect(fromDate.toISOString()).toBe(iso);
  });

  it('rejects invalid ISO/date', () => {
    expect(() => Timestamp.fromISOString('invalid')).toThrow(
      'Timestamp is not a valid ISO date'
    );
    expect(() => Timestamp.fromDate(new Date('invalid'))).toThrow(
      'Timestamp is not a valid date'
    );
  });

  it('compares timestamps', () => {
    const a = Timestamp.fromMillis(1);
    const b = Timestamp.fromMillis(2);
    expect(a.isBefore(b)).toBe(true);
    expect(b.isAfter(a)).toBe(true);
    expect(a.equals(Timestamp.fromMillis(1))).toBe(true);
  });

  it('converts to Date and string', () => {
    const ts = Timestamp.fromMillis(1_700_000_000_000);
    expect(ts.toDate().getTime()).toBe(1_700_000_000_000);
    expect(ts.toString()).toBe(ts.toISOString());
  });
});
