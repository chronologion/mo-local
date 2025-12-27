import { describe, expect, it } from 'vitest';
import { Month } from '../../src/goals/vos/Month';

describe('Month', () => {
  it('parses from canonical string', () => {
    const month = Month.from('2025-04');
    expect(month.year).toBe(2025);
    expect(month.month).toBe(4);
    expect(month.value).toBe('2025-04');
  });

  it('rejects invalid format', () => {
    expect(() => Month.from('2025-4')).toThrow();
    expect(() => Month.from('bad')).toThrow();
  });

  it('creates from components', () => {
    const month = Month.fromComponents(2026, 12);
    expect(month.value).toBe('2026-12');
  });

  it('compares months', () => {
    const a = Month.from('2025-01');
    const b = Month.from('2025-02');
    const c = Month.from('2026-01');
    expect(a.isBefore(b)).toBe(true);
    expect(b.isAfter(a)).toBe(true);
    expect(b.isBefore(c)).toBe(true);
    expect(a.isSameAs(Month.from('2025-01'))).toBe(true);
  });

  it('adds and subtracts months across years', () => {
    const start = Month.from('2024-10');
    expect(start.addMonths(3).value).toBe('2025-01');
    expect(start.addMonths(-2).value).toBe('2024-08');
  });

  it('rejects invalid components', () => {
    expect(() => Month.fromComponents(1999, 1)).toThrow();
    expect(() => Month.fromComponents(2025, 0)).toThrow();
    expect(() => Month.fromComponents(2025, 13)).toThrow();
  });
});
