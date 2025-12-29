import { describe, expect, it } from 'vitest';
import { PlatformErrorCodes } from '@mo/eventstore-core';
import {
  extractTableNames,
  normalizeSqliteValue,
  toPlatformError,
} from '../src/worker/sqlite';

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
    expect(
      extractTableNames('CREATE TABLE IF NOT EXISTS foo (id integer)')
    ).toEqual(['FOO']);
    expect(extractTableNames('DROP TABLE IF EXISTS bar')).toEqual(['BAR']);
  });

  it('normalizes sqlite values', () => {
    expect(normalizeSqliteValue('text')).toBe('text');
    expect(normalizeSqliteValue(42)).toBe(42);
    expect(normalizeSqliteValue(null)).toBeNull();
    expect(normalizeSqliteValue(new Uint8Array([1, 2]))).toEqual(
      new Uint8Array([1, 2])
    );
    expect(normalizeSqliteValue([4, 5, 6])).toEqual(new Uint8Array([4, 5, 6]));
    expect(normalizeSqliteValue(BigInt(12))).toBe(12);
    expect(() =>
      normalizeSqliteValue(BigInt(Number.MAX_SAFE_INTEGER) + 1n)
    ).toThrow('SQLite integer exceeds JS safe integer range');
    expect(() => normalizeSqliteValue({})).toThrow(
      'Unsupported SQLite value type: object'
    );
  });

  it('maps sqlite errors to platform errors', () => {
    const constraintError = new Error('dup') as Error & { code?: string };
    constraintError.code = 'SQLITE_CONSTRAINT_UNIQUE';
    expect(toPlatformError(constraintError)).toEqual({
      code: PlatformErrorCodes.ConstraintViolationError,
      message: 'dup',
    });
    const busyError = new Error('busy') as Error & { code?: string };
    busyError.code = 'SQLITE_BUSY';
    expect(toPlatformError(busyError)).toEqual({
      code: PlatformErrorCodes.DbLockedError,
      message: 'busy',
    });
    const lockedError = new Error('locked') as Error & { code?: string };
    lockedError.code = 'SQLITE_LOCKED';
    expect(toPlatformError(lockedError)).toEqual({
      code: PlatformErrorCodes.DbLockedError,
      message: 'locked',
    });
    const abortError = new Error('aborted') as Error & { code?: string };
    abortError.code = 'SQLITE_ABORT';
    expect(toPlatformError(abortError)).toEqual({
      code: PlatformErrorCodes.TransactionAbortedError,
      message: 'aborted',
    });
    expect(toPlatformError(new Error('no code'))).toEqual({
      code: PlatformErrorCodes.WorkerProtocolError,
      message: 'no code',
    });
  });
});
