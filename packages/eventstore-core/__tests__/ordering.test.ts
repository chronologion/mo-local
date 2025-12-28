import { describe, expect, it } from 'vitest';
import {
  compareCommitCursor,
  compareEffectiveCursor,
  commitCursorFromRecord,
  advanceEffectiveCursor,
  CursorComparisons,
  type CommitCursor,
  type EffectiveCursor,
  type EventRecord,
} from '../src';

const baseRecord: EventRecord = {
  id: 'evt-1',
  aggregateId: 'agg-1',
  eventType: 'EventType',
  payload: new Uint8Array([1, 2, 3]),
  version: 1,
  occurredAt: 123,
  actorId: null,
  causationId: null,
  correlationId: null,
  epoch: null,
  keyringUpdate: null,
  commitSequence: 10,
  globalSequence: 20,
};

describe('compareCommitCursor', () => {
  it('orders by commitSequence', () => {
    const a: CommitCursor = { commitSequence: 1, eventId: 'a', version: 1 };
    const b: CommitCursor = { commitSequence: 2, eventId: 'a', version: 1 };
    expect(compareCommitCursor(a, b)).toBe(CursorComparisons.before);
    expect(compareCommitCursor(b, a)).toBe(CursorComparisons.after);
  });

  it('orders by eventId when commitSequence matches', () => {
    const a: CommitCursor = { commitSequence: 5, eventId: 'a', version: 1 };
    const b: CommitCursor = { commitSequence: 5, eventId: 'b', version: 1 };
    expect(compareCommitCursor(a, b)).toBe(CursorComparisons.before);
  });

  it('orders by version when commitSequence and eventId match', () => {
    const a: CommitCursor = { commitSequence: 5, eventId: 'a', version: 1 };
    const b: CommitCursor = { commitSequence: 5, eventId: 'a', version: 2 };
    expect(compareCommitCursor(a, b)).toBe(CursorComparisons.before);
  });

  it('returns equal when all fields match', () => {
    const a: CommitCursor = { commitSequence: 5, eventId: 'a', version: 1 };
    const b: CommitCursor = { commitSequence: 5, eventId: 'a', version: 1 };
    expect(compareCommitCursor(a, b)).toBe(CursorComparisons.equal);
  });
});

describe('compareEffectiveCursor', () => {
  it('orders by globalSequence', () => {
    const a: EffectiveCursor = {
      globalSequence: 1,
      pendingCommitSequence: 10,
    };
    const b: EffectiveCursor = {
      globalSequence: 2,
      pendingCommitSequence: 0,
    };
    expect(compareEffectiveCursor(a, b)).toBe(CursorComparisons.before);
  });

  it('orders by pendingCommitSequence when globalSequence matches', () => {
    const a: EffectiveCursor = {
      globalSequence: 3,
      pendingCommitSequence: 1,
    };
    const b: EffectiveCursor = {
      globalSequence: 3,
      pendingCommitSequence: 2,
    };
    expect(compareEffectiveCursor(a, b)).toBe(CursorComparisons.before);
  });

  it('returns equal when both fields match', () => {
    const a: EffectiveCursor = {
      globalSequence: 5,
      pendingCommitSequence: 9,
    };
    const b: EffectiveCursor = {
      globalSequence: 5,
      pendingCommitSequence: 9,
    };
    expect(compareEffectiveCursor(a, b)).toBe(CursorComparisons.equal);
  });
});

describe('cursor helpers', () => {
  it('builds commit cursor from record', () => {
    expect(commitCursorFromRecord(baseRecord)).toEqual({
      commitSequence: 10,
      eventId: 'evt-1',
      version: 1,
    });
  });

  it('advances effective cursor for synced event', () => {
    const cursor: EffectiveCursor = {
      globalSequence: 5,
      pendingCommitSequence: 99,
    };
    expect(advanceEffectiveCursor(cursor, baseRecord)).toEqual({
      globalSequence: 20,
      pendingCommitSequence: 99,
    });
  });

  it('advances effective cursor for pending event', () => {
    const cursor: EffectiveCursor = {
      globalSequence: 7,
      pendingCommitSequence: 3,
    };
    const pendingRecord: EventRecord = {
      ...baseRecord,
      id: 'evt-2',
      commitSequence: 12,
      globalSequence: null,
    };
    expect(advanceEffectiveCursor(cursor, pendingRecord)).toEqual({
      globalSequence: 7,
      pendingCommitSequence: 12,
    });
  });
});
