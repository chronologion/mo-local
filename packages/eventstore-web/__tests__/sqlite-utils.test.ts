import { describe, expect, it } from 'vitest';
import { extractTableNames, normalizeSqliteValue } from '../src/worker/sqlite';

describe('sqlite utils', () => {
  it('extracts table names from basic DML', () => {
    expect(extractTableNames('INSERT INTO events (id) VALUES (1)')).toEqual([
      'EVENTS',
    ]);
    expect(extractTableNames('update sync_meta set value = 1')).toEqual([
      'SYNC_META',
    ]);
    expect(
      extractTableNames('DELETE FROM projection_meta WHERE key = ?')
    ).toEqual(['PROJECTION_META']);
  });

  it('normalizes sqlite values', () => {
    expect(normalizeSqliteValue('text')).toBe('text');
    expect(normalizeSqliteValue(42)).toBe(42);
    expect(normalizeSqliteValue(null)).toBeNull();
    expect(normalizeSqliteValue(new Uint8Array([1, 2]))).toEqual(
      new Uint8Array([1, 2])
    );
  });
});
